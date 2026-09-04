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
UI's own clicks call (`public/app.js`). There's exactly one implementation
of "move a task," "propose a plan," or "inspect a repository" — the
difference between a person doing it and an agent doing it is a single
`actor` argument that a handful of `Board` methods check before deciding
whether to act immediately or raise a decision instead. That asymmetry is
the same story for GitHub as for the board: reading is autonomous, writing
is not — an agent can inspect issues, PRs, commits, and CI status freely,
but every GitHub write is a `changes` entry inside a proposed plan, and it
only ever runs from inside `approveDecision`, after a person resolves it.

## What this makes possible that wasn't possible before

- **A plan grounded in real project state, not a guess.** Ask your agent
  to figure out what's blocking the launch, and it can actually look —
  `find_repo_blockers` scans open issues and PRs for "blocked by #12" /
  "depends on #7" language and for PRs whose latest checks are failing —
  instead of asking you to describe the state of your repo to it.
- **A hard line around external, irreversible action**, covering two
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
  outcome.** Read-only inspection calls log to the ledger too, so "scanned
  acme/site for blockers — found 2" sits right next to the plan it led to.
  Replay scrubs through the whole thing as one continuous sequence.

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

The gate for board actions lives in `Board.move()` and `Board.remove()` in
`public/app.js`, each checking `actor === "agent"` before deciding whether
to apply the change or raise a decision. The gate for GitHub writes is
structural: those four actions (`github_create_issue`, `github_comment_issue`,
`github_create_branch`, `github_open_pr`) are only ever reachable from
`Board._applyChange`, which only runs from `Board.approveDecision`, which
only runs on a decision a person (or an agent explicitly relaying a
person's "yes, do it") resolved.

## How it's implemented

**Frontend** — plain HTML/CSS/JS, no framework, served as static files.
- `public/app.js` defines the `Board` API — `getMission`/`setMission`,
  `setRepo`/`getRepo`, `list`/`search`/`summary`, `create`/`update`/`move`/
  `remove`, `proposePlan`/`approveDecision`/`rejectDecision`, and the
  read-only GitHub methods — called by both the UI's event listeners and
  the WebMCP tools, tagged `"human"` or `"agent"` depending on who called
  it. Board state lives in `localStorage`; the GitHub session never does.
- `public/mcp-tools.js` registers 19 tools against `document.modelContext`.
- `public/index.html` / `public/style.css` are unchanged static assets.
  There's no `app/page.js` — Next.js's App Router only needs to know
  about the API; the frontend is served via a rewrite (see below).

**Backend** — Next.js App Router Route Handlers (`app/api/**/route.js`),
deployed on Vercel like the rest of the app.
- **Why Next.js at all**, given the frontend is deliberately
  framework-free: this project originally shipped its backend as plain
  `(req, res) => {}` files under `/api`, Vercel's zero-config Serverless
  Functions convention. Two real problems came up running that in
  production: (1) Vercel's Hobby plan caps a deployment at **12**
  Serverless Functions, and this project has enough real endpoints (OAuth
  + eleven GitHub routes) to blow past that with one file per endpoint;
  and (2) consolidating those into catch-all files (`[...action].js`)
  to fix (1) exposed that Vercel's plain Node runtime does **not**
  reliably populate `req.query` from a dynamic path segment the way a
  framework does — the matched segment came back empty in production.
  Next.js's App Router solves both: `context.params` for a
  `[...action]` route is officially documented and reliably populated,
  and Vercel treats one `route.js` file (regardless of how many HTTP
  methods it exports) as one Function — so the whole backend is 2
  Functions, not 15.
- `lib/session.js` — encrypts the GitHub token into an httpOnly,
  AES-256-GCM cookie, read and written via `NextRequest`/`NextResponse`'s
  built-in cookie APIs (`crypto`, no database). `lib/github.js` — a thin
  authenticated wrapper around the GitHub REST API. `lib/http.js` — small
  query/body/error-response helpers built on the Web `Request`/`Response`
  objects Route Handlers already use.
- `lib/auth-handlers/{login,callback,status,logout}.js` — the OAuth flow.
- `lib/github-handlers/{repo,issues,pulls,commits,checks,blockers,repos,
  create-issue,comment-issue,create-branch,open-pr}.js` — read-only
  proxies plus the four write endpoints. None of them enforce the
  approval boundary themselves (that's a product decision, not a
  permissions system) — the boundary is that nothing in this codebase
  calls the writes except `Board._applyChange`, which only runs after
  `approveDecision`.
- `app/api/auth/github/[...action]/route.js` and
  `app/api/github/[...action]/route.js` — the only two files under
  `app/`. Each exports `GET`/`POST` functions that read the matched
  segment off `context.params.action` and dispatch to the real handler in
  `lib/`. Public URLs are unchanged from a one-file-per-endpoint layout
  (`/api/auth/github/login`, `/api/github/issues?owner=…`, etc.).
- `next.config.js` adds one rewrite — `/` → `/index.html` — so the static
  frontend, not a Next.js page, is what's served at the root.

I verified this end-to-end locally before shipping it: a real `next build`
(2 Functions, as expected), a real `next start`, and `curl` against the
running server confirming static assets serve, `/api/auth/github/login`
redirects with the OAuth `state` cookie set, unknown sub-routes 404 with
the matched segment correctly reported (proving `context.params` works,
which is the whole reason for this move), a real encrypted session cookie
round-trips through `/api/auth/github/status`, and an authenticated
request against a fake token reaches the real GitHub API and cleanly
proxies back GitHub's own 401.

## Running it locally

```bash
npm install
npm run dev
```

Without `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`SESSION_SECRET` set,
the board still works fully — the Repository panel just shows "Connect
GitHub," and the connect link returns a clear JSON error instead of
silently failing.

## Setting up GitHub OAuth

1. Deploy to Vercel: `npx vercel deploy --prod` (or connect the GitHub
   repo in the Vercel dashboard — Next.js is auto-detected, no config
   needed).
2. Create a GitHub OAuth App at
   [github.com/settings/developers](https://github.com/settings/developers):
   - Homepage URL: your deployed URL.
   - Authorization callback URL: `<your deployed URL>/api/auth/github/callback`.
3. Set three environment variables on Vercel (see `.env.example`):
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (any long
   random string — `openssl rand -hex 32`), and `APP_URL` (your deployed
   URL, no trailing slash).
4. Redeploy after setting env vars — Vercel only picks them up on the
   next deploy, not retroactively. "Connect GitHub" now works.

## Testing the WebMCP integration

- **ChatGPT's in-app browser** supports WebMCP out of the box. Try:
  *"Our goal is to launch the pricing page by Friday, budget $2,000, and
  don't publish anything without asking me first. Use the acme/site repo
  I've connected — what's blocking us, and what's the plan?"*
- **Google Chrome** — enable `chrome://flags/#enable-webmcp-testing`,
  reload, then open the deployed URL with an agent that talks to the
  page's tools.
- If WebMCP isn't detected, the status pill says so instead of silently
  failing. If GitHub isn't connected, the repo tools return a clear error.
- **Load sample mission** resets the board without touching your GitHub
  connection or selected repository.

## Project structure

```
handoff/
├── public/
│   ├── index.html         # served at "/" via next.config.js rewrite
│   ├── style.css
│   ├── app.js              # state, rendering, the Board API (shared by UI + tools)
│   └── mcp-tools.js        # document.modelContext.registerTool(...) calls
├── app/
│   └── api/
│       ├── auth/github/[...action]/route.js   # login/callback/status/logout
│       └── github/[...action]/route.js        # repo/issues/pulls/commits/checks/
│                                              # blockers/repos/create-issue/
│                                              # comment-issue/create-branch/open-pr
├── lib/
│   ├── session.js, github.js, http.js   # shared helpers
│   ├── auth-handlers/                    # the real OAuth logic
│   └── github-handlers/                  # the real GitHub proxy logic
├── next.config.js
├── .env.example
├── LICENSE                # MIT
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).
