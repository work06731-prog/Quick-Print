// Server-side pricing & page-range validation.
// This is the source of truth for price — the browser never computes it.
// Mirrors the frontend's validatePages()/demoQuote() so demo and real pricing
// agree, but here the numbers are authoritative.

const PRICING = {
  bw:    { A4: 3,  A3: 6 },
  color: { A4: 10, A3: 20 }
};
const CURRENCY = "INR";

/** Validate "1-5,8,10-12" against a page count. Returns { ok, count, error }. */
function validatePages(str, pageCount) {
  const s = String(str || "").trim();
  if (!s) return { ok: false, count: 0, error: "Enter at least one page." };
  const max = pageCount || Infinity;
  const groups = s.split(/[,;\s]+/).filter(Boolean);
  if (!groups.length) return { ok: false, count: 0, error: "Enter at least one page." };
  const seen = new Set();
  for (const g of groups) {
    const m = g.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return { ok: false, count: 0, error: `"${g}" is not a valid page or range.` };
    let a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
    if (m[2] && a > b) [a, b] = [b, a];
    if (a < 1) return { ok: false, count: 0, error: "Pages start from 1." };
    if (max !== Infinity && b > max) return { ok: false, count: 0, error: `Page ${b} is out of range.` };
    for (let p = a; p <= b; p++) seen.add(p);
  }
  if (!seen.size) return { ok: false, count: 0, error: "No pages selected." };
  return { ok: true, count: seen.size, error: null };
}

/**
 * Compute a quote from a config payload + the uploaded file's page count.
 * @param {object} cfg  configPayload() from the frontend
 * @param {number} pageCount  authoritative page count from the stored file
 */
function computeQuote(cfg, pageCount) {
  const pagesMax = pageCount || 1;
  let pages = pagesMax;
  if (cfg.pageSelection && cfg.pageSelection !== "all") {
    const v = validatePages(cfg.pageSelection, pagesMax);
    if (v.ok) pages = v.count;
    else pages = pagesMax; // fall back to all pages; order screen will re-validate
  }
  const copies = Math.max(1, Math.min(20, parseInt(cfg.copies, 10) || 1));
  const billable = pages * copies;
  const perPage = (PRICING[cfg.printMode] || PRICING.bw)[cfg.paperSize] || 3;
  const subtotal = billable * perPage;
  return {
    pages,
    copies,
    billablePages: billable,
    perPage,
    subtotal,
    tax: 0,
    total: subtotal,
    currency: CURRENCY
  };
}

module.exports = { validatePages, computeQuote, PRICING, CURRENCY };
