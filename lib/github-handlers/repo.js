/**
 * GET /api/github/repo?owner=&repo=
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest, requireRepoParams } from "../github";
import { getQuery, errorResponse } from "../http";

export async function repo(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { owner, repo: repoName } = requireRepoParams(getQuery(request));
    const data = await githubRequest(session.token, `/repos/${owner}/${repoName}`);
    return NextResponse.json({
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
    return errorResponse(err);
  }
}
