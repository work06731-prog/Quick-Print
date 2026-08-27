// POST /api/orders/:code/send-receipt
const { getOrder } = require("../../../lib/store");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

module.exports = function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  const code = req.query.code;
  if (!code) return bad(res, "BAD_REQUEST", "Missing order code.", 400);
  const order = getOrder(String(code).toUpperCase());
  if (!order) return bad(res, "NOT_FOUND", "Order not found.", 404);
  res.json({ success: true, note: "Receipt queued for e-mail (not wired in this build)." });
};
