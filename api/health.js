// GET /api/health
module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  res.json({ status: "ok", service: "quickprint-kiosk" });
};
