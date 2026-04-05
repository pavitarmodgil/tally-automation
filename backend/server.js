/**
 * server.js
 * Express API server for Tally Automation System
 *
 * Route map:
 *   GET  /health                  → liveness probe (no auth)
 *   POST /api/auth/login          → admin login → returns JWT (rate-limited: 5/15min)
 *
 *   GET  /api/customers           → list all customers           [admin JWT required]
 *   GET  /api/customers/:phone    → single customer for order form (public, but checks linkUsed)
 *   GET  /api/items               → list all catalog items       (public)
 *
 *   POST /api/orders              → customer submits an order    (public, rate-limited: 10/hr)
 *   GET  /api/orders              → all orders for admin panel   [admin JWT required]
 *   GET  /api/orders/:id          → single order detail          [admin JWT required]
 *   POST /api/orders/:id/send     → push XML to Tally            [admin JWT required]
 *
 * Auth design: stateless JWT (8h expiry). No session store needed.
 * Error design: asyncHandler forwards all thrown/rejected errors to errorHandler middleware.
 */

require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const mongoose  = require("mongoose");
const fs        = require("fs");
const path      = require("path");
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcrypt");
const rateLimit = require("express-rate-limit");

// ── Internal modules ────────────────────────────────────────────────────────
const { calculateItem, calculateTotals } = require("./src/calculator");
const { buildVoucherXML }               = require("./src/xmlBuilder");
const whatsappRouter                    = require("./src/whatsapp");
const { verifyToken }                   = require("./src/middleware/auth");
const { validate }                      = require("./src/middleware/validate");
const { orderSchema }                   = require("./src/validators/orderValidator");
const errorHandler                      = require("./src/middleware/errorHandler");
const Customer                          = require("./src/models/Customer");
const Item                              = require("./src/models/Item");
const logger                            = require("./src/logger");

// ── asyncHandler ────────────────────────────────────────────────────────────
// Wraps async route handlers so any thrown/rejected error is forwarded to
// the global errorHandler instead of crashing the process with an unhandled rejection.
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── App ─────────────────────────────────────────────────────────────────────
const app = express();

// CORS: only the configured frontend origin is allowed.
// Trim FRONTEND_URL because .env values can have accidental leading spaces.
app.use(cors({
  origin:         (process.env.FRONTEND_URL || "http://localhost:5173").trim(),
  methods:        ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Rate limiters ────────────────────────────────────────────────────────────
// generalLimiter: applied globally — protects all routes from scraping/DoS
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max:      100,
  message:  { error: "Too many requests, please try again later." },
});

// authLimiter: prevents brute-forcing the admin password
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      5,
  message:  { error: "Too many login attempts. Please wait 15 minutes." },
});

// orderLimiter: prevents a single customer link from being spammed
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max:      10,
  message:  { error: "Too many orders submitted. Please try again later." },
});

app.use(generalLimiter);

// ── WhatsApp webhook (Twilio) ────────────────────────────────────────────────
app.use("/whatsapp", whatsappRouter);

// ── MongoDB: Order schema ────────────────────────────────────────────────────
const orderDbSchema = new mongoose.Schema({
  customer:      { type: String, required: true },
  phone:         { type: String, required: true },
  items: [
    {
      name:       String,
      qty:        Number,
      finalPrice: Number,     // GST-inclusive price per unit, as entered by customer
    }
  ],
  status:        { type: String, default: "pending" },   // pending | sent

  // Task 1 — One-time order link
  // Set to true immediately after the customer places an order.
  // GET /api/customers/:phone returns 403 if any order for this phone has linkUsed: true,
  // preventing the same WhatsApp link from being used to submit a second order.
  linkUsed:      { type: Boolean, default: false },

  voucherNumber: { type: String },
  createdAt:     { type: Date, default: Date.now },
  sentAt:        { type: Date },
});

const Order = mongoose.model("Order", orderDbSchema);

// ── Connect to MongoDB ────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("MongoDB connected"))
  .catch(err => logger.error(`MongoDB connection error: ${err.message}`));

// ── Output directory for XML files ───────────────────────────────────────────
const OUTPUT_DIR = path.join(__dirname, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// ════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Admin submits password → receives JWT valid for 8 hours.
// ADMIN_PASSWORD_HASH is a bcrypt hash stored in .env (never the plaintext password).
// Generate it once with: node -e "require('bcrypt').hash('yourpass',10).then(console.log)"
app.post(
  "/api/auth/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });

    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) {
      logger.error("ADMIN_PASSWORD_HASH is not set in .env");
      return res.status(500).json({ error: "Server is not configured for authentication" });
    }

    const match = await bcrypt.compare(password, hash);
    if (!match) {
      logger.warn("Failed admin login attempt");
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "8h" });
    logger.info("Admin login successful");
    res.json({ token });
  })
);

// ── GET /api/customers  [protected] ──────────────────────────────────────────
// Returns all registered customers. Used by admin to browse the customer list.
app.get(
  "/api/customers",
  verifyToken,
  asyncHandler(async (req, res) => {
    const customers = await Customer.find({}, { phone: 1, name: 1, _id: 0 });
    res.json(customers);
  })
);

// ── GET /api/customers/:phone  [public] ──────────────────────────────────────
// Used by the customer order form on page load to confirm the link is valid.
// Task 1: returns 403 { error: "link_expired" } if this phone has already placed an order.
app.get(
  "/api/customers/:phone",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ phone: req.params.phone });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // One-time link check: if any order from this phone has linkUsed=true, the link is spent.
    const usedOrder = await Order.findOne({ phone: req.params.phone, linkUsed: true });
    if (usedOrder) return res.status(403).json({ error: "link_expired" });

    res.json({ phone: customer.phone, name: customer.name });
  })
);

// ── GET /api/items  [public] ──────────────────────────────────────────────────
// Returns all catalog items. Used by the customer order form to display the product list.
app.get(
  "/api/items",
  asyncHandler(async (req, res) => {
    const items = await Item.find({}, { _id: 0, __v: 0 });
    res.json(items);
  })
);

// ── POST /api/orders  [public, rate-limited] ──────────────────────────────────
// Customer submits their order. Validates with Zod before touching the DB.
// After creation, linkUsed is set to true so the same WhatsApp link cannot be reused.
app.post(
  "/api/orders",
  orderLimiter,
  validate(orderSchema),
  asyncHandler(async (req, res) => {
    const { phone, items } = req.body;

    const customer = await Customer.findOne({ phone });
    if (!customer) return res.status(404).json({ error: "Customer not found for this phone" });

    // Validate all items exist in the catalog
    for (const item of items) {
      const exists = await Item.findOne({ name: item.name });
      if (!exists) return res.status(400).json({ error: `Item "${item.name}" not found in catalog` });
    }

    // Create the order
    const order = await Order.create({ customer: customer.name, phone, items });

    // Task 1: mark link as used immediately — prevents a second submission from the same link
    order.linkUsed = true;
    await order.save();

    logger.info(`Order created — customer: ${customer.name}, phone: ${phone}, items: ${items.length}`);
    res.status(201).json({ success: true, orderId: order._id, customer: customer.name, items });
  })
);

// ── GET /api/orders  [protected] ──────────────────────────────────────────────
// Admin fetches all orders. Supports ?status=pending|sent filter.
app.get(
  "/api/orders",
  verifyToken,
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  })
);

// ── GET /api/orders/:id  [protected] ─────────────────────────────────────────
// Admin fetches a single order for detail view.
app.get(
  "/api/orders/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  })
);

// ── POST /api/orders/:id/send  [protected] ────────────────────────────────────
// Admin clicks "Send to Tally".
// Fetches item configs from DB, calculates GST, builds XML, pushes to Tally HTTP server.
app.post(
  "/api/orders/:id/send",
  verifyToken,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "sent") return res.status(400).json({ error: "Order already sent to Tally" });

    // Fetch item configs from DB and run GST calculation for each line item
    const calculatedItems = await Promise.all(
      order.items.map(async (item) => {
        const config = await Item.findOne({ name: item.name });
        if (!config) throw new Error(`Item "${item.name}" not found in catalog`);
        const result = calculateItem(item, config.gst);
        result.unit  = config.unit;   // unit is case-sensitive for Tally
        return result;
      })
    );

    const totals        = calculateTotals(calculatedItems);
    const voucherNumber = `TA-${order._id.toString().slice(-6).toUpperCase()}`;

    // TALLY_DATE is fixed in .env because TallyPrime EDU only accepts dates within
    // its active financial year. Update this when moving to a licensed version.
    const tallyDate = process.env.TALLY_DATE || "2025-04-01";

    const xml = buildVoucherXML(
      { customer: order.customer, date: tallyDate, voucherNumber },
      calculatedItems,
      totals
    );

    // Save XML to disk as a manual fallback in case the HTTP push fails
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
      logger.info(`Tally response for ${voucherNumber}: ${tallyResponseText}`);
    } catch (fetchErr) {
      logger.error(`Tally HTTP push failed: ${fetchErr.message}`);
      return res.status(503).json({
        error:        "Could not reach Tally. Make sure TallyPrime is open with HTTP server enabled on port 9000.",
        fileName,
        manualImport: `O: Import → Transactions → select ${fileName}`,
      });
    }

    // Tally returns STATUS=0 when the voucher fails business-rule validation
    if (tallyResponseText.includes("<STATUS>0</STATUS>")) {
      logger.error(`Tally rejected ${voucherNumber}: ${tallyResponseText}`);
      return res.status(422).json({
        error:         "Tally rejected the voucher. Check company name, ledger names, and date.",
        tallyResponse: tallyResponseText,
        fileName,
        manualImport:  `O: Import → Transactions → select ${fileName}`,
      });
    }

    // Mark order as sent only after Tally confirms success
    order.status        = "sent";
    order.voucherNumber = voucherNumber;
    order.sentAt        = new Date();
    await order.save();

    logger.info(`Voucher ${voucherNumber} sent successfully for ${order.customer}`);
    res.json({ success: true, voucherNumber, fileName, totals, tallyResponse: tallyResponseText });
  })
);

// ── Global error handler ──────────────────────────────────────────────────────
// MUST be registered after all routes (4-argument signature identifies it as error middleware)
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
