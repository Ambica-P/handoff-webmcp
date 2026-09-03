/**
 * GET /api/github/repo?owner=&repo=
 */

const { requireSession } = require("../session");
const { githubRequest, requireRepoParams } = require("../github");
const { methodGuard, sendJson, sendError, getQuery } = require("../http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { owner, repo } = requireRepoParams(getQuery(req));
    const data = await githubRequest(session.token, `/repos/${owner}/${repo}`);
    sendJson(res, 200, {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      private: data.private,
      openIssuesCount: data.open_issues_count,
      stargazersCount: data.stargazers_count,
      htmlUrl: data.html_url,
      pushedAt: data.pushed_at,
    });
  } catch (err) {
    sendError(res, err);
  }
};
