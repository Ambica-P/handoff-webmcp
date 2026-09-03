/**
 * POST /api/auth/github/logout
 *
 * Clears the session cookie. Does not revoke the GitHub OAuth grant
 * itself — the person can do that from github.com/settings/applications
 * if they want to fully revoke access, not just disconnect this app.
 */

const { clearSessionCookie } = require("../session");
const { methodGuard, sendJson } = require("../http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
};
