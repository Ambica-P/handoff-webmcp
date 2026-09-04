/**
 * GET /api/github/commits?owner=&repo=&sha=&per_page=
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest, requireRepoParams } from "../github";
import { getQuery, errorResponse } from "../http";

export async function commits(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const query = getQuery(request);
    const { owner, repo } = requireRepoParams(query);
    const perPage = Math.min(Number(query.per_page) || 10, 30);
    const shaParam = query.sha ? `&sha=${encodeURIComponent(query.sha)}` : "";

    const list = await githubRequest(session.token, `/repos/${owner}/${repo}/commits?per_page=${perPage}${shaParam}`);

    return NextResponse.json(
      list.map((c) => ({
        sha: c.sha.slice(0, 7),
        fullSha: c.sha,
        message: (c.commit.message || "").split("\n")[0],
        author: (c.commit.author && c.commit.author.name) || (c.author && c.author.login) || "unknown",
        date: c.commit.author ? c.commit.author.date : null,
        htmlUrl: c.html_url,
      }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}
