// GET /api/orders/:code/receipt
const { getOrder } = require("../../../lib/store");
const { buildReceipt } = require("../../../lib/pdf");
const { SHOP } = require("../../../lib/env");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed." });
  const code = req.query.code;
  if (!code) return bad(res, "BAD_REQUEST", "Missing order code.", 400);
  const order = getOrder(String(code).toUpperCase());
  if (!order) return bad(res, "NOT_FOUND", "Order not found.", 404);

  const c = order.config || {};
  const data = {
    shopName: SHOP.name,
    orderCode: order.orderCode,
    date: new Date(order.printedAt || order.paidAt || order.updatedAt || Date.now()).toLocaleString("en-IN"),
    rows: [
      ["Document", order.filename || "—"],
      ["Pages", String(order.pageCount)],
      ["Copies", String(c.copies || 1)],
      ["Print mode", c.printMode === "color" ? "Color" : "Black & White"],
      ["Paper", c.paperSize || "A4"],
      ["Sides", c.duplex ? "Double-sided" : "Single-sided"],
      ["Transaction", order.transactionId || "—"]
    ],
    amount: `${order.currency || "INR"} ${Number(order.amount).toFixed(2)}`,
    status: "PAID",
    notes: ["Keep this order code to pick up your print.", "Collect within the shop's stated time."]
  };
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="QuickPrint-Receipt-${order.orderCode}.pdf"`);
  res.send(buildReceipt(data));
};
