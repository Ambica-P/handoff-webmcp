/**
 * Dispatches every /api/github/* request to its handler in
 * lib/github-handlers/. See api/auth/github/[...action].js for why
 * these are consolidated into one file per group instead of one file
 * per endpoint. Public URLs (/api/github/repos, /api/github/issues,
 * etc.) are unchanged.
 */

const repos = require("../../lib/github-handlers/repos");
const repo = require("../../lib/github-handlers/repo");
const issues = require("../../lib/github-handlers/issues");
const pulls = require("../../lib/github-handlers/pulls");
const commits = require("../../lib/github-handlers/commits");
const checks = require("../../lib/github-handlers/checks");
const blockers = require("../../lib/github-handlers/blockers");
const createIssue = require("../../lib/github-handlers/create-issue");
const commentIssue = require("../../lib/github-handlers/comment-issue");
const createBranch = require("../../lib/github-handlers/create-branch");
const openPr = require("../../lib/github-handlers/open-pr");

const ROUTES = {
  repos,
  repo,
  issues,
  pulls,
  commits,
  checks,
  blockers,
  "create-issue": createIssue,
  "comment-issue": commentIssue,
  "create-branch": createBranch,
  "open-pr": openPr,
};

module.exports = async function handler(req, res) {
  const segments = [].concat(req.query.action || []);
  const route = ROUTES[segments[0]];

  if (!route) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Unknown route: /api/github/${segments.join("/")}` }));
    return;
  }

  return route(req, res);
};
