/**
 * POST /api/github/open-pr  { owner, repo, title, head, base?, body? }
 * Same approval-boundary note as create-issue.js applies here.
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest } from "../github";
import { readJsonBody, errorResponse } from "../http";

export async function openPr(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { owner, repo, title, head, base, body } = await readJsonBody(request);
    if (!owner || !repo || !title || !head) {
      return NextResponse.json({ error: "owner, repo, title, and head are required." }, { status: 400 });
    }

    let baseBranch = base;
    if (!baseBranch) {
      const repoData = await githubRequest(session.token, `/repos/${owner}/${repo}`);
      baseBranch = repoData.default_branch;
    }

    const pr = await githubRequest(session.token, `/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: { title, head, base: baseBranch, body: body || "" },
    });

    return NextResponse.json({ number: pr.number, title: pr.title, htmlUrl: pr.html_url, base: baseBranch });
  } catch (err) {
    return errorResponse(err);
  }
}
