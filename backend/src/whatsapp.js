/**
 * whatsapp.js
 * Twilio WhatsApp webhook for Tally Automation System.
 *
 * How it works:
 *   - Twilio POSTs to /whatsapp/incoming when a customer sends a WhatsApp message
 *   - If they send "order" → look up their name in MongoDB and reply with their personal link
 *   - If not registered → inform them to contact the supplier
 *
 * Customer lookup is done at request time (not at startup) so it reflects
 * the latest data from MongoDB rather than a stale JSON snapshot.
 *
 * This router is mounted in server.js — it does not run standalone.
 */

const { Router } = require("express");
const twilio     = require("twilio");
const Customer   = require("./models/Customer");
const logger     = require("./logger");

const router = Router();

// Keyword that triggers the order link (matched case-insensitively)
const ORDER_KEYWORD = "order";

/**
 * POST /whatsapp/incoming
 * Twilio sends every incoming WhatsApp message here as a form-encoded body.
 */
router.post("/incoming", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const body  = (req.body.Body || "").trim().toLowerCase();
  const from  = req.body.From || "";   // format: "whatsapp:+919876543210"

  // Extract 10-digit local phone number from the international Twilio format
  const fullNumber = from.replace("whatsapp:", "").replace("+", "");
  const phone10    = fullNumber.slice(-10);

  logger.info(`WhatsApp message from ${phone10}: "${body}"`);

  // Only respond to the order keyword — everything else gets a hint
  if (body !== ORDER_KEYWORD) {
    twiml.message("Hi! Send the word *order* to receive your personal order link.");
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Look up customer in MongoDB
  let customer;
  try {
    customer = await Customer.findOne({ phone: phone10 });
  } catch (err) {
    logger.error(`WhatsApp DB lookup failed for ${phone10}: ${err.message}`);
    twiml.message("Sorry, we're having a technical issue. Please try again in a moment.");
    res.type("text/xml").send(twiml.toString());
    return;
  }

  if (!customer) {
    twiml.message(
      "Sorry, your number is not registered in our system. Please contact us to get registered."
    );
    logger.info(`WhatsApp: unregistered number ${phone10}`);
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Send the personalised order link
  const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").trim();
  const orderLink    = `${FRONTEND_URL}/order/${phone10}`;

  twiml.message(
    `Hello ${customer.name}! 👋\n\nHere is your order link:\n${orderLink}\n\nOpen it to place your order.`
  );

  logger.info(`WhatsApp: sent order link to ${customer.name} (${phone10})`);
  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
