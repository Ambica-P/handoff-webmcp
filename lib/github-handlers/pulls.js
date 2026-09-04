/**
 * GET /api/github/pulls?owner=&repo=&state=open
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest, requireRepoParams } from "../github";
import { getQuery, errorResponse } from "../http";

export async function pulls(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const query = getQuery(request);
    const { owner, repo } = requireRepoParams(query);
    const state = query.state === "closed" || query.state === "all" ? query.state : "open";

    const list = await githubRequest(session.token, `/repos/${owner}/${repo}/pulls?state=${state}&per_page=20`);

    return NextResponse.json(
      list.map((p) => ({
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
    return errorResponse(err);
  }
}
