/**
 * POST /api/github/create-branch  { owner, repo, branchName, fromRef? }
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
    const { owner, repo, branchName, fromRef } = await readJsonBody(req);
    if (!owner || !repo || !branchName) {
      sendJson(res, 400, { error: "owner, repo, and branchName are required." });
      return;
    }

    let base = fromRef;
    if (!base) {
      const repoData = await githubRequest(session.token, `/repos/${owner}/${repo}`);
      base = repoData.default_branch;
    }

    const baseRef = await githubRequest(session.token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
    const created = await githubRequest(session.token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branchName}`, sha: baseRef.object.sha },
    });

    sendJson(res, 200, { ref: created.ref, sha: created.object.sha, from: base });
  } catch (err) {
    sendError(res, err);
  }
};
