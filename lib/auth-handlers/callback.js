/**
 * GET /api/auth/github/callback
 *
 * Exchanges the OAuth code for an access token, fetches the user's
 * identity, and stores both in the encrypted session cookie. The raw
 * token is never sent back to the browser in a response body — only
 * this redirect, which carries no token, does.
 */

import { NextResponse } from "next/server";
import { setSessionCookie, clearOAuthStateCookie, getOAuthState } from "../session";
import { githubRequest } from "../github";

export async function callback(request) {
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const fail = (message) => NextResponse.redirect(`${appUrl}/?github=error&message=${encodeURIComponent(message)}`);

  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail("GitHub OAuth isn't configured on this deployment.");

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state || state !== getOAuthState(request)) {
      return fail("That connection attempt looked invalid, so it was rejected. Please try again.");
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${appUrl}/api/auth/github/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return fail(tokenData.error_description || "GitHub didn't return an access token.");

    const user = await githubRequest(tokenData.access_token, "/user");

    const response = NextResponse.redirect(`${appUrl}/?github=connected`);
    setSessionCookie(response, {
      token: tokenData.access_token,
      login: user.login,
      avatarUrl: user.avatar_url,
      connectedAt: Date.now(),
    });
    clearOAuthStateCookie(response);
    return response;
  } catch (err) {
    return fail(err.message || "Connecting to GitHub failed.");
  }
}
