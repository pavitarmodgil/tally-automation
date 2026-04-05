/**
 * Customer.js
 * Mongoose model for registered customers.
 *
 * Why MongoDB (not SQL):
 *   - Already connected to Atlas — no extra infrastructure
 *   - Flexible schema: easy to add fields (e.g., address, GST number) later
 *   - Free Atlas tier comfortably handles hundreds of customers
 *
 * Migrated from: backend/data/customers.json (kept as backup)
 * Seed with:     node src/seed.js
 */

const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  name:  { type: String, required: true, trim: true },
});

module.exports = mongoose.model("Customer", customerSchema);
