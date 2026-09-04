/**
 * GET /api/github/issues?owner=&repo=&state=open
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest, requireRepoParams } from "../github";
import { getQuery, errorResponse } from "../http";

export async function issues(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const query = getQuery(request);
    const { owner, repo } = requireRepoParams(query);
    const state = query.state === "closed" || query.state === "all" ? query.state : "open";

    const items = await githubRequest(session.token, `/repos/${owner}/${repo}/issues?state=${state}&per_page=20`);
    const issuesOnly = items.filter((i) => !i.pull_request);

    return NextResponse.json(
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
    return errorResponse(err);
  }
}
