/**
 * Dispatches every /api/github/* request to its handler in
 * lib/github-handlers/. See app/api/auth/github/[...action]/route.js
 * for why these are consolidated into one file. Public URLs
 * (/api/github/repos, /api/github/issues, etc.) are unchanged.
 */

import { NextResponse } from "next/server";
import { repos } from "../../../../lib/github-handlers/repos";
import { repo } from "../../../../lib/github-handlers/repo";
import { issues } from "../../../../lib/github-handlers/issues";
import { pulls } from "../../../../lib/github-handlers/pulls";
import { commits } from "../../../../lib/github-handlers/commits";
import { checks } from "../../../../lib/github-handlers/checks";
import { blockers } from "../../../../lib/github-handlers/blockers";
import { createIssue } from "../../../../lib/github-handlers/create-issue";
import { commentIssue } from "../../../../lib/github-handlers/comment-issue";
import { createBranch } from "../../../../lib/github-handlers/create-branch";
import { openPr } from "../../../../lib/github-handlers/open-pr";

const GET_ROUTES = { repos, repo, issues, pulls, commits, checks, blockers };
const POST_ROUTES = {
  "create-issue": createIssue,
  "comment-issue": commentIssue,
  "create-branch": createBranch,
  "open-pr": openPr,
};

function notFound(action) {
  return NextResponse.json({ error: `Unknown route: /api/github/${(action || []).join("/")}` }, { status: 404 });
}

export async function GET(request, context) {
  const { action } = await context.params;
  const route = GET_ROUTES[action?.[0]];
  return route ? route(request) : notFound(action);
}

export async function POST(request, context) {
  const { action } = await context.params;
  const route = POST_ROUTES[action?.[0]];
  return route ? route(request) : notFound(action);
}
