/**
 * POST /api/github/create-issue  { owner, repo, title, body?, labels? }
 *
 * This endpoint has no opinion about approval — it just performs the
 * write it's asked for, authenticated as whoever is connected. The
 * approval boundary lives one layer up: the frontend only calls this
 * from Board._applyChange, which only runs inside Board.approveDecision,
 * which only runs after a person (or an agent relaying a person's
 * explicit go-ahead) resolves a pending decision. See app.js.
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest } from "../github";
import { readJsonBody, errorResponse } from "../http";

export async function createIssue(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { owner, repo, title, body, labels } = await readJsonBody(request);
    if (!owner || !repo || !title) {
      return NextResponse.json({ error: "owner, repo, and title are required." }, { status: 400 });
    }

    const issue = await githubRequest(session.token, `/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: { title, body: body || "", labels: Array.isArray(labels) ? labels : undefined },
    });

    return NextResponse.json({ number: issue.number, title: issue.title, htmlUrl: issue.html_url });
  } catch (err) {
    return errorResponse(err);
  }
}
