/**
 * whatsapp.js
 * Twilio WhatsApp webhook for Tally Automation System
 *
 * How it works:
 * - Twilio sends a POST request to /whatsapp/incoming when a message arrives
 * - We check the sender's number against customers.json
 * - If they send "order" → reply with their personal order link
 * - If not registered → reply with a not registered message
 *
 * This file is mounted into server.js — no need to run separately
 */

const { Router } = require("express");
const twilio     = require("twilio");
const fs         = require("fs");
const path       = require("path");

const router = Router();

// Load customers config
const customersConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/customers.json"), "utf8")
);

// Keyword that triggers the order link (case insensitive)
const ORDER_KEYWORD = "order";

/**
 * POST /whatsapp/incoming
 * Twilio sends every incoming WhatsApp message here
 */
router.post("/incoming", (req, res) => {
  const twiml      = new twilio.twiml.MessagingResponse();
  const body       = (req.body.Body || "").trim().toLowerCase();
  const from       = req.body.From || "";  // format: "whatsapp:+919876543210"

  // Extract 10-digit phone number from "whatsapp:+91XXXXXXXXXX"
  const fullNumber = from.replace("whatsapp:", "").replace("+", "");
  const phone10    = fullNumber.slice(-10);

  console.log(`📩 WhatsApp message from ${phone10}: "${body}"`);

  // Only respond to the order keyword
  if (body !== ORDER_KEYWORD) {
    twiml.message(
      `Hi! Send the word *order* to receive your personal order link.`
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Check if number is registered
  const customerName = customersConfig[phone10];

  if (!customerName) {
    twiml.message(
      "Sorry, your number is not registered in our system. Please contact us to get registered."
    );
    console.log(`   ❌ Not registered: ${phone10}`);
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Send personalized order link
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
  const orderLink    = `${FRONTEND_URL}/order/${phone10}`;

  twiml.message(
    `Hello ${customerName}! 👋\n\nHere is your order link:\n${orderLink}\n\nOpen it to place your order.`
  );

  console.log(`   ✅ Sent order link to ${customerName} (${phone10})`);
  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
