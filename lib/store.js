// ═══════════════════════════════════════════════════════════════════════════
// QuickPrint bridge — Vercel-ready store
//
// Uses /tmp for ephemeral file + order storage. Files are written to
// /tmp/qp-files/<fileId> and orders to /tmp/qp-orders/<orderCode>.json.
//
// Vercel serverless lambdas are short-lived (~5 min warm window). Files
// uploaded in one invocation are available in subsequent invocations of the
// SAME warm lambda. On cold start, /tmp is fresh. The print-kiosk flow is:
//   upload → (seconds) → configure → (seconds) → pay → (seconds) → done
// All within one user session, well within the warm window. Acceptable for
// a single-shop kiosk. For multi-tenant / high-traffic use, replace with S3.
//
// No external dependencies.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ── Directory helpers ──────────────────────────────────────────────────
const TMP = process.env.TMPDIR || process.env.TEMP || "/tmp";
const FILES_DIR = path.join(TMP, "qp-files");
const ORDERS_DIR = path.join(TMP, "qp-orders");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(FILES_DIR);
ensureDir(ORDERS_DIR);

// ── ID / order-code generation ───────────────────────────────────────
function newId(prefix) {
  return prefix + "_" + crypto.randomBytes(8).toString("base64url");
}

function orderCode() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[crypto.randomInt(abc.length)];
  return "PRT-26-" + s;
}

// ── PDF page-count helper ──────────────────────────────────────────────
/** Count PDF pages from a Buffer without external deps (robust heuristic). */
function countPdfPages(buf) {
  const text = buf.toString("latin1");
  const m = text.match(/\/Type\s*\/Page[\s>/]/g) || [];
  let n = m.length;
  if (!n) {
    const c = text.match(/\/Count\s+(\d+)/);
    if (c) n = parseInt(c[1], 10) || 1;
  }
  return Math.max(1, n);
}

// ── File storage (Vercel: /tmp) ───────────────────────────────────────
function filePath(fileId) { return path.join(FILES_DIR, String(fileId).replace(/[^a-zA-Z0-9_-]/g, "_") + ".bin"); }
function orderPath(code) { return path.join(ORDERS_DIR, String(code).replace(/[^a-zA-Z0-9_-]/g, "_") + ".json"); }

function saveFile({ filename, mimeType, buffer, pageCount }) {
  const fileId = newId("file");
  const fp = filePath(fileId);
  fs.writeFileSync(fp, buffer);
  const record = {
    fileId,
    filename,
    mimeType,
    pageCount,
    size: buffer.length,
    isImage: (mimeType || "").startsWith("image/"),
    createdAt: new Date().toISOString()
  };
  // Also write metadata alongside the binary
  fs.writeFileSync(fp + ".meta", JSON.stringify(record));
  return record;
}

function getFile(fileId) {
  const fp = filePath(fileId);
  if (!fs.existsSync(fp)) return null;
  const metaPath = fp + ".meta";
  if (fs.existsSync(metaPath)) {
    try { return JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch {}
  }
  // Fallback: construct from what's available (old-style)
  const size = fs.statSync(fp).size;
  return { fileId, size, buffer: null }; // caller needs the buffer — use getFileBuffer
}

function getFileBuffer(fileId) {
  const fp = filePath(fileId);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp);
}

function deleteFile(fileId) {
  const fp = filePath(fileId);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  const mp = fp + ".meta";
  if (fs.existsSync(mp)) fs.unlinkSync(mp);
}

// ── Order storage (Vercel: /tmp JSON files) ─────────────────────────
function nowIso() { return new Date().toISOString(); }

function createOrder(rec) {
  const code = orderCode();
  const order = {
    orderCode: code,
    orderId: rec.orderId || newId("ord"),
    fileId: rec.fileId,
    filename: rec.filename,
    mimeType: rec.mimeType,
    pageCount: rec.pageCount,
    config: rec.config,
    customer: rec.customer || {},
    billablePages: rec.billablePages,
    amount: rec.amount,
    currency: rec.currency || "INR",
    quoteId: rec.quoteId || null,
    paymentStatus: "PENDING",
    printStatus: "QUEUED",
    progress: null,
    gatewayPaymentId: null,
    transactionId: null,
    paidAt: null,
    printedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  setOrder(order);
  return order;
}

function getOrder(code) {
  const fp = orderPath(code);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
}

function getOrderById(orderId) {
  // Linear scan of orders dir — acceptable for a single-shop kiosk.
  // In production, use a flat index file or S3 + DynamoDB.
  const files = fs.readdirSync(ORDERS_DIR).filter(f => f.endsWith(".json"));
  for (const f of files) {
    try {
      const order = JSON.parse(fs.readFileSync(path.join(ORDERS_DIR, f), "utf8"));
      if (order.orderId === orderId) return order;
    } catch {}
  }
  return null;
}

function setOrder(order) {
  const fp = orderPath(order.orderCode);
  fs.writeFileSync(fp, JSON.stringify(order, null, 2));
}

function updateOrder(code, updates) {
  const order = getOrder(code);
  if (!order) return null;
  const updated = { ...order, ...updates, updatedAt: nowIso() };
  setOrder(updated);
  return updated;
}

// ── Payment status (mark PAID from webhook or status poll) ─────────────
const _settled = new Set(); // in-memory flag for this lambda invocation only
// Note: on cold start this is fresh. Multiple warm lambdas might race-mark PAID
// from webhook + status-poll simultaneously. Acceptable: first write wins, no
// double-payment. For strict dedup, use Redis or a DB with atomic CAS.

function isPaid(orderCode) { return _settled.has(orderCode); }

function markPaid(order, { transactionId, paidAt, source } = {}) {
  if (_settled.has(order.orderCode)) return order;
  _settled.add(order.orderCode);
  order.paymentStatus = "PAID";
  order.transactionId = transactionId || order.transactionId || null;
  order.paidAt = paidAt || nowIso();
  order.updatedAt = nowIso();
  setOrder(order);
  console.log(`[store] ${order.orderCode} PAID (${source || "?"})`);
  return order;
}

module.exports = {
  saveFile, getFile, getFileBuffer, deleteFile,
  createOrder, getOrder, getOrderById, setOrder, updateOrder,
  countPdfPages, orderCode, newId,
  isPaid, markPaid
};
