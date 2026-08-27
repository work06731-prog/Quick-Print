// ── Centralized env config ──────────────────────────────────────────────
const env = process.env;
const MAX_FILE_MB = parseInt(env.MAX_FILE_MB || "25", 10);
const GATEWAY_BASE_URL = (env.GATEWAY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const GATEWAY_API_KEY = env.GATEWAY_API_KEY || "";
const WEBHOOK_SECRET = env.WEBHOOK_SECRET || "";
const RETURN_PATH_TEMPLATE = env.RETURN_PATH_TEMPLATE || "/?op={orderCode}";

const SHOP = {
  name: "QuickPrint Shop",
  isOpen: true,
  maxFileSizeBytes: MAX_FILE_MB * 1024 * 1024,
  maxCopies: 10,
  supportsDuplex: true,
  paperSizes: [
    { id: "A4", label: "A4", desc: "210 × 297 mm — most documents" },
    { id: "A3", label: "A3", desc: "297 × 420 mm — posters & maps" }
  ],
  supportedOptions: { fitToPage: true, grayscale: true, autoRotate: true }
};

module.exports = {
  env, MAX_FILE_MB, GATEWAY_BASE_URL, GATEWAY_API_KEY, WEBHOOK_SECRET,
  RETURN_PATH_TEMPLATE, SHOP
};
