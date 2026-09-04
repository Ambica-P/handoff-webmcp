/**
 * POST /api/github/create-branch  { owner, repo, branchName, fromRef? }
 * Same approval-boundary note as create-issue.js applies here.
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest } from "../github";
import { readJsonBody, errorResponse } from "../http";

export async function createBranch(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { owner, repo, branchName, fromRef } = await readJsonBody(request);
    if (!owner || !repo || !branchName) {
      return NextResponse.json({ error: "owner, repo, and branchName are required." }, { status: 400 });
    }

    let base = fromRef;
    if (!base) {
      const repoData = await githubRequest(session.token, `/repos/${owner}/${repo}`);
      base = repoData.default_branch;
    }

    const baseRef = await githubRequest(session.token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
    const created = await githubRequest(session.token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branchName}`, sha: baseRef.object.sha },
    });

    return NextResponse.json({ ref: created.ref, sha: created.object.sha, from: base });
  } catch (err) {
    return errorResponse(err);
  }
}
