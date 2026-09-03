/**
 * Session storage for the GitHub connection.
 *
 * The GitHub access token lives ONLY here: encrypted (AES-256-GCM) inside
 * an httpOnly cookie. It never appears in a response body, never reaches
 * client-side JavaScript, and therefore is never visible to a WebMCP tool
 * — tools call our own /api/github/* endpoints, which decrypt this cookie
 * server-side, make the GitHub call, and hand back only shaped JSON.
 *
 * This trades a database for a stateless, serverless-friendly cookie.
 * That's a reasonable trade for a hackathon-scale demo; a production
 * version would likely swap this for a server-side session store keyed
 * by a random session id, with only the id in the cookie.
 */

const crypto = require("crypto");

const COOKIE_NAME = "handoff_session";
const STATE_COOKIE_NAME = "handoff_oauth_state";

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. See .env.example.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(payloadObj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decrypt(token) {
  const key = getKey();
  const raw = Buffer.from(token, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (process.env.NODE_ENV === "production" || opts.secure) parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) res.setHeader("Set-Cookie", cookieStr);
  else if (Array.isArray(existing)) res.setHeader("Set-Cookie", [...existing, cookieStr]);
  else res.setHeader("Set-Cookie", [existing, cookieStr]);
}

function getSession(req) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  try {
    return decrypt(raw);
  } catch {
    return null; // tampered, expired key, or SESSION_SECRET rotated
  }
}

function setSessionCookie(res, sessionObj, maxAgeSeconds = 60 * 60 * 8) {
  appendSetCookie(res, serializeCookie(COOKIE_NAME, encrypt(sessionObj), { maxAge: maxAgeSeconds }));
}

function clearSessionCookie(res) {
  appendSetCookie(res, serializeCookie(COOKIE_NAME, "", { maxAge: 0 }));
}

function setOAuthStateCookie(res, state) {
  appendSetCookie(res, serializeCookie(STATE_COOKIE_NAME, state, { maxAge: 600 }));
}

function clearOAuthStateCookie(res) {
  appendSetCookie(res, serializeCookie(STATE_COOKIE_NAME, "", { maxAge: 0 }));
}

/** Returns the session, or writes a 401 JSON response and returns null. */
function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not connected to GitHub. Connect an account from the Repository panel first." }));
    return null;
  }
  return session;
}

module.exports = {
  COOKIE_NAME,
  STATE_COOKIE_NAME,
  encrypt,
  decrypt,
  parseCookies,
  serializeCookie,
  appendSetCookie,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  requireSession,
};
