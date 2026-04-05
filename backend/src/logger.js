/**
 * logger.js
 * Winston logger for Tally Automation System.
 *
 * Why Winston over console.log:
 *   - Structured JSON in the log file (grep-friendly for production debugging)
 *   - Colourised, human-readable output in the terminal
 *   - Automatic file rotation so logs/ doesn't grow unbounded
 *
 * Transports:
 *   Console → development visibility
 *   File    → persistent audit trail at logs/app.log
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");
const fs   = require("fs");

// Create logs/ directory next to the backend root if it doesn't exist yet
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logger = createLogger({
  level: "info",

  // File transport: JSON with timestamp (machine-readable)
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),

  transports: [
    // Console transport: colourised single-line (human-readable)
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: "HH:mm:ss" }),
        format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
      ),
    }),

    // File transport: rotate at 5 MB, keep last 3 files
    new transports.File({
      filename: path.join(logsDir, "app.log"),
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

module.exports = logger;
