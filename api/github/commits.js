/**
 * GET /api/github/commits?owner=&repo=&sha=&per_page=
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
    const perPage = Math.min(Number(query.per_page) || 10, 30);
    const shaParam = query.sha ? `&sha=${encodeURIComponent(query.sha)}` : "";

    const commits = await githubRequest(session.token, `/repos/${owner}/${repo}/commits?per_page=${perPage}${shaParam}`);

    sendJson(
      res,
      200,
      commits.map((c) => ({
        sha: c.sha.slice(0, 7),
        fullSha: c.sha,
        message: (c.commit.message || "").split("\n")[0],
        author: (c.commit.author && c.commit.author.name) || (c.author && c.author.login) || "unknown",
        date: c.commit.author ? c.commit.author.date : null,
        htmlUrl: c.html_url,
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
};
