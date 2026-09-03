/**
 * GET /api/auth/github/status
 *
 * Tells the frontend whether a GitHub account is connected, and who —
 * nothing more. The frontend polls this once on load to decide whether
 * to show "Connect GitHub" or the repository picker.
 */

const { getSession } = require("../session");
const { methodGuard, sendJson } = require("../http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  const session = getSession(req);
  if (!session) {
    sendJson(res, 200, { connected: false });
    return;
  }
  sendJson(res, 200, { connected: true, login: session.login, avatarUrl: session.avatarUrl });
};
