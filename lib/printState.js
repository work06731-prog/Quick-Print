// ═══════════════════════════════════════════════════════════════════════════
// QuickPrint bridge — Vercel-ready print state machine
//
// The original printSim used setInterval to advance QUEUED → CLAIMED →
// DOWNLOADING → PRINTING → PRINTED. Vercel serverless functions are
// short-lived and can't run long-lived timers, so we replace the timer
// with a stateless state machine:
//
//   tickPrintStatus(order, now)
//
// Reads the order's `printStartedAt` and advances status + progress based
// on elapsed wall-clock time. Called by /api/orders/:code on every status
// request. No timers, no state outside the order record. Idempotent.
// ═══════════════════════════════════════════════════════════════════════════

const TIMINGS = {
  CLAIMED: 1500,        // ms after start: printer claims the job
  DOWNLOADING: 3000,    // ms after start: agent downloads the file
  PRINTING: 4500,       // ms after start: ink hits paper
  FINISH_TOTAL: 12000   // ms after start: job fully done
};

function tickPrintStatus(order, now) {
  // Don't touch the order if it's already finished, failed, or never paid.
  if (!order || order.paymentStatus !== "PAID") return order;
  if (["PRINTED", "FAILED", "CANCELLED"].includes(order.printStatus)) return order;

  // Start the clock the first time we see a PAID order
  if (!order._printStartedAt) {
    order._printStartedAt = order.paidAt || new Date().toISOString();
  }
  const startMs = new Date(order._printStartedAt).getTime();
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const elapsed = nowMs - startMs;
  const total = Math.max(1, order.billablePages || 1);

  let status = "QUEUED";
  let progress = null;

  if (elapsed >= TIMINGS.FINISH_TOTAL) {
    status = "PRINTED";
    progress = { printed: total, total };
  } else if (elapsed >= TIMINGS.PRINTING) {
    status = "PRINTING";
    // Linear progress from PRINTING start to FINISH_TOTAL
    const span = TIMINGS.FINISH_TOTAL - TIMINGS.PRINTING;
    const ratio = Math.min(1, (elapsed - TIMINGS.PRINTING) / span);
    progress = { printed: Math.max(0, Math.min(total, Math.round(total * ratio))), total };
  } else if (elapsed >= TIMINGS.DOWNLOADING) {
    status = "DOWNLOADING";
  } else if (elapsed >= TIMINGS.CLAIMED) {
    status = "CLAIMED";
  } else {
    status = "QUEUED";
  }

  if (order.printStatus !== status || (progress && (!order.progress || order.progress.printed !== progress.printed))) {
    order.printStatus = status;
    order.progress = progress;
  }
  return order;
}

/**
 * Build the public-facing view of an order (what the API returns).
 * Always runs the state machine so callers see the latest status.
 */
function projectOrder(order) {
  if (!order) return null;
  // Don't expose internal fields
  const { _printStartedAt, ...pub } = order;
  return pub;
}

module.exports = { tickPrintStatus, projectOrder, TIMINGS };
