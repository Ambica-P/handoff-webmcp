/**
 * POST /api/github/comment-issue  { owner, repo, number, body }
 * Same approval-boundary note as create-issue.js applies here.
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest } from "../github";
import { readJsonBody, errorResponse } from "../http";

export async function commentIssue(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { owner, repo, number, body } = await readJsonBody(request);
    if (!owner || !repo || !number || !body) {
      return NextResponse.json({ error: "owner, repo, number, and body are required." }, { status: 400 });
    }

    const comment = await githubRequest(session.token, `/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: "POST",
      body: { body },
    });

    return NextResponse.json({ id: comment.id, htmlUrl: comment.html_url });
  } catch (err) {
    return errorResponse(err);
  }
}
