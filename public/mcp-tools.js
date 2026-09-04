/**
 * WebMCP tool registration.
 *
 * Every tool wraps a Board method from app.js — the same functions the
 * person's own clicks and drags call. The important asymmetry lives
 * inside Board, not here: deleting a task or marking an externally
 * visible task "done" quietly turns into a pending decision instead of
 * executing when the caller is an agent, and a human's own actions on
 * their own board never are. propose_plan is how an agent brings a
 * multi-step, multi-option plan to the Decision Room instead of just
 * doing the work; approve_decision / reject_decision are how an agent
 * carries out a resolution the person expressed in conversation.
 */

const COLUMN_ENUM = ["todo", "doing", "done"];
const PRIORITY_ENUM = ["low", "medium", "high"];
const RISK_ENUM = ["low", "medium", "high"];

function setStatus(kind, label) {
  const el = document.getElementById("mcp-status");
  el.className = `mcp-status mcp-status--${kind}`;
  el.querySelector(".mcp-status-label").textContent = label;
}

function textResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
function errorResult(err) {
  return { content: [{ type: "text", text: `Error: ${err.message || String(err)}` }], isError: true };
}

function registerTools() {
  const mc = document.modelContext;

  /* ---------- reads ---------- */

  mc.registerTool({
    name: "get_board_summary",
    description:
      "Get the current mission (goal, deadline, budget, constraints), whether GitHub is connected and which repository is selected, task counts by column and priority, total estimated cost, whether that's over budget, how many external tasks are still unapproved, and how many decisions are waiting. Call this first, before doing anything else, to understand the current situation.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        return textResult(window.Board.summary());
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "list_tasks",
    description: "List tasks on the board, optionally filtered to a single column.",
    inputSchema: {
      type: "object",
      properties: {
        column: { type: "string", enum: COLUMN_ENUM, description: "Only return tasks in this column. Omit for all tasks." },
      },
    },
    async execute({ column } = {}) {
      try {
        return textResult(window.Board.list(column));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "search_tasks",
    description: "Search task titles and notes for a keyword or phrase.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for, case-insensitive." } },
      required: ["query"],
    },
    async execute({ query }) {
      try {
        return textResult(window.Board.search(query));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "get_activity_ledger",
    description: "Read recent activity — who did what, and why — in chronological order. Useful before proposing a plan, so you don't repeat work already done.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "How many recent entries to return. Defaults to 30." } },
    },
    async execute({ limit } = {}) {
      try {
        return textResult(window.Board.getLedger(limit || 30));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  /* ---------- mission ---------- */

  mc.registerTool({
    name: "set_mission",
    description:
      "Record the mission the person described: what they're trying to accomplish, the deadline, the budget, and any constraints they stated (e.g. 'don't publish anything without my approval'). Call this as soon as a person states or changes their goal, so it's visible on the shared board rather than left in conversation.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short statement of the goal." },
        deadline: { type: "string", description: "ISO date, e.g. 2026-09-12." },
        budget: { type: "number", description: "Budget ceiling, in the same currency the person used." },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "The rules the agent must operate within, e.g. 'No weekend work'.",
        },
      },
    },
    async execute(input) {
      try {
        return textResult(window.Board.setMission(input, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  /* ---------- tasks ---------- */

  mc.registerTool({
    name: "create_task",
    description:
      "Add a new task to the board. Mark external: true for anything that will be publicly or externally visible once done (a published page, a sent email, a live announcement) — that flag is what makes move_task ask for approval before it's marked done.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        column: { type: "string", enum: COLUMN_ENUM, description: "Defaults to 'todo'." },
        priority: { type: "string", enum: PRIORITY_ENUM, description: "Defaults to 'medium'." },
        notes: { type: "string" },
        cost: { type: "number", description: "Estimated cost of this task, if the mission tracks a budget." },
        external: { type: "boolean", description: "True if completing this task makes something publicly visible." },
      },
      required: ["title"],
    },
    async execute(input) {
      try {
        return textResult(window.Board.create(input, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "update_task",
    description: "Edit an existing task's title, notes, priority, or cost estimate.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        priority: { type: "string", enum: PRIORITY_ENUM },
        cost: { type: "number" },
      },
      required: ["id"],
    },
    async execute({ id, ...patch }) {
      try {
        return textResult(window.Board.update(id, patch, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "move_task",
    description:
      "Move a task to a different column. Moving a task marked external into 'done' does not execute immediately — it raises a decision in the Decision Room and this call returns { status: 'pending_approval' } instead of the updated task.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        column: { type: "string", enum: COLUMN_ENUM },
      },
      required: ["id", "column"],
    },
    async execute({ id, column }) {
      try {
        return textResult(window.Board.move(id, column, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "delete_task",
    description:
      "Remove a task. This never executes immediately for an agent — it raises a decision in the Decision Room and returns { status: 'pending_approval' }. Prefer moving to 'done' unless the person specifically wants it gone.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async execute({ id }) {
      try {
        return textResult(window.Board.remove(id, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  /* ---------- decisions / plans ---------- */

  mc.registerTool({
    name: "propose_plan",
    description:
      "Bring a plan to the person instead of just executing it. Use this for anything with a real tradeoff (cost vs. scope, speed vs. risk) or that touches several tasks at once. Give one option if there's a single clear course of action, or two-to-three if there's a genuine choice — each option lists the concrete board changes it would make if approved. Nothing in 'changes' happens until the person (or you, once they've said 'approve it') calls approve_decision.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name for the decision, e.g. 'Get the launch under budget'." },
        rationale: { type: "string", description: "Why you're raising this now, in plain terms." },
        options: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short name, e.g. 'Cut the animation work'." },
              description: { type: "string", description: "What this option does and what it trades off." },
              costEstimate: { type: "number" },
              risk: { type: "string", enum: RISK_ENUM },
              changes: {
                type: "array",
                description:
                  "Changes to apply if this option is approved. Board changes (move/update/create/delete) apply instantly. github_* changes are real GitHub writes — they only ever run from here, after approval, never from a direct tool call. github_create_issue needs {action, owner, repo, title, body?, labels?}. github_comment_issue needs {action, owner, repo, number, body}. github_create_branch needs {action, owner, repo, branchName, fromRef?}. github_open_pr needs {action, owner, repo, title, head, base?, body?}.",
                items: {
                  type: "object",
                  properties: {
                    action: {
                      type: "string",
                      enum: ["move", "update", "create", "delete", "github_create_issue", "github_comment_issue", "github_create_branch", "github_open_pr"],
                    },
                    id: { type: "string", description: "Task id — required for move, update, delete." },
                    column: { type: "string", enum: COLUMN_ENUM, description: "Required for move." },
                    patch: { type: "object", description: "Fields to change — used for update." },
                    task: { type: "object", description: "New task fields — used for create." },
                    owner: { type: "string", description: "Repo owner — required for github_* actions." },
                    repo: { type: "string", description: "Repo name — required for github_* actions." },
                    title: { type: "string", description: "Used by github_create_issue and github_open_pr." },
                    body: { type: "string", description: "Used by github_create_issue, github_comment_issue, github_open_pr." },
                    labels: { type: "array", items: { type: "string" }, description: "Used by github_create_issue." },
                    number: { type: "number", description: "Issue number — used by github_comment_issue." },
                    branchName: { type: "string", description: "Used by github_create_branch." },
                    fromRef: { type: "string", description: "Base branch for github_create_branch. Defaults to the repo's default branch." },
                    head: { type: "string", description: "Head branch — used by github_open_pr." },
                    base: { type: "string", description: "Base branch for github_open_pr. Defaults to the repo's default branch." },
                  },
                  required: ["action"],
                },
              },
            },
            required: ["label", "description"],
          },
        },
      },
      required: ["title", "options"],
    },
    async execute(input) {
      try {
        return textResult(window.Board.proposePlan(input, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "approve_decision",
    description:
      "Approve a pending decision — use this when the person tells you, in conversation, to go ahead with a proposal or a gated action you raised. This is what actually applies the change (including any GitHub write); approving executes the chosen option's changes immediately.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The decision id, from propose_plan's result or get_board_summary." },
        optionId: { type: "string", description: "Which option to approve. Omit if the decision only has one." },
      },
      required: ["id"],
    },
    async execute({ id, optionId }) {
      try {
        return textResult(await window.Board.approveDecision(id, optionId, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "reject_decision",
    description: "Reject a pending decision — use this when the person tells you not to go ahead with something you raised.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["id"],
    },
    async execute({ id, reason }) {
      try {
        return textResult(window.Board.rejectDecision(id, reason, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  /* ---------- GitHub context (read-only) ----------
   *
   * There is no WebMCP tool for connecting GitHub — that's an ordinary
   * sign-in flow the person does themselves from the Repository panel,
   * never something an agent can trigger. Everything below only works
   * once a person has connected an account and selected a repository;
   * if either is missing, these calls return a clear error explaining
   * what the person needs to do, rather than failing silently.
   *
   * There is also no direct write tool here (no create_github_issue,
   * etc.) — every GitHub write is a `changes` entry inside propose_plan,
   * so it can only ever happen after approve_decision runs it.
   */

  mc.registerTool({
    name: "select_repository",
    description:
      "Set which repository the mission is scoped to. owner/repo must be a repository the connected account can access. This doesn't change anything on GitHub — it just tells the board (and the tools below) which repo to read from by default.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
    async execute({ owner, repo }) {
      try {
        const data = await window.Board.inspectRepository(owner, repo, "agent");
        return textResult(window.Board.setRepo({ owner: data.owner, name: data.name, fullName: data.fullName, defaultBranch: data.defaultBranch }, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "inspect_repository",
    description:
      "Get a repository's basic metadata: description, default branch, whether it's private, open issue count, stars, and when it was last pushed to. Omit owner/repo to use the currently selected repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Omit to use the currently selected repository." },
        repo: { type: "string", description: "Omit to use the currently selected repository." },
      },
    },
    async execute({ owner, repo } = {}) {
      try {
        return textResult(await window.Board.inspectRepository(owner, repo, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "list_repo_issues",
    description: "List a repository's issues (pull requests are excluded). Omit owner/repo to use the currently selected repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Defaults to 'open'." },
      },
    },
    async execute({ owner, repo, state } = {}) {
      try {
        return textResult(await window.Board.listRepoIssues(owner, repo, state, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "list_repo_pull_requests",
    description:
      "List a repository's pull requests, including each PR's head/base branches and the head commit SHA (useful for get_repo_check_status). Omit owner/repo to use the currently selected repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Defaults to 'open'." },
      },
    },
    async execute({ owner, repo, state } = {}) {
      try {
        return textResult(await window.Board.listRepoPulls(owner, repo, state, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "list_repo_commits",
    description: "List a repository's most recent commits. Omit owner/repo to use the currently selected repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        perPage: { type: "number", description: "How many commits to return. Defaults to 10, maximum 30." },
      },
    },
    async execute({ owner, repo, perPage } = {}) {
      try {
        return textResult(await window.Board.listRepoCommits(owner, repo, perPage, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "get_repo_check_status",
    description:
      "Get CI/check-run status for a ref — a branch name or a commit SHA (e.g. a PR's head SHA from list_repo_pull_requests). Omit ref to check the repository's default branch. Omit owner/repo to use the currently selected repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        ref: { type: "string", description: "Branch name or commit SHA. Defaults to the default branch." },
      },
    },
    async execute({ owner, repo, ref } = {}) {
      try {
        return textResult(await window.Board.getRepoChecks(owner, repo, ref, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  mc.registerTool({
    name: "find_repo_blockers",
    description:
      "Scan open issues and pull requests for likely blockers: bodies mentioning 'blocked by #N' / 'depends on #N', and PRs whose latest checks are failing. Returns each flagged item with its likely owner and the reason it was flagged. This is a heuristic, not a guaranteed dependency graph — say so if you relay it. Omit owner/repo to use the currently selected repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
    },
    async execute({ owner, repo } = {}) {
      try {
        return textResult(await window.Board.findRepoBlockers(owner, repo, "agent"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });
}

/**
 * document.modelContext is injected by WebMCP-capable browsers (e.g. an
 * agent's in-app browser, or Chrome with the WebMCP flag enabled). It can
 * appear slightly after this script runs, so poll briefly before giving up.
 */
function waitForModelContext(timeoutMs = 8000, intervalMs = 200) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function poll() {
      if (typeof document.modelContext !== "undefined" && document.modelContext) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, intervalMs);
    })();
  });
}

(async function init() {
  setStatus("checking", "Checking for WebMCP…");
  const available = await waitForModelContext();
  if (!available) {
    setStatus("unavailable", "WebMCP not detected in this browser");
    return;
  }
  try {
    registerTools();
    setStatus("ready", "19 tools registered for your agent");
  } catch (err) {
    console.error("Failed to register WebMCP tools", err);
    setStatus("unavailable", "Tool registration failed — see console");
  }
})();
