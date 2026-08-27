// POST /api/files/upload
// Multipart upload handler with built-in parser (no multer dep needed on Vercel).

const { saveFile, countPdfPages } = require("../../../lib/store");
const { MAX_FILE_MB } = require("../../../lib/env");

function bad(res, code, message, http = 400) {
  return res.status(http).json({ success: false, code, error: { code, message } });
}

/** Tiny multipart parser. Returns { filename, mimeType, buffer }. */
function parseMultipart(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const ctype = req.headers["content-type"] || "";
    const m = ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!m) return reject(new Error("No multipart boundary."));
    const boundary = "--" + (m[1] || m[2]);
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) { aborted = true; req.destroy(); return reject(new Error("File too large")); }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const buf = Buffer.concat(chunks);
        const parts = splitBuffer(buf, boundary);
        for (const part of parts) {
          const headerEnd = part.indexOf("\r\n\r\n");
          if (headerEnd < 0) continue;
          const header = part.slice(0, headerEnd).toString("latin1");
          const body = part.slice(headerEnd + 4, part.length - 2);
          const fn = (header.match(/filename="([^"]+)"/) || [])[1];
          if (fn) {
            const mt = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || "application/octet-stream";
            return resolve({ filename: fn, mimeType: mt.trim(), buffer: body });
          }
        }
        reject(new Error("No file part found"));
      } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function splitBuffer(buf, boundary) {
  const parts = [];
  const start = buf.indexOf(boundary);
  if (start < 0) return parts;
  let pos = start + boundary.length;
  while (pos < buf.length) {
    const next = buf.indexOf(boundary, pos);
    if (next < 0) break;
    parts.push(buf.slice(pos + 2, next - 2));
    pos = next + boundary.length;
  }
  return parts;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });

  let parsed;
  try {
    parsed = await parseMultipart(req, MAX_FILE_MB * 1024 * 1024);
  } catch (e) {
    if (/too large/i.test(e.message)) {
      return bad(res, "TOO_LARGE", `File exceeds the size limit of ${MAX_FILE_MB} MB.`, 413);
    }
    return bad(res, "BAD_REQUEST", "Could not parse upload: " + e.message, 400);
  }

  const { filename, mimeType, buffer } = parsed;
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  const isImage = /^image\/(png|jpe?g)$/i.test(mimeType);
  if (!isPdf && !isImage) {
    return bad(res, "BAD_TYPE", "Only PDF, PNG or JPG files are allowed.", 415);
  }

  const pageCount = isPdf ? countPdfPages(buffer) : 1;
  const rec = saveFile({ filename, mimeType, buffer, pageCount });

  res.json({
    success: true,
    fileId: rec.fileId,
    filename: rec.filename,
    pageCount,
    fileSize: rec.size
  });
};

module.exports.config = { api: { bodyParser: false, sizeLimit: "30mb" } };
