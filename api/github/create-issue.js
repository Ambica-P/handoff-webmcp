/**
 * POST /api/github/create-issue  { owner, repo, title, body?, labels? }
 *
 * This endpoint has no opinion about approval — it just performs the
 * write it's asked for, authenticated as whoever is connected. The
 * approval boundary lives one layer up: the frontend only calls this
 * from Board._applyChange, which only runs inside Board.approveDecision,
 * which only runs after a person (or an agent relaying a person's
 * explicit go-ahead) resolves a pending decision. See app.js.
 */

const { requireSession } = require("../_lib/session");
const { githubRequest } = require("../_lib/github");
const { methodGuard, sendJson, sendError, readJsonBody } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { owner, repo, title, body, labels } = await readJsonBody(req);
    if (!owner || !repo || !title) {
      sendJson(res, 400, { error: "owner, repo, and title are required." });
      return;
    }

    const issue = await githubRequest(session.token, `/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: { title, body: body || "", labels: Array.isArray(labels) ? labels : undefined },
    });

    sendJson(res, 200, { number: issue.number, title: issue.title, htmlUrl: issue.html_url });
  } catch (err) {
    sendError(res, err);
  }
};
