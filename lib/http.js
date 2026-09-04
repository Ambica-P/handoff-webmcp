/**
 * Minimal helpers shared by route handlers. Next.js Route Handlers use
 * the Web-standard Request/Response objects directly, so there isn't
 * much left to wrap — just a couple of conveniences.
 */

import { NextResponse } from "next/server";

/** Returns a plain object of query-string parameters from a Request. */
export function getQuery(request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

/** Reads a JSON body, tolerating an empty body. */
export async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function errorResponse(err) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  return NextResponse.json({ error: err.message || "Something went wrong." }, { status });
}
