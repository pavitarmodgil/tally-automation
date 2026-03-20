/**
 * server.js
 * Express API server for Tally Automation System
 *
 * Routes:
 *   GET  /api/customers          → list all customers
 *   GET  /api/items              → list all items
 *   POST /api/orders             → create new order (from customer form)
 *   GET  /api/orders             → get all orders (for admin panel)
 *   GET  /api/orders/:id         → get single order
 *   POST /api/orders/:id/send    → generate XML + mark as sent (admin clicks "Send to Tally")
 */

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");

const { calculateItem, calculateTotals } = require("./src/calculator");
const { buildVoucherXML }               = require("./src/xmlBuilder");
const whatsappRouter                    = require("./src/whatsapp");


const app  = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/whatsapp", whatsappRouter);

// ─── MongoDB: Order Schema ────────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  customer: { type: String, required: true },   // "Customer A"
  phone:    { type: String, required: true },   // "9876543210"
  items: [
    {
      name:       String,
      qty:        Number,
      finalPrice: Number,                       // GST inclusive, per unit
    }
  ],
  status:        { type: String, default: "pending" },  // pending | sent
  voucherNumber: { type: String },
  createdAt:     { type: Date, default: Date.now },
  sentAt:        { type: Date },
});

const Order = mongoose.model("Order", orderSchema);

// ─── Connect to MongoDB ───────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err.message));

// ─── Load static config files ─────────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, "data");
const itemsConfig  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "items.json"), "utf8"));
const customersConfig = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "customers.json"), "utf8"));
const OUTPUT_DIR   = path.join(__dirname, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/customers
// Returns list of customers — used by order form to know who is placing order
app.get("/api/customers", (req, res) => {
  // customers.json format: { "9876543210": "Customer A" }
  const list = Object.entries(customersConfig).map(([phone, name]) => ({ phone, name }));
  res.json(list);
});

// GET /api/customers/:phone
// Returns single customer by phone — used when customer opens their unique link
app.get("/api/customers/:phone", (req, res) => {
  const name = customersConfig[req.params.phone];
  if (!name) return res.status(404).json({ error: "Customer not found" });
  res.json({ phone: req.params.phone, name });
});

// GET /api/items
// Returns all items with rate/gst/unit — used to populate order form
app.get("/api/items", (req, res) => {
  const list = Object.entries(itemsConfig).map(([name, config]) => ({
    name,
    ...config,
  }));
  res.json(list);
});

// POST /api/orders
// Customer submits their order from the form
// Body: { phone, items: [{ name, qty, finalPrice }] }
app.post("/api/orders", async (req, res) => {
  try {
    const { phone, items } = req.body;

    if (!phone) return res.status(400).json({ error: "Phone number required" });
    const customer = customersConfig[phone];
    if (!customer) return res.status(404).json({ error: "Customer not found for this phone" });
    if (!items || items.length === 0) return res.status(400).json({ error: "No items in order" });

    // Validate all items exist in config
    for (const item of items) {
      if (!itemsConfig[item.name]) {
        return res.status(400).json({ error: `Item "${item.name}" not found in config` });
      }
    }

    const order = await Order.create({ customer, phone, items });
    res.status(201).json({ success: true, orderId: order._id, customer, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders
// Admin fetches all orders, sorted newest first
// Optional query: ?status=pending
app.get("/api/orders", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
// Admin fetches one order to review details
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/send
// Admin clicks "Send to Tally"
// Calculates GST, builds XML, pushes directly to Tally HTTP server, marks order as sent
app.post("/api/orders/:id/send", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "sent") return res.status(400).json({ error: "Order already sent to Tally" });

    // Calculate GST for each item
    const calculatedItems = order.items.map((item) => {
      const config = itemsConfig[item.name];
      if (!config) throw new Error(`Item "${item.name}" not found in items.json`);
      const result = calculateItem(item, config.gst);
      result.unit = config.unit;
      return result;
    });

    const totals = calculateTotals(calculatedItems);

    // Generate voucher number
    const voucherNumber = `TA-${order._id.toString().slice(-6).toUpperCase()}`;

    // Use TALLY_DATE from .env — required for Tally EDU which only accepts dates
    // within its active financial year (e.g. 2025-04-01 to 2026-03-31).
    // Set TALLY_DATE=2025-04-01 in .env to keep all entries on a safe fixed date.
    const tallyDate = process.env.TALLY_DATE || "2025-04-01";

    // Build XML
    const xml = buildVoucherXML(
      { customer: order.customer, date: tallyDate, voucherNumber },
      calculatedItems,
      totals
    );

    // Save XML file (kept as manual fallback if Tally push fails)
    const fileName = `voucher_${order._id}.xml`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, xml, "utf8");

    // Push XML directly to Tally HTTP server
    const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
    let tallyResponseText;
    try {
      const tallyRes = await fetch(TALLY_URL, {
        method:  "POST",
        headers: { "Content-Type": "text/xml" },
        body:    xml,
      });
      tallyResponseText = await tallyRes.text();
      console.log("📦 Tally raw response:", tallyResponseText);
    } catch (fetchErr) {
      console.error("❌ Tally HTTP push failed:", fetchErr.message);
      return res.status(503).json({
        error:        "Could not reach Tally. Make sure TallyPrime is open.",
        fileName,
        manualImport: `O: Import → Transactions → select ${fileName}`,
      });
    }

    // Tally returns STATUS=0 on failure, STATUS=1 on success
    if (tallyResponseText.includes("<STATUS>0</STATUS>")) {
      console.error("❌ Tally rejected the voucher:", tallyResponseText);
      return res.status(422).json({
        error:         "Tally rejected the voucher. Check company name, ledger names, and date.",
        tallyResponse: tallyResponseText,
        fileName,
        manualImport:  `O: Import → Transactions → select ${fileName}`,
      });
    }

    // Only mark as sent after Tally confirms success
    order.status        = "sent";
    order.voucherNumber = voucherNumber;
    order.sentAt        = new Date();
    await order.save();

    res.json({
      success:       true,
      voucherNumber,
      fileName,
      totals,
      tallyResponse: tallyResponseText,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
