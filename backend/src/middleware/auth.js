/**
 * auth.js
 * JWT verification middleware for protected admin routes.
 *
 * Why JWT (not sessions):
 *   - Stateless — no session store required, scales to any number of instances
 *   - Self-contained — role is embedded in the token, no DB lookup per request
 *   - 8-hour expiry matches a typical working shift
 *
 * Usage: router.get("/api/orders", verifyToken, handler)
 */

const jwt = require("jsonwebtoken");

/**
 * verifyToken
 * Reads "Authorization: Bearer <token>" from the request header,
 * verifies it with JWT_SECRET, and attaches the decoded payload to req.admin.
 * Returns 401 if the header is missing, malformed, expired, or invalid.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    // Catches TokenExpiredError, JsonWebTokenError, etc.
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { verifyToken };
