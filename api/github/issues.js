/**
 * GET /api/github/issues?owner=&repo=&state=open
 */

const { requireSession } = require("../_lib/session");
const { githubRequest, requireRepoParams } = require("../_lib/github");
const { methodGuard, sendJson, sendError, getQuery } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const query = getQuery(req);
    const { owner, repo } = requireRepoParams(query);
    const state = query.state === "closed" || query.state === "all" ? query.state : "open";

    const items = await githubRequest(session.token, `/repos/${owner}/${repo}/issues?state=${state}&per_page=20`);
    const issuesOnly = items.filter((i) => !i.pull_request);

    sendJson(
      res,
      200,
      issuesOnly.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        htmlUrl: i.html_url,
        labels: (i.labels || []).map((l) => (typeof l === "string" ? l : l.name)),
        assignee: i.assignee ? i.assignee.login : null,
        bodyExcerpt: (i.body || "").slice(0, 240),
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
};
