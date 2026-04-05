/**
 * seed.js
 * Run ONCE to migrate flat JSON files to MongoDB.
 * Safe to re-run — uses insertMany with { ordered: false } which skips
 * duplicate-key errors (existing documents are untouched).
 *
 * Usage:
 *   node src/seed.js
 *
 * Prerequisites:
 *   - MONGO_URI must be set in backend/.env
 *   - backend/data/customers.json and backend/data/items.json must exist
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");
const Customer = require("./models/Customer");
const Item     = require("./models/Item");

const DATA_DIR = path.join(__dirname, "../data");

async function seed() {
  console.log("🌱 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected\n");

  // ── Seed Customers ──────────────────────────────────────────────────────
  // customers.json format: { "phoneNumber": "Customer Name", ... }
  const customersRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "customers.json"), "utf8")
  );
  const customerDocs = Object.entries(customersRaw).map(([phone, name]) => ({ phone, name }));

  try {
    const result = await Customer.insertMany(customerDocs, { ordered: false });
    console.log(`✅ Customers: inserted ${result.length}`);
  } catch (err) {
    const n = err.result?.insertedCount ?? 0;
    console.log(`ℹ️  Customers: ${n} inserted, duplicates skipped`);
  }

  // ── Seed Items ──────────────────────────────────────────────────────────
  // items.json format: { "ItemName": { rate, gst, unit }, ... }
  const itemsRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "items.json"), "utf8")
  );
  const itemDocs = Object.entries(itemsRaw).map(([name, config]) => ({ name, ...config }));

  try {
    const result = await Item.insertMany(itemDocs, { ordered: false });
    console.log(`✅ Items: inserted ${result.length}`);
  } catch (err) {
    const n = err.result?.insertedCount ?? 0;
    console.log(`ℹ️  Items: ${n} inserted, duplicates skipped`);
  }

  await mongoose.disconnect();
  console.log("\n✅ Seed complete. You can now start the server with: node server.js");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
