// GET /api/orders/:code
const { GATEWAY_BASE_URL } = require("../../../lib/env");
const { getOrder, setOrder, markPaid } = require("../../../lib/store");
const { tickPrintStatus, projectOrder } = require("../../../lib/printState");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

async function pollGatewayIfPending(order) {
  if (order.paymentStatus !== "PENDING" || !order.gatewayPaymentId) return order;
  try {
    const r = await fetch(`${GATEWAY_BASE_URL}/p/api/public/payments/${order.gatewayPaymentId}/status`);
    if (!r.ok) return order;
    const data = await r.json();
    if (data.status === "PAID") return markPaid(order, { source: "status-poll" });
  } catch {}
  return order;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed." });
  // Vercel passes dynamic segments via req.query
  const code = req.query.code;
  if (!code) return bad(res, "BAD_REQUEST", "Missing order code.", 400);

  let order = getOrder(String(code).toUpperCase());
  if (!order) return bad(res, "NOT_FOUND", "Order not found.", 404);

  order = await pollGatewayIfPending(order);
  if (order.paymentStatus === "PAID") {
    const before = order.printStatus + "|" + (order.progress ? order.progress.printed : "-");
    order = tickPrintStatus(order);
    const after = order.printStatus + "|" + (order.progress ? order.progress.printed : "-");
    if (before !== after) {
      if (order.printStatus === "PRINTED") order.printedAt = new Date().toISOString();
      setOrder(order);
    }
  }

  res.json({ success: true, ...projectOrder(order) });
};
