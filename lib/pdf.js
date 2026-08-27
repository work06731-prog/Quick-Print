// Minimal valid single/multi-line PDF generator for receipts.
// No external dependency — builds the PDF byte stream by hand.
// Output is a real .pdf that opens in any viewer (text only, one page).

function escPdf(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // PDF core font is WinAnsi/Latin-1; encode beyond that safely.
    .replace(/[^\x20-\x7E]/g, (ch) => {
      const code = ch.codePointAt(0);
      if (code === 0x20B9) return "\\227"; // rupee sign → a visible marker in base-14
      if (code < 256) return "\\" + code.toString(8).padStart(3, "0");
      return "?";
    });
}

function drawLines(lines) {
  // lines: array of { text, size, bold, x, y }
  let stream = "BT\n";
  for (const l of lines) {
    const font = l.bold ? "/F2" : "/F1";
    stream += `${font} ${l.size} Tf\n1 0 0 1 ${l.x} ${l.y} Tm\n(${escPdf(l.text)}) Tj\n`;
  }
  stream += "ET";
  return stream;
}

/**
 * Build a one-page receipt PDF.
 * @param {object} d receipt data (orderCode, amount, rows: [[label, value], ...], notes)
 * @returns {Buffer}
 */
function buildReceipt(d) {
  const W = 595, H = 842; // A4 in points
  const margin = 56;
  let y = H - margin;
  const lines = [];
  const put = (text, { size = 10, bold = false, gap = 15 } = {}) => {
    lines.push({ text, size, bold, x: margin, y });
    y -= gap;
  };

  put(d.shopName || "QuickPrint", { size: 16, bold: true, gap: 20 });
  put("Print Order Receipt", { size: 11, bold: true, gap: 22 });
  put(`Order: ${d.orderCode}`, { size: 11, bold: true, gap: 22 });
  put(`Date: ${d.date || ""}`, { gap: 18 });
  put("".padEnd(60, "-"), { size: 8, gap: 18 });

  for (const [label, value] of d.rows || []) {
    put(`${label}: ${value}`, { gap: 16 });
  }

  y -= 6;
  put("".padEnd(60, "-"), { size: 8, gap: 20 });
  put(`Amount paid: ${d.amount}`, { size: 13, bold: true, gap: 16 });
  put(`Status: ${d.status || "PAID"}`, { size: 11, bold: true, gap: 24 });

  for (const note of d.notes || []) put(note, { size: 9, gap: 13 });

  const content = drawLines(lines);

  // ---- Assemble objects ----
  const objects = [];
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
  const stream = content;
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

module.exports = { buildReceipt };
