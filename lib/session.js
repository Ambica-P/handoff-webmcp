/**
 * Session storage for the GitHub connection.
 *
 * The GitHub access token lives ONLY here: encrypted (AES-256-GCM) inside
 * an httpOnly cookie, set and read via Next.js's NextRequest/NextResponse
 * cookie APIs. It never appears in a response body, never reaches
 * client-side JavaScript, and therefore is never visible to a WebMCP tool
 * — tools call our own /api/github/* routes, which decrypt this cookie
 * server-side, make the GitHub call, and hand back only shaped JSON.
 *
 * This trades a database for a stateless cookie. That's a reasonable
 * trade for a hackathon-scale demo; a production version would likely
 * swap this for a server-side session store keyed by a random session
 * id, with only the id in the cookie.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";

export const COOKIE_NAME = "handoff_session";
export const STATE_COOKIE_NAME = "handoff_oauth_state";

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. See .env.example.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(payloadObj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decrypt(token) {
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

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" };

/** Reads the session from an incoming request (NextRequest has a `.cookies` convenience API). */
export function getSession(request) {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return decrypt(raw);
  } catch {
    return null; // tampered, expired key, or SESSION_SECRET rotated
  }
}

/** Writes the session cookie onto an outgoing NextResponse. */
export function setSessionCookie(response, sessionObj, maxAgeSeconds = 60 * 60 * 8) {
  response.cookies.set(COOKIE_NAME, encrypt(sessionObj), { ...COOKIE_OPTS, maxAge: maxAgeSeconds });
}

export function clearSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTS, maxAge: 0 });
}

export function setOAuthStateCookie(response, state) {
  response.cookies.set(STATE_COOKIE_NAME, state, { ...COOKIE_OPTS, maxAge: 600 });
}

export function clearOAuthStateCookie(response) {
  response.cookies.set(STATE_COOKIE_NAME, "", { ...COOKIE_OPTS, maxAge: 0 });
}

export function getOAuthState(request) {
  return request.cookies.get(STATE_COOKIE_NAME)?.value || null;
}

/** Returns { session } if connected, or { errorResponse } (401 JSON) if not. */
export function requireSession(request) {
  const session = getSession(request);
  if (!session) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: "Not connected to GitHub. Connect an account from the Repository panel first." },
        { status: 401 }
      ),
    };
  }
  return { session, errorResponse: null };
}
