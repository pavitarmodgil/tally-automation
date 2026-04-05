/**
 * orderValidator.js
 * Zod schema for the POST /api/orders request body.
 *
 * Rules:
 *   - phone must be 10–15 characters (covers Indian 10-digit and international formats)
 *   - items must have at least one entry
 *   - qty must be a positive integer (no decimals, no negatives, no zero)
 *   - finalPrice must be a positive number (GST-inclusive price per unit)
 */

const { z } = require("zod");

const orderSchema = z.object({
  phone: z.string().min(10).max(15),
  items: z
    .array(
      z.object({
        name:       z.string().min(1),
        qty:        z.number().int().positive(),
        finalPrice: z.number().positive(),
      })
    )
    .min(1, "Order must have at least one item"),
});

module.exports = { orderSchema };
