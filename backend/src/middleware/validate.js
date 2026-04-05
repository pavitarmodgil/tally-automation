/**
 * validate.js
 * Generic Zod schema validation middleware.
 *
 * Why validate at the middleware layer (not inside the route handler):
 *   - Separates validation concern from business logic
 *   - A single failed schema check short-circuits the request before touching the DB
 *   - Returns structured error details so the client knows exactly what's wrong
 *
 * Usage: router.post("/api/orders", validate(orderSchema), handler)
 */

/**
 * validate(schema)
 * Returns an Express middleware that runs schema.parse(req.body).
 * On success, req.body is replaced with the coerced/validated value.
 * On failure, responds 400 with { error, details }.
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      // ZodError exposes an `errors` array with path + message per field
      return res.status(400).json({
        error:   "Validation failed",
        details: err.errors || [],
      });
    }
  };
}

module.exports = { validate };
