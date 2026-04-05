/**
 * errorHandler.js
 * Global Express error-handling middleware.
 *
 * Why a central error handler:
 *   - asyncHandler catches every thrown/rejected error and forwards it here
 *   - One place to decide status code + response shape — no duplicate try/catch in routes
 *   - Keeps error logging consistent (structured via logger)
 *
 * IMPORTANT: Must be registered LAST (after all routes) in server.js.
 * Express identifies error middleware by the 4-argument signature (err, req, res, next).
 */

const logger = require("../logger");

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  logger.error(`[ERROR] ${req.method} ${req.path} → ${err.message}`);

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
};
