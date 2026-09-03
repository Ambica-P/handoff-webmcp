/**
 * GET /api/github/checks?owner=&repo=&ref=
 *
 * ref can be a branch name or a SHA. Defaults to the repository's
 * default branch if omitted.
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

    let ref = query.ref;
    if (!ref) {
      const repoData = await githubRequest(session.token, `/repos/${owner}/${repo}`);
      ref = repoData.default_branch;
    }

    const data = await githubRequest(session.token, `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs`);
    const runs = data.check_runs || [];

    const passing = runs.filter((r) => r.conclusion === "success").length;
    const failing = runs.filter((r) => ["failure", "timed_out", "cancelled"].includes(r.conclusion)).length;
    const pending = runs.filter((r) => r.status !== "completed").length;

    sendJson(res, 200, {
      ref,
      totalCount: runs.length,
      passing,
      failing,
      pending,
      checks: runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, htmlUrl: r.html_url })),
    });
  } catch (err) {
    sendError(res, err);
  }
};
