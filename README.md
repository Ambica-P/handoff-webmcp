# Handoff

**Intent in. A plan back. Nothing external without you.**

Handoff is a shared command center for a person and their agent. You state
a mission — a goal, a deadline, a budget, some constraints — and, optionally,
connect a GitHub repository. Your agent reads the board and the repository
over WebMCP, does the parts of the work it's trusted to do on its own, and
for anything consequential — deleting something, shipping something
publicly, opening a GitHub issue or PR, or committing to a plan with real
tradeoffs — it brings you a decision instead of just acting.

Built for the [WebMCP Challenge](https://www.google.com/search?q=webmcp+challenge).

**Live:** [handoff-webmcp-lyart.vercel.app](https://handoff-webmcp-lyart.vercel.app/)

---

## The pipeline

```
Mission  →  GitHub context  →  Detected work  →  Dependencies/blockers
   →  Agent plan  →  Human decision  →  Approved GitHub action  →  Result
```

A person states a mission. If they've connected GitHub, the agent can
inspect the actual repository — open issues, open PRs, recent commits, CI
status — instead of reasoning over a toy board. When it finds something
worth doing, it proposes a plan with real tradeoffs. A person resolves that
plan from the Decision Room. Only then does anything execute — including,
if the plan called for it, an actual GitHub write. Every step lands in the
ledger, and the whole session can be replayed from the top.

## Why this is a strong fit for WebMCP

Most agent demos are either a chatbot describing what it would do, or a
tool quietly doing things and reporting back after the fact. Handoff is
built so an agent instead operates **inside** the same structured state a
person is looking at, through calls that are validated, typed, and
attributable — not DOM guesses, and not a black box on someone else's
server either.

Every tool call is a real function call into the same `Board` object the
UI's own clicks call (`app.js`). There's exactly one implementation of
"move a task," "propose a plan," or "inspect a repository" — the
difference between a person doing it and an agent doing it is a single
`actor` argument that a handful of `Board` methods check before deciding
whether to act immediately or raise a decision instead. That asymmetry is
now the same story for GitHub as it already was for the board: reading is
autonomous, writing is not — an agent can inspect issues, PRs, commits, and
CI status freely, but every GitHub write is a `changes` entry inside a
proposed plan, and it only ever runs from inside `approveDecision`, after a
person resolves it.

## What this makes possible that wasn't possible before

- **A plan grounded in real project state, not a guess.** Ask your agent
  to figure out what's blocking the launch, and it can actually look —
  `find_repo_blockers` scans open issues and PRs for "blocked by #12" /
  "depends on #7" language and for PRs whose latest checks are failing —
  instead of asking you to describe the state of your repo to it.
- **A hard line around external, irreversible action**, now covering two
  systems with one mental model: marking an `external` task "done," or
  deleting anything, needs approval; so does every GitHub write, because
  `github_*` change types only ever execute from inside an approved
  decision. There is no `create_github_issue` tool an agent can call
  directly — the only way an issue, a comment, a branch, or a PR gets
  created is by being proposed, then approved.
- **The token never touches the agent, or the browser's own JS.** GitHub
  OAuth is an ordinary sign-in flow — a redirect the person clicks, not a
  WebMCP tool — and the resulting token lives only in an encrypted,
  httpOnly cookie that the backend decrypts to make GitHub calls. Every
  `/api/github/*` response is shaped JSON; the raw token is never in a
  response body a WebMCP tool (or client-side JS of any kind) can read.
- **An audit trail that actually shows the reasoning, not just the
  outcome.** Read-only inspection calls (`inspect_repository`,
  `list_repo_issues`, `find_repo_blockers`, …) log to the ledger too, so
  "scanned acme/site for blockers — found 2" sits right next to the plan
  it led to. Replay scrubs through the whole thing — mission set →
  repository connected → issues scanned → blocker found → plan proposed →
  approved → issue opened on GitHub — as one continuous sequence.

## The permission model

| Action | Agent | Person |
|---|---|---|
| Read tasks, search, get a summary, read the ledger | Autonomous | — |
| Inspect a repo, list issues/PRs/commits, check CI, find blockers | Autonomous | — |
| Create or edit a task | Autonomous | Always allowed |
| Move a task (not marking an external task done) | Autonomous | Always allowed |
| Record or update the mission; select a repository | Autonomous | Always allowed |
| Propose a plan | Autonomous *to propose* — execution waits for approval | — |
| Mark an external task "done" | **Requires approval** | Always allowed |
| Delete a task | **Requires approval** | Always allowed |
| Any GitHub write (issue, comment, branch, PR) | **Requires approval** | — |
| Connect / disconnect GitHub | Not an agent action at all — ordinary sign-in | Always allowed |

The gate for board actions lives in `Board.move()` and `Board.remove()`,
each checking `actor === "agent"` before deciding whether to apply the
change or raise a decision. The gate for GitHub writes is structural rather
than a conditional: those four actions (`github_create_issue`,
`github_comment_issue`, `github_create_branch`, `github_open_pr`) are only
ever reachable from `Board._applyChange`, which is only ever called from
`Board.approveDecision`, which only ever runs on a decision a person (or an
agent explicitly relaying a person's "yes, do it") resolved. There is no
code path from a WebMCP tool straight to a GitHub write.

## How it's implemented

**Frontend** — plain HTML/CSS/JS, no build step, no framework.
- `app.js` defines the `Board` API. Everything — `getMission`/`setMission`,
  `setRepo`/`getRepo`, `list`/`search`/`summary`, `create`/`update`/`move`/
  `remove`, `proposePlan`/`approveDecision`/`rejectDecision`, and the
  read-only GitHub methods (`inspectRepository`, `listRepoIssues`,
  `listRepoPulls`, `listRepoCommits`, `getRepoChecks`, `findRepoBlockers`)
  — is called by both the UI's event listeners and the WebMCP tools,
  tagged `"human"` or `"agent"` depending on who called it. Board state
  (mission, repo selection, tasks, decisions, ledger) lives in
  `localStorage`; the GitHub session itself never does.
- `mcp-tools.js` registers 19 tools against `document.modelContext` — the
  original 12 board tools, plus `select_repository`, `inspect_repository`,
  `list_repo_issues`, `list_repo_pull_requests`, `list_repo_commits`,
  `get_repo_check_status`, and `find_repo_blockers`. `propose_plan`'s
  schema documents the four `github_*` change actions an approved plan
  can carry out.

**Backend** — a handful of small, dependency-free Node functions,
deployable as-is on Vercel (or adaptable to any host that can run a
`(req, res) => {}` handler).
- Vercel's Hobby plan caps a deployment at **12 Serverless Functions**,
  and treats every file under `/api` as one. With OAuth (4 routes) and
  GitHub context (11 routes), one file per endpoint would have been 15+.
  So `/api` holds only two files — `api/auth/github/[...action].js` and
  `api/github/[...action].js` — each a thin dispatcher using Vercel's
  catch-all dynamic-route convention. The public URLs are unchanged
  (`/api/auth/github/login`, `/api/github/issues?owner=…`, etc.); each
  dispatcher just reads the matched segment from `req.query.action` and
  calls the real handler. All the actual logic, plus the shared
  `session`/`github`/`http` helpers, lives under `lib/` at the project
  root — outside `/api` entirely, so none of it is ever mistaken for a
  route.
- `lib/session.js` — encrypts the GitHub token into an httpOnly,
  AES-256-GCM cookie (`crypto`, no database). `lib/github.js` — a thin
  authenticated wrapper around the GitHub REST API. `lib/http.js` — JSON
  body/response helpers.
- `lib/auth-handlers/{login,callback,status,logout}.js` — the OAuth flow.
  `login` is a plain redirect (with a CSRF `state` cookie); `callback`
  exchanges the code and sets the session cookie; `status` tells the
  frontend who's connected without ever returning the token; `logout`
  clears the cookie.
- `lib/github-handlers/{repo,issues,pulls,commits,checks,blockers,repos}.js`
  — read-only, authenticated proxies to GitHub, shaped into small JSON
  payloads.
- `lib/github-handlers/{create-issue,comment-issue,create-branch,open-pr}.js`
  — the four write endpoints. They don't enforce the approval boundary
  themselves (that's a product decision, not a permissions system) — the
  boundary is that nothing in this codebase calls them except
  `Board._applyChange`, which only runs after `approveDecision`.

## Running it locally

The board works with zero setup:

```bash
npx serve .
# or: python3 -m http.server 5173
```

Without a backend deployed, the Repository panel just shows "Connect
GitHub" and the connect link 404s — the rest of the app (mission, board,
decisions, ledger, replay) works exactly as before.

## Setting up GitHub OAuth

1. Deploy the app somewhere that runs the `api/` functions (Vercel is the
   easiest — `npx vercel deploy --prod`; the `api/` directory is
   auto-detected, no config needed).
2. Create a GitHub OAuth App at
   [github.com/settings/developers](https://github.com/settings/developers):
   - Homepage URL: your deployed URL.
   - Authorization callback URL: `<your deployed URL>/api/auth/github/callback`.
3. Set three environment variables on your host (see `.env.example`):
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (any long
   random string — `openssl rand -hex 32`), and `APP_URL` (your deployed
   URL, no trailing slash).
4. Redeploy. The Repository panel's "Connect GitHub" button now works —
   it requests `repo read:user` scope, so it can read and, once you
   approve a plan that calls for it, write to repos you can access.

## Testing the WebMCP integration

- **ChatGPT's in-app browser** supports WebMCP out of the box. Try:
  *"Our goal is to launch the pricing page by Friday, budget $2,000, and
  don't publish anything without asking me first. Use the acme/site repo
  I've connected — what's blocking us, and what's the plan?"*
- **Google Chrome** — enable `chrome://flags/#enable-webmcp-testing`,
  reload, then open the deployed URL with an agent that talks to the
  page's tools.
- If WebMCP isn't detected, the status pill says so instead of silently
  failing. If GitHub isn't connected, the repo tools return a clear error
  telling the agent (and, by extension, the person) what to do.
- **Load sample mission** resets the board to a demo-ready state without
  touching your GitHub connection or selected repository.

## Project structure

```
handoff/
├── index.html          # markup: mission, repository, board, decision room, ledger, replay
├── style.css             # visual design
├── app.js                # state, rendering, the Board API (shared by UI + tools)
├── mcp-tools.js           # document.modelContext.registerTool(...) calls
├── api/
│   ├── auth/github/[...action].js   # dispatches login/callback/status/logout
│   └── github/[...action].js        # dispatches repo/issues/pulls/commits/checks/
│                                    # blockers/repos/create-issue/comment-issue/
│                                    # create-branch/open-pr
├── lib/
│   ├── session.js, github.js, http.js   # shared helpers (never routed as functions)
│   ├── auth-handlers/                    # the real OAuth logic
│   └── github-handlers/                  # the real GitHub proxy logic
├── .env.example
├── LICENSE                # MIT
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
