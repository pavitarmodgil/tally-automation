/**
 * Item.js
 * Mongoose model for catalog items (products).
 *
 * Why MongoDB (not SQL):
 *   - Already connected to Atlas — no extra infrastructure
 *   - Items have varying GST rates and units — JSON-like schema fits naturally
 *   - Makes future admin UI for adding/editing items straightforward
 *
 * Migrated from: backend/data/items.json (kept as backup)
 * Seed with:     node src/seed.js
 */

const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  // name is the key used in orders — must match exactly (case-sensitive)
  name: { type: String, required: true, unique: true, trim: true },
  rate: { type: Number, required: true },   // base rate (ex-GST) in ₹
  gst:  { type: Number, required: true },   // GST % (e.g. 5 means 5%)
  unit: { type: String, required: true },   // Tally unit symbol — case-sensitive (bx, pcs, PKT)
});

module.exports = mongoose.model("Item", itemSchema);
