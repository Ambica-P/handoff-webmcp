/**
 * GET /api/github/checks?owner=&repo=&ref=
 *
 * ref can be a branch name or a SHA. Defaults to the repository's
 * default branch if omitted.
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest, requireRepoParams } from "../github";
import { getQuery, errorResponse } from "../http";

export async function checks(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const query = getQuery(request);
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

    return NextResponse.json({
      ref,
      totalCount: runs.length,
      passing,
      failing,
      pending,
      checks: runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, htmlUrl: r.html_url })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
