/**
 * GET /api/github/repos
 */

const { requireSession } = require("../_lib/session");
const { githubRequest } = require("../_lib/github");
const { methodGuard, sendJson, sendError } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const repos = await githubRequest(session.token, "/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator");
    sendJson(
      res,
      200,
      repos.map((r) => ({
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at,
        openIssuesCount: r.open_issues_count,
      }))
    );
  } catch (err) {
    sendError(res, err);
  }
};
