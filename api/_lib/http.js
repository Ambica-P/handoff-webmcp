/**
 * Minimal request/response helpers. Written by hand (no framework) so the
 * whole backend stays dependency-free — every /api file is a plain
 * (req, res) => {} function, which is what Vercel's Node.js runtime (and
 * most other "just export a handler" hosts) expect natively.
 */

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function sendError(res, err) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  sendJson(res, status, { error: err.message || "Something went wrong." });
}

function getQuery(req) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  return Object.fromEntries(url.searchParams.entries());
}

/** Reads a JSON body whether or not the host already parsed it (req.body). */
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    sendJson(res, 405, { error: `Method not allowed. Use ${allowed.join(" or ")}.` });
    return false;
  }
  return true;
}

module.exports = { sendJson, sendError, getQuery, readJsonBody, methodGuard };
