// GET /api/public/shop/:shopId
const { SHOP } = require("../../../lib/env");

module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed." });
  res.json({ success: true, ...SHOP });
};
