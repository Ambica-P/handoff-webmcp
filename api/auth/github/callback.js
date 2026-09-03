/**
 * GET /api/auth/github/callback
 *
 * Exchanges the OAuth code for an access token, fetches the user's
 * identity, and stores both in the encrypted session cookie. The raw
 * token is never sent back to the browser in a response body — only
 * this redirect, which carries no token, does.
 */

const { parseCookies, setSessionCookie, clearOAuthStateCookie, STATE_COOKIE_NAME } = require("../../_lib/session");
const { githubRequest } = require("../../_lib/github");
const { getQuery } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

  const fail = (message) => {
    res.statusCode = 302;
    res.setHeader("Location", `${appUrl}/?github=error&message=${encodeURIComponent(message)}`);
    res.end();
  };

  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      fail("GitHub OAuth isn't configured on this deployment.");
      return;
    }

    const { code, state } = getQuery(req);
    const cookies = parseCookies(req);

    if (!code || !state || state !== cookies[STATE_COOKIE_NAME]) {
      fail("That connection attempt looked invalid, so it was rejected. Please try again.");
      return;
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

    if (!tokenData.access_token) {
      fail(tokenData.error_description || "GitHub didn't return an access token.");
      return;
    }

    const user = await githubRequest(tokenData.access_token, "/user");

    setSessionCookie(res, {
      token: tokenData.access_token,
      login: user.login,
      avatarUrl: user.avatar_url,
      connectedAt: Date.now(),
    });
    clearOAuthStateCookie(res);

    res.statusCode = 302;
    res.setHeader("Location", `${appUrl}/?github=connected`);
    res.end();
  } catch (err) {
    fail(err.message || "Connecting to GitHub failed.");
  }
};
