/**
 * GET /api/github/blockers?owner=&repo=
 *
 * A simple heuristic, not a magic oracle: it scans open issue/PR bodies
 * for phrases like "blocked by #12" or "depends on #7", and flags open
 * PRs whose most recent checks are failing.
 */

import { NextResponse } from "next/server";
import { requireSession } from "../session";
import { githubRequest, requireRepoParams } from "../github";
import { getQuery, errorResponse } from "../http";

const BLOCK_PATTERN = /\b(?:blocked by|blocks|depends on|waiting on)\s+#(\d+)/gi;

function extractBlockedBy(text) {
  const nums = [];
  let match;
  BLOCK_PATTERN.lastIndex = 0;
  while ((match = BLOCK_PATTERN.exec(text || "")) !== null) nums.push(Number(match[1]));
  return [...new Set(nums)];
}

export async function blockers(request) {
  const { session, errorResponse: unauthorized } = requireSession(request);
  if (unauthorized) return unauthorized;

  try {
    const { owner, repo } = requireRepoParams(getQuery(request));

    const [issuesList, pullsList] = await Promise.all([
      githubRequest(session.token, `/repos/${owner}/${repo}/issues?state=open&per_page=25`),
      githubRequest(session.token, `/repos/${owner}/${repo}/pulls?state=open&per_page=25`),
    ]);
    const issuesOnly = issuesList.filter((i) => !i.pull_request);

    const flagged = [];

    for (const i of issuesOnly) {
      const blockedBy = extractBlockedBy(i.body);
      if (blockedBy.length) {
        flagged.push({
          type: "issue",
          number: i.number,
          title: i.title,
          htmlUrl: i.html_url,
          likelyOwner: i.assignee ? i.assignee.login : null,
          blockedByNumbers: blockedBy,
          reason: `Body references #${blockedBy.join(", #")}.`,
        });
      }
    }

    const prsToCheck = pullsList.slice(0, 5);
    const checkResults = await Promise.all(
      prsToCheck.map((p) =>
        githubRequest(session.token, `/repos/${owner}/${repo}/commits/${p.head.sha}/check-runs`).catch(() => null)
      )
    );

    pullsList.forEach((p, idx) => {
      const blockedBy = extractBlockedBy(p.body);
      const checkData = idx < prsToCheck.length ? checkResults[idx] : null;
      const runs = checkData ? checkData.check_runs || [] : [];
      const failing = runs.filter((r) => ["failure", "timed_out", "cancelled"].includes(r.conclusion));

      if (blockedBy.length || failing.length) {
        flagged.push({
          type: "pull_request",
          number: p.number,
          title: p.title,
          htmlUrl: p.html_url,
          likelyOwner: p.user ? p.user.login : null,
          blockedByNumbers: blockedBy,
          reason: [
            blockedBy.length ? `Body references #${blockedBy.join(", #")}.` : null,
            failing.length ? `${failing.length} failing check${failing.length === 1 ? "" : "s"} (${failing.map((f) => f.name).join(", ")}).` : null,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
    });

    return NextResponse.json({ owner, repo, scanned: { issues: issuesOnly.length, pullRequests: pullsList.length }, flagged });
  } catch (err) {
    return errorResponse(err);
  }
}
