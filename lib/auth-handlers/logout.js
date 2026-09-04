/**
 * POST /api/auth/github/logout
 *
 * Clears the session cookie. Does not revoke the GitHub OAuth grant
 * itself — the person can do that from github.com/settings/applications
 * if they want to fully revoke access, not just disconnect this app.
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "../session";

export async function logout() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
