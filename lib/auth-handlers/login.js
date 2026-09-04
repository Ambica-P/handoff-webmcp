/**
 * GET /api/auth/github/login
 *
 * Ordinary application redirect flow — this is intentionally NOT a
 * WebMCP tool. Authentication is something the person does; agents only
 * ever operate inside the session it produces.
 */

import crypto from "crypto";
import { NextResponse } from "next/server";
import { setOAuthStateCookie } from "../session";

export async function login(request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth isn't configured on this deployment (missing GITHUB_CLIENT_ID)." }, { status: 500 });
  }

  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/github/callback`,
    scope: "repo read:user",
    state,
    allow_signup: "true",
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  setOAuthStateCookie(response, state);
  return response;
}
