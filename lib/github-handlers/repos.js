/**
 * GET /api/github/repos
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest } from "../github";
import { errorResponse } from "../http";

export async function repos(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const list = await githubRequest(session.token, "/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator");
    return NextResponse.json(
      list.map((r) => ({
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
    return errorResponse(err);
  }
}
