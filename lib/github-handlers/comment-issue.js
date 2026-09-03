/**
 * POST /api/github/comment-issue  { owner, repo, number, body }
 * Same approval-boundary note as create-issue.js applies here.
 */

const { requireSession } = require("../session");
const { githubRequest } = require("../github");
const { methodGuard, sendJson, sendError, readJsonBody } = require("../http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { owner, repo, number, body } = await readJsonBody(req);
    if (!owner || !repo || !number || !body) {
      sendJson(res, 400, { error: "owner, repo, number, and body are required." });
      return;
    }

    const comment = await githubRequest(session.token, `/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: "POST",
      body: { body },
    });

    sendJson(res, 200, { id: comment.id, htmlUrl: comment.html_url });
  } catch (err) {
    sendError(res, err);
  }
};
