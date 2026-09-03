/**
 * GET /api/auth/github/login
 *
 * Ordinary application redirect flow — this is intentionally NOT a
 * WebMCP tool. Authentication is something the person does; agents only
 * ever operate inside the session it produces.
 */

const crypto = require("crypto");
const { setOAuthStateCookie } = require("../../_lib/session");
const { methodGuard, sendJson } = require("../../_lib/http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    sendJson(res, 500, { error: "GitHub OAuth isn't configured on this deployment (missing GITHUB_CLIENT_ID)." });
    return;
  }

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const state = crypto.randomBytes(16).toString("hex");
  setOAuthStateCookie(res, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/github/callback`,
    scope: "repo read:user",
    state,
    allow_signup: "true",
  });

  res.statusCode = 302;
  res.setHeader("Location", `https://github.com/login/oauth/authorize?${params.toString()}`);
  res.end();
};
