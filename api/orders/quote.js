// POST /api/orders/quote
const crypto = require("crypto");
const { getFile } = require("../../lib/store");
const { computeQuote, CURRENCY } = require("../../lib/pricing");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

module.exports = function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  const cfg = req.body || {};
  const file = getFile(cfg.fileId);
  if (!file) return bad(res, "NO_FILE", "Upload a file first.", 422);

  const q = computeQuote(cfg, file.pageCount);
  res.json({
    success: true,
    quoteId: "q_" + crypto.randomBytes(8).toString("base64url"),
    pageCount: file.pageCount,
    billablePages: q.billablePages,
    perPage: q.perPage,
    subtotal: q.subtotal,
    tax: q.tax,
    total: q.total,
    currency: CURRENCY,
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString()
  });
};
