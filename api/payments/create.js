// POST /api/payments/create
// Calls gateway POST /api/v1/payments, returns hosted checkout URL.

const { GATEWAY_BASE_URL, GATEWAY_API_KEY, RETURN_PATH_TEMPLATE } = require("../../lib/env");
const { getOrder, getOrderById, setOrder } = require("../../lib/store");
const { CURRENCY } = require("../../lib/pricing");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  const { orderId, orderCode } = req.body || {};
  const order = (orderId && getOrderById(orderId)) || (orderCode && getOrder(orderCode));
  if (!order) return bad(res, "NO_ORDER", "Order not found.", 404);

  if (!GATEWAY_API_KEY) return bad(res, "NOT_CONFIGURED", "Payment gateway is not configured on the server.", 500);

  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const base = `${proto}://${host}`;
    const returnPath = RETURN_PATH_TEMPLATE.replace("{orderCode}", order.orderCode);
    const returnUrl = base + returnPath;

    const gres = await fetch(`${GATEWAY_BASE_URL}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GATEWAY_API_KEY}` },
      body: JSON.stringify({
        amount: order.amount,
        externalOrderId: order.orderCode,
        description: `Print order ${order.orderCode}`,
        customer: { name: (order.customer && order.customer.name) || "" },
        currency: CURRENCY,
        returnUrl
      })
    });
    const gdata = await gres.json().catch(() => ({}));
    if (!gres.ok || !gdata.success) {
      const msg = (gdata.error && gdata.error.message) || "Could not create the payment.";
      return bad(res, "GATEWAY", msg, gres.status >= 400 && gres.status < 500 ? gres.status : 502);
    }

    order.gatewayPaymentId = gdata.paymentId;
    order.updatedAt = new Date().toISOString();
    setOrder(order);

    res.json({
      success: true,
      checkoutUrl: gdata.paymentUrl,
      returnPath,
      paymentId: gdata.paymentId
    });
  } catch (e) {
    return bad(res, "GATEWAY", "Could not reach the payment gateway.", 502);
  }
};
