// POST /api/orders
const { getFile, createOrder } = require("../../lib/store");
const { computeQuote, validatePages, CURRENCY } = require("../../lib/pricing");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

module.exports = function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  const body = req.body || {};
  const file = getFile(body.fileId);
  if (!file) return bad(res, "NO_FILE", "Upload a file first.", 422);

  if (body.pageSelection && body.pageSelection !== "all") {
    const v = validatePages(body.pageSelection, file.pageCount);
    if (!v.ok) return bad(res, "BAD_PAGES", v.error, 422);
  }
  const q = computeQuote(body, file.pageCount);

  const order = createOrder({
    fileId: file.fileId,
    filename: file.filename,
    mimeType: file.mimeType,
    pageCount: file.pageCount,
    config: {
      printMode: body.printMode || "bw",
      paperSize: body.paperSize || "A4",
      copies: q.copies,
      pageSelection: body.pageSelection || "all",
      duplex: !!body.duplex,
      orientation: body.orientation || "auto",
      fitToPage: body.fitToPage !== false,
      grayscale: !!body.grayscale,
      autoRotate: body.autoRotate !== false
    },
    customer: body.customer || {},
    billablePages: q.billablePages,
    amount: q.total,
    currency: CURRENCY,
    quoteId: body.quoteId || null
  });

  res.json({
    success: true,
    orderId: order.orderId,
    orderCode: order.orderCode,
    amount: order.amount,
    currency: order.currency,
    paymentOrderId: null
  });
};
