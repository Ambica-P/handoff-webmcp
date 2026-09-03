/**
 * POST /api/github/open-pr  { owner, repo, title, head, base?, body? }
 * Same approval-boundary note as create-issue.js applies here.
 */

const { requireSession } = require("../_lib/session");
const { githubRequest } = require("../_lib/github");
const { methodGuard, sendJson, sendError, readJsonBody } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { owner, repo, title, head, base, body } = await readJsonBody(req);
    if (!owner || !repo || !title || !head) {
      sendJson(res, 400, { error: "owner, repo, title, and head are required." });
      return;
    }

    let baseBranch = base;
    if (!baseBranch) {
      const repoData = await githubRequest(session.token, `/repos/${owner}/${repo}`);
      baseBranch = repoData.default_branch;
    }

    const pr = await githubRequest(session.token, `/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: { title, head, base: baseBranch, body: body || "" },
    });

    sendJson(res, 200, { number: pr.number, title: pr.title, htmlUrl: pr.html_url, base: baseBranch });
  } catch (err) {
    sendError(res, err);
  }
};
