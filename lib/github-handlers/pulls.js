/**
 * GET /api/github/pulls?owner=&repo=&state=open
 */

const { requireSession } = require("../session");
const { githubRequest, requireRepoParams } = require("../github");
const { methodGuard, sendJson, sendError, getQuery } = require("../http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const query = getQuery(req);
    const { owner, repo } = requireRepoParams(query);
    const state = query.state === "closed" || query.state === "all" ? query.state : "open";

    const pulls = await githubRequest(session.token, `/repos/${owner}/${repo}/pulls?state=${state}&per_page=20`);

    sendJson(
      res,
      200,
      pulls.map((p) => ({
        number: p.number,
        title: p.title,
        htmlUrl: p.html_url,
        draft: p.draft,
        author: p.user ? p.user.login : null,
        headRef: p.head ? p.head.ref : null,
        headSha: p.head ? p.head.sha : null,
        baseRef: p.base ? p.base.ref : null,
        requestedReviewers: (p.requested_reviewers || []).map((r) => r.login),
        bodyExcerpt: (p.body || "").slice(0, 240),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
};
