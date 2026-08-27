// POST /webhooks/gateway
// Receives signed webhooks from the payment gateway.

const crypto = require("crypto");
const { WEBHOOK_SECRET } = require("../../lib/env");
const { getOrder, markPaid } = require("../../lib/store");

function verifyWebhookSignature(req, rawBody) {
  if (!WEBHOOK_SECRET || !rawBody) return false;
  const provided = req.headers["x-gateway-signature"];
  if (!provided) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });

  // Build the raw body for HMAC verification. Vercel sets req.body when
  // bodyParser is on (default). We re-serialize to get bytes.
  let raw;
  let body;
  if (req.rawBody) {
    raw = req.rawBody;
    body = typeof raw === "string" ? JSON.parse(raw) : raw;
  } else if (req.body && typeof req.body === "object") {
    body = req.body;
    raw = Buffer.from(JSON.stringify(req.body));
  } else {
    raw = Buffer.from("");
    body = {};
  }

  if (!verifyWebhookSignature(req, raw)) {
    return res.status(401).json({ success: false, code: "BAD_SIGNATURE", error: { code: "BAD_SIGNATURE", message: "Webhook signature check failed." } });
  }

  const p = body || {};
  if (p.event === "payment.success") {
    const order = getOrder(p.externalOrderId);
    if (order) markPaid(order, { transactionId: p.transactionId, paidAt: p.paidAt, source: "webhook" });
  }
  res.json({ received: true });
};
