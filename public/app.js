/**
 * Handoff — a command center for a person and their agent.
 *
 * The model: a person states a MISSION (a goal, a deadline, a budget,
 * some constraints). Their agent reads the board, works the TASKS it's
 * free to work, and for anything consequential — deleting something,
 * marking an externally-visible task done, or proposing a multi-step
 * plan with tradeoffs — it raises a DECISION instead of just acting.
 * Decisions sit in the Decision Room until a human resolves them. Every
 * step, by either party, lands in the LEDGER with a reason attached.
 *
 * As with the simpler version of this app, there is exactly one
 * implementation of each action. The UI's buttons and the WebMCP tools
 * in mcp-tools.js both call the same Board methods below, tagged with
 * who called them. Nothing an agent can do bypasses validation or the
 * approval gate that a human's own clicks aren't subject to.
 */

const STORAGE_KEY = "handoff_command_center_v1";

const COLUMNS = ["todo", "doing", "done"];
const COLUMN_LABEL = { todo: "To do", doing: "In progress", done: "Done" };
const PRIORITIES = ["low", "medium", "high"];
const RISKS = ["low", "medium", "high"];
const LEDGER_CAP = 150;

let state = loadState();

function defaultState() {
  return {
    mission: null,
    github: { connected: false, login: null, avatarUrl: null }, // display cache; source of truth is the server session
    repo: null, // { owner, name, fullName, defaultBranch } — the repo the mission is scoped to
    tasks: [],
    decisions: [],
    ledger: [],
    stats: { autonomousActions: 0, gatedActions: 0 },
  };
}

/** Thin fetch wrapper for our own backend (/api/*). Never touches GitHub directly. */
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    }
  } catch (e) {
    console.warn("Could not read saved board, starting fresh.", e);
  }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save board.", e);
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function now() {
  return Date.now();
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function money(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T23:59:59");
  const diffMs = target - new Date();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function deadlineLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  if (d < 0) return `overdue by ${Math.abs(d)}d`;
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return `due in ${d}d`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}
function findDecision(id) {
  return state.decisions.find((d) => d.id === id);
}

function snapshot() {
  return {
    mission: state.mission ? deepClone(state.mission) : null,
    repo: state.repo ? deepClone(state.repo) : null,
    tasks: deepClone(state.tasks),
    decisions: deepClone(state.decisions),
  };
}

function log(actor, text, opts = {}) {
  const entry = {
    id: uid(),
    ts: now(),
    actor,
    text,
    why: opts.why || null,
    link: opts.link || null,
  };
  state.ledger.push(entry);
  entry.snapshot = snapshot();
  if (state.ledger.length > LEDGER_CAP) state.ledger = state.ledger.slice(-LEDGER_CAP);
}

/* ------------------------------------------------------------------ */
/* Board API — shared by click handlers and WebMCP tools               */
/* ------------------------------------------------------------------ */

const Board = {
  /* ---- reads ---- */

  list(column) {
    const tasks = column ? state.tasks.filter((t) => t.column === column) : state.tasks;
    return tasks.map((t) => ({ ...t }));
  },

  search(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return this.list();
    return state.tasks
      .filter((t) => t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q))
      .map((t) => ({ ...t }));
  },

  getMission() {
    return state.mission ? { ...state.mission, constraints: [...state.mission.constraints] } : null;
  },

  getRepo() {
    return state.repo ? { ...state.repo } : null;
  },

  getGithubStatus() {
    return { ...state.github };
  },

  listDecisions(status) {
    const decisions = status ? state.decisions.filter((d) => d.status === status) : state.decisions;
    return decisions.map((d) => deepClone(d));
  },

  getLedger(limit = 30) {
    return state.ledger.slice(-limit).map(({ snapshot, ...rest }) => rest);
  },

  summary() {
    const byColumn = Object.fromEntries(COLUMNS.map((c) => [c, 0]));
    const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
    let totalCost = 0;
    let externalOpen = 0;
    for (const t of state.tasks) {
      byColumn[t.column]++;
      byPriority[t.priority]++;
      if (typeof t.cost === "number") totalCost += t.cost;
      if (t.external && t.column !== "done") externalOpen++;
    }
    const pending = state.decisions.filter((d) => d.status === "pending").length;
    const { autonomousActions, gatedActions } = state.stats;
    const totalAgentActions = autonomousActions + gatedActions;
    const autonomyPct = totalAgentActions === 0 ? null : Math.round((autonomousActions / totalAgentActions) * 100);

    return {
      mission: this.getMission(),
      github: this.getGithubStatus(),
      repo: this.getRepo(),
      totalTasks: state.tasks.length,
      byColumn,
      byPriority,
      totalEstimatedCost: totalCost,
      overBudget: state.mission && typeof state.mission.budget === "number" ? totalCost > state.mission.budget : null,
      externalTasksNotYetApproved: externalOpen,
      pendingDecisions: pending,
      agentAutonomyPercent: autonomyPct,
    };
  },

  /* ---- mission ---- */

  setMission(patch, actor = "human") {
    const existing = state.mission || {
      title: "",
      deadline: null,
      budget: null,
      constraints: [],
      updatedAt: now(),
      lastActor: actor,
    };
    const next = { ...existing };
    const changed = [];

    if (patch.title !== undefined) {
      next.title = String(patch.title).trim();
      changed.push("goal");
    }
    if (patch.deadline !== undefined) {
      next.deadline = patch.deadline || null;
      changed.push("deadline");
    }
    if (patch.budget !== undefined) {
      next.budget = patch.budget === null || patch.budget === "" ? null : Number(patch.budget);
      changed.push("budget");
    }
    if (patch.constraints !== undefined) {
      next.constraints = Array.isArray(patch.constraints)
        ? patch.constraints.map((c) => String(c).trim()).filter(Boolean)
        : String(patch.constraints)
            .split("\n")
            .map((c) => c.trim())
            .filter(Boolean);
      changed.push("constraints");
    }

    next.updatedAt = now();
    next.lastActor = actor;
    state.mission = next;

    if (actor === "agent") state.stats.autonomousActions++;
    log(actor, `set the mission (${changed.join(", ") || "no fields"})`, {
      why: actor === "agent" ? "translating the goal the person described into the shared board" : null,
    });
    persistAndRender();
    return this.getMission();
  },

  /* ---- repository selection ---- */

  setRepo({ owner, name, fullName, defaultBranch }, actor = "human") {
    if (!owner || !name) throw new Error("owner and name are required to select a repository.");
    state.repo = { owner, name, fullName: fullName || `${owner}/${name}`, defaultBranch: defaultBranch || "main" };
    if (actor === "agent") state.stats.autonomousActions++;
    log(actor, `set the mission's repository to ${state.repo.fullName}`);
    persistAndRender();
    return this.getRepo();
  },

  clearRepo(actor = "human") {
    if (!state.repo) return null;
    const was = state.repo.fullName;
    state.repo = null;
    log(actor, `cleared the mission's repository (was ${was})`);
    persistAndRender();
    return null;
  },

  /** Called after checking /api/auth/github/status — a display cache update, not a board action, so it isn't logged. */
  _setGithubStatus(status) {
    state.github = { connected: !!status.connected, login: status.login || null, avatarUrl: status.avatarUrl || null };
    saveState();
    renderRepoPanel();
    renderAutonomyPill();
  },

  /* ---- read-only GitHub context (used by the agent's inspection tools) ---- */
  //
  // These proxy straight to our backend, which holds the token. They resolve
  // owner/repo against the currently selected repository when the caller
  // omits them, and — unlike the human-facing "refresh" in the Repository
  // panel — they log to the ledger, because a tool call here is the agent
  // doing its homework, and that's exactly the kind of step the ledger and
  // Replay exist to make visible.

  _resolveRepo(owner, repo) {
    if (owner && repo) return { owner, repo };
    if (state.repo) return { owner: state.repo.owner, repo: state.repo.name };
    throw new Error("No repository selected yet. Connect GitHub and choose a repository from the Repository panel first.");
  },

  async inspectRepository(owner, repo, actor = "agent") {
    const target = this._resolveRepo(owner, repo);
    const data = await apiFetch(`/api/github/repo?owner=${encodeURIComponent(target.owner)}&repo=${encodeURIComponent(target.repo)}`);
    log(actor, `inspected repository ${target.owner}/${target.repo}`, { link: data.htmlUrl });
    persistAndRender();
    return data;
  },

  async listRepoIssues(owner, repo, state_ = "open", actor = "agent") {
    const target = this._resolveRepo(owner, repo);
    const data = await apiFetch(
      `/api/github/issues?owner=${encodeURIComponent(target.owner)}&repo=${encodeURIComponent(target.repo)}&state=${encodeURIComponent(state_ || "open")}`
    );
    log(actor, `listed ${data.length} ${state_ || "open"} issue${data.length === 1 ? "" : "s"} on ${target.owner}/${target.repo}`);
    persistAndRender();
    return data;
  },

  async listRepoPulls(owner, repo, state_ = "open", actor = "agent") {
    const target = this._resolveRepo(owner, repo);
    const data = await apiFetch(
      `/api/github/pulls?owner=${encodeURIComponent(target.owner)}&repo=${encodeURIComponent(target.repo)}&state=${encodeURIComponent(state_ || "open")}`
    );
    log(actor, `listed ${data.length} ${state_ || "open"} pull request${data.length === 1 ? "" : "s"} on ${target.owner}/${target.repo}`);
    persistAndRender();
    return data;
  },

  async listRepoCommits(owner, repo, perPage = 10, actor = "agent") {
    const target = this._resolveRepo(owner, repo);
    const data = await apiFetch(
      `/api/github/commits?owner=${encodeURIComponent(target.owner)}&repo=${encodeURIComponent(target.repo)}&per_page=${encodeURIComponent(perPage || 10)}`
    );
    log(actor, `checked recent commits on ${target.owner}/${target.repo}`);
    persistAndRender();
    return data;
  },

  async getRepoChecks(owner, repo, ref, actor = "agent") {
    const target = this._resolveRepo(owner, repo);
    const qs = ref ? `&ref=${encodeURIComponent(ref)}` : "";
    const data = await apiFetch(`/api/github/checks?owner=${encodeURIComponent(target.owner)}&repo=${encodeURIComponent(target.repo)}${qs}`);
    log(
      actor,
      `checked CI status on ${target.owner}/${target.repo}@${data.ref} — ${data.passing} passing, ${data.failing} failing, ${data.pending} pending`
    );
    persistAndRender();
    return data;
  },

  async findRepoBlockers(owner, repo, actor = "agent") {
    const target = this._resolveRepo(owner, repo);
    const data = await apiFetch(`/api/github/blockers?owner=${encodeURIComponent(target.owner)}&repo=${encodeURIComponent(target.repo)}`);
    log(actor, `scanned ${target.owner}/${target.repo} for blockers — found ${data.flagged.length}`, {
      why: data.flagged.length ? data.flagged.map((f) => `#${f.number} ${f.title}`).join("; ") : "nothing stuck right now",
    });
    persistAndRender();
    return data;
  },

  /* ---- tasks ---- */

  create(input, actor = "human") {
    const { title, column = "todo", priority = "medium", notes = "", cost = null, external = false } = input;
    if (!title || !title.trim()) throw new Error("A task needs a title.");
    if (!COLUMNS.includes(column)) throw new Error(`Column must be one of: ${COLUMNS.join(", ")}`);
    if (!PRIORITIES.includes(priority)) throw new Error(`Priority must be one of: ${PRIORITIES.join(", ")}`);

    const task = {
      id: uid(),
      title: title.trim(),
      notes: (notes || "").trim(),
      column,
      priority,
      cost: cost === null || cost === undefined || cost === "" ? null : Number(cost),
      external: !!external,
      createdBy: actor,
      lastActor: actor,
      createdAt: now(),
      updatedAt: now(),
    };
    state.tasks.unshift(task);

    if (actor === "agent") state.stats.autonomousActions++;
    log(actor, `added "${task.title}" to ${COLUMN_LABEL[column]}`);
    persistAndRender(task.id);
    return { ...task };
  },

  update(id, patch, actor = "human") {
    const task = findTask(id);
    if (!task) throw new Error(`No task with id "${id}".`);
    const changes = [];

    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new Error("Title can't be empty.");
      task.title = patch.title.trim();
      changes.push("title");
    }
    if (patch.notes !== undefined) {
      task.notes = patch.notes.trim();
      changes.push("notes");
    }
    if (patch.priority !== undefined) {
      if (!PRIORITIES.includes(patch.priority)) throw new Error(`Priority must be one of: ${PRIORITIES.join(", ")}`);
      task.priority = patch.priority;
      changes.push("priority");
    }
    if (patch.cost !== undefined) {
      task.cost = patch.cost === null || patch.cost === "" ? null : Number(patch.cost);
      changes.push("cost");
    }

    task.lastActor = actor;
    task.updatedAt = now();

    if (actor === "agent") state.stats.autonomousActions++;
    log(actor, `updated ${changes.join(", ") || "task"} on "${task.title}"`);
    persistAndRender(task.id);
    return { ...task };
  },

  /**
   * Moving a task is autonomous for an agent UNLESS it's marking an
   * externally-visible task as done — that's treated as "shipping"
   * something public, so it goes to the Decision Room instead.
   * A human moving their own board's cards is never gated.
   */
  move(id, column, actor = "human", opts = {}) {
    const task = findTask(id);
    if (!task) throw new Error(`No task with id "${id}".`);
    if (!COLUMNS.includes(column)) throw new Error(`Column must be one of: ${COLUMNS.join(", ")}`);

    const needsApproval = actor === "agent" && !opts.bypassGate && task.external && column === "done" && task.column !== "done";

    if (needsApproval) {
      const decision = this._raiseDecision({
        title: `Publish "${task.title}"?`,
        rationale: "This task is marked externally visible. I can mark it done, but that publishes it, so I'm asking first.",
        options: [
          {
            label: "Approve",
            description: `Mark "${task.title}" done and treat it as shipped.`,
            costEstimate: task.cost,
            risk: "low",
            changes: [{ action: "move", id: task.id, column: "done" }],
          },
        ],
        createdBy: actor,
      });
      return { status: "pending_approval", decision };
    }

    const from = task.column;
    task.column = column;
    task.lastActor = actor;
    task.updatedAt = now();

    if (actor === "agent") state.stats.autonomousActions++;
    if (from !== column) log(actor, `moved "${task.title}" from ${COLUMN_LABEL[from]} to ${COLUMN_LABEL[column]}`);
    persistAndRender(task.id);
    return { ...task };
  },

  /**
   * Deleting is always gated for an agent — it's destructive and hard
   * to undo, so it goes through the Decision Room rather than executing
   * immediately. A human deleting their own card is never gated.
   */
  remove(id, actor = "human", opts = {}) {
    const task = findTask(id);
    if (!task) throw new Error(`No task with id "${id}".`);

    if (actor === "agent" && !opts.bypassGate) {
      const decision = this._raiseDecision({
        title: `Delete "${task.title}"?`,
        rationale: "Deleting is hard to undo, so I'm asking before removing this rather than doing it myself.",
        options: [
          {
            label: "Approve",
            description: `Permanently remove "${task.title}" from the board.`,
            costEstimate: null,
            risk: "medium",
            changes: [{ action: "delete", id: task.id }],
          },
        ],
        createdBy: actor,
      });
      return { status: "pending_approval", decision };
    }

    state.tasks = state.tasks.filter((t) => t.id !== id);
    log(actor, `removed "${task.title}"`);
    persistAndRender(null);
    return { ok: true, id };
  },

  /* ---- decisions / plans ---- */

  /** Internal: create a pending decision and log why it was raised. */
  _raiseDecision({ title, rationale, options, createdBy }) {
    if (!title || !title.trim()) throw new Error("A decision needs a title.");
    if (!Array.isArray(options) || options.length === 0) throw new Error("A decision needs at least one option.");

    const decision = {
      id: uid(),
      title: title.trim(),
      rationale: (rationale || "").trim(),
      status: "pending",
      options: options.map((o) => ({
        id: uid(),
        label: o.label || "Approve",
        description: o.description || "",
        costEstimate: typeof o.costEstimate === "number" ? o.costEstimate : null,
        risk: RISKS.includes(o.risk) ? o.risk : null,
        changes: Array.isArray(o.changes) ? o.changes : [],
      })),
      chosenOptionId: null,
      createdBy,
      createdAt: now(),
      resolvedAt: null,
      resolvedBy: null,
    };
    state.decisions.unshift(decision);

    if (createdBy === "agent") state.stats.gatedActions++;
    log(createdBy, `raised a decision: "${decision.title}"`, { why: decision.rationale });
    persistAndRender(null);
    return deepClone(decision);
  },

  /**
   * An agent proposes a plan — one or more options, each with its own
   * cost/risk and the concrete board changes it implies. Proposing is
   * always agent-initiated and never auto-executes; a human (or the
   * agent, once told "approve it" in conversation) still has to pick.
   */
  proposePlan({ title, rationale, options }, actor = "agent") {
    return this._raiseDecision({ title, rationale, options, createdBy: actor });
  },

  /**
   * Approving is async because executing an option's changes may mean a
   * real GitHub write (a fetch to our own backend, which holds the
   * token). Everything up to this call is deliberation; this call is
   * the one moment anything actually happens.
   */
  async approveDecision(id, optionId, actor = "human") {
    const decision = findDecision(id);
    if (!decision) throw new Error(`No decision with id "${id}".`);
    if (decision.status !== "pending") throw new Error(`Decision "${decision.title}" is already ${decision.status}.`);

    const option = optionId ? decision.options.find((o) => o.id === optionId) : decision.options[0];
    if (!option) throw new Error("Couldn't find that option on this decision.");

    for (const change of option.changes) {
      await this._applyChange(change, "agent");
    }

    decision.status = "approved";
    decision.chosenOptionId = option.id;
    decision.resolvedAt = now();
    decision.resolvedBy = actor;

    log(actor, `approved "${decision.title}" → ${option.label}`);
    persistAndRender(null);
    return deepClone(decision);
  },

  rejectDecision(id, reason, actor = "human") {
    const decision = findDecision(id);
    if (!decision) throw new Error(`No decision with id "${id}".`);
    if (decision.status !== "pending") throw new Error(`Decision "${decision.title}" is already ${decision.status}.`);

    decision.status = "rejected";
    decision.resolvedAt = now();
    decision.resolvedBy = actor;

    log(actor, `rejected "${decision.title}"${reason ? ` — ${reason}` : ""}`);
    persistAndRender(null);
    return deepClone(decision);
  },

  /**
   * Internal: apply one change from an approved decision option. Board
   * changes (move/update/create/delete) are synchronous and local.
   * github_* changes are real, external writes — they go through our
   * own backend (never straight to GitHub from the browser) and are
   * the only place in this whole app where an outside system is
   * actually mutated. That's why they only ever run from inside
   * approveDecision: nothing calls _applyChange except a resolved,
   * human-sanctioned decision.
   */
  async _applyChange(change, actor) {
    switch (change.action) {
      case "move":
        this.move(change.id, change.column, actor, { bypassGate: true });
        return;
      case "update":
        this.update(change.id, change.patch || {}, actor);
        return;
      case "create":
        this.create(change.task || {}, actor);
        return;
      case "delete":
        this.remove(change.id, actor, { bypassGate: true });
        return;

      case "github_create_issue": {
        if (!change.owner || !change.repo || !change.title) throw new Error("github_create_issue needs owner, repo, and title.");
        const result = await apiFetch("/api/github/create-issue", { method: "POST", body: JSON.stringify(change) });
        log(actor, `opened GitHub issue #${result.number}: "${result.title}" on ${change.owner}/${change.repo}`, {
          why: "executing an approved plan",
          link: result.htmlUrl,
        });
        return result;
      }
      case "github_comment_issue": {
        if (!change.owner || !change.repo || !change.number || !change.body) {
          throw new Error("github_comment_issue needs owner, repo, number, and body.");
        }
        const result = await apiFetch("/api/github/comment-issue", { method: "POST", body: JSON.stringify(change) });
        log(actor, `commented on GitHub issue #${change.number} on ${change.owner}/${change.repo}`, {
          why: "executing an approved plan",
          link: result.htmlUrl,
        });
        return result;
      }
      case "github_create_branch": {
        if (!change.owner || !change.repo || !change.branchName) throw new Error("github_create_branch needs owner, repo, and branchName.");
        const result = await apiFetch("/api/github/create-branch", { method: "POST", body: JSON.stringify(change) });
        log(actor, `created branch "${change.branchName}" on ${change.owner}/${change.repo}`, { why: "executing an approved plan" });
        return result;
      }
      case "github_open_pr": {
        if (!change.owner || !change.repo || !change.title || !change.head) {
          throw new Error("github_open_pr needs owner, repo, title, and head.");
        }
        const result = await apiFetch("/api/github/open-pr", { method: "POST", body: JSON.stringify(change) });
        log(actor, `opened GitHub PR #${result.number}: "${result.title}" on ${change.owner}/${change.repo}`, {
          why: "executing an approved plan",
          link: result.htmlUrl,
        });
        return result;
      }

      default:
        console.warn("Unknown change action", change);
        return null;
    }
  },

  /* ---- housekeeping ---- */

  reset(actor = "human") {
    state = defaultState();
    log(actor, "cleared the board");
    persistAndRender(null);
  },

  seed(actor = "human") {
    state = defaultState();
    this.setMission(
      {
        title: "Launch the new pricing page by Friday",
        deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        budget: 2000,
        constraints: ["No weekend work", "Nothing external ships without my approval"],
      },
      actor
    );
    const seedTasks = [
      { title: "Research competitor pricing", column: "todo", priority: "medium", cost: 150 },
      { title: "Write new pricing copy", column: "todo", priority: "high", cost: 300 },
      { title: "Build the pricing page", column: "doing", priority: "high", cost: 900, external: true },
      { title: "QA the checkout flow", column: "doing", priority: "medium", cost: 250 },
      { title: "Draft the launch announcement", column: "done", priority: "low", cost: 120, external: true },
    ];
    for (const t of seedTasks) this.create(t, actor);
    log(actor, "loaded a sample mission");
    persistAndRender(null);
  },
};

window.Board = Board;

/* ------------------------------------------------------------------ */
/* Rendering — live board                                              */
/* ------------------------------------------------------------------ */

const cardTemplate = document.getElementById("card-template");
const decisionTemplate = document.getElementById("decision-template");
const optionTemplate = document.getElementById("option-template");

let lastTouchedId = null;

function persistAndRender(touchedId) {
  saveState();
  lastTouchedId = touchedId;
  render();
}

function render() {
  renderMission();
  renderRepoPanel();
  renderColumns();
  renderDecisions();
  renderLedger();
  renderAutonomyPill();
}

function renderMission() {
  const view = document.getElementById("mission-view");
  const m = state.mission;

  if (!m) {
    view.innerHTML = `<p class="mission-empty">No mission set yet. Tell your agent what you're trying to do — or set it yourself.</p>`;
    return;
  }

  const dLabel = deadlineLabel(m.deadline);
  const summary = Board.summary();
  const cost = summary.totalEstimatedCost;
  const overBudget = summary.overBudget;

  let budgetHtml = "";
  if (typeof m.budget === "number") {
    const pct = Math.min(100, Math.round((cost / m.budget) * 100));
    budgetHtml = `
      <div class="budget-track">
        <div class="budget-fill ${overBudget ? "over" : ""}" style="width:${pct}%"></div>
      </div>
      <p class="budget-label ${overBudget ? "over" : ""}">${money(cost)} estimated of ${money(m.budget)} budget${overBudget ? " — over budget" : ""}</p>
    `;
  } else if (cost > 0) {
    budgetHtml = `<p class="budget-label">${money(cost)} estimated across open tasks · no budget set</p>`;
  }

  view.innerHTML = `
    <h3 class="mission-title">${escapeHtml(m.title || "Untitled mission")}</h3>
    <div class="mission-tags">
      ${dLabel ? `<span class="mission-tag mission-tag--deadline">${escapeHtml(dLabel)}</span>` : ""}
      ${summary.pendingDecisions > 0 ? `<span class="mission-tag mission-tag--decisions">${summary.pendingDecisions} pending decision${summary.pendingDecisions === 1 ? "" : "s"}</span>` : ""}
    </div>
    ${budgetHtml}
    ${
      m.constraints.length
        ? `<ul class="constraint-list">${m.constraints.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
        : ""
    }
  `;
}

/* ------------------------------------------------------------------ */
/* Repository panel — GitHub connection, repo picker, live context      */
/* ------------------------------------------------------------------ */

let cachedRepoList = null;
let repoContext = null;

function renderRepoPanel() {
  const container = document.getElementById("repo-view");
  if (!container) return;
  const gh = state.github;
  const repo = state.repo;

  if (!gh.connected) {
    container.innerHTML = `
      <p class="repo-empty">Connect GitHub so your agent can read real issues, pull requests, and CI status — and, once you approve it, open or comment on them.</p>
      <a class="primary-btn repo-connect-btn" href="/api/auth/github/login">Connect GitHub</a>
    `;
    return;
  }

  const identity = `
    <div class="github-identity">
      ${gh.avatarUrl ? `<img class="github-avatar" src="${escapeAttr(gh.avatarUrl)}" alt="" width="22" height="22" />` : ""}
      <span class="github-login">${escapeHtml(gh.login || "GitHub")}</span>
      <button type="button" class="text-btn" id="github-disconnect-btn">Disconnect</button>
    </div>
  `;

  let repoSection;
  if (repo) {
    repoSection = `
      <div class="repo-chip">
        <span>${escapeHtml(repo.fullName)}</span>
        <button type="button" class="text-btn" id="repo-clear-btn">Change</button>
      </div>
      <div class="repo-context">${renderRepoContextStrip()}</div>
      <button type="button" class="ghost-btn" id="repo-refresh-btn">Refresh context</button>
    `;
  } else {
    repoSection = `
      <div class="repo-picker">
        <select id="repo-select">
          <option value="">${cachedRepoList ? "Choose a repository…" : "Loading repositories…"}</option>
          ${(cachedRepoList || [])
            .map((r) => `<option value="${escapeAttr(r.fullName)}">${escapeHtml(r.fullName)}${r.private ? " (private)" : ""}</option>`)
            .join("")}
        </select>
        <button type="button" class="primary-btn" id="repo-use-btn">Use this repository</button>
      </div>
    `;
  }

  container.innerHTML = identity + repoSection;

  const disconnectBtn = document.getElementById("github-disconnect-btn");
  if (disconnectBtn) disconnectBtn.addEventListener("click", disconnectGithub);

  if (repo) {
    document.getElementById("repo-clear-btn").addEventListener("click", () => {
      repoContext = null;
      Board.clearRepo("human");
    });
    document.getElementById("repo-refresh-btn").addEventListener("click", refreshRepoContext);
  } else {
    document.getElementById("repo-use-btn").addEventListener("click", useSelectedRepo);
    if (!cachedRepoList) loadRepoOptions();
  }
}

function renderRepoContextStrip() {
  if (!repoContext) return `<span class="repo-context-placeholder">Click "Refresh context" to check issues, PRs, and CI.</span>`;
  const { openIssuesCount, openPullsCount, latestCommitMessage, checks } = repoContext;
  const checksLabel = checks ? `${checks.passing} passing, ${checks.failing} failing` : "unknown";
  return `
    <span class="repo-stat">${openIssuesCount} open issue${openIssuesCount === 1 ? "" : "s"}</span>
    <span class="repo-stat">${openPullsCount} open PR${openPullsCount === 1 ? "" : "s"}</span>
    <span class="repo-stat">CI: ${escapeHtml(checksLabel)}</span>
    ${latestCommitMessage ? `<span class="repo-stat repo-stat--commit">“${escapeHtml(latestCommitMessage)}”</span>` : ""}
  `;
}

async function loadRepoOptions() {
  try {
    cachedRepoList = await apiFetch("/api/github/repos");
  } catch (err) {
    console.error("Could not load repositories", err);
    cachedRepoList = [];
  }
  renderRepoPanel();
}

function useSelectedRepo() {
  const select = document.getElementById("repo-select");
  const fullName = select && select.value;
  if (!fullName) return;
  const match = (cachedRepoList || []).find((r) => r.fullName === fullName);
  if (!match) return;
  repoContext = null;
  Board.setRepo({ owner: match.owner, name: match.name, fullName: match.fullName, defaultBranch: match.defaultBranch }, "human");
  refreshRepoContext();
}

async function refreshRepoContext() {
  const repo = state.repo;
  if (!repo) return;
  const btn = document.getElementById("repo-refresh-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Refreshing…";
  }
  try {
    const q = `owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`;
    const [issues, pulls, commits, checks] = await Promise.all([
      apiFetch(`/api/github/issues?${q}`),
      apiFetch(`/api/github/pulls?${q}`),
      apiFetch(`/api/github/commits?${q}&per_page=1`),
      apiFetch(`/api/github/checks?${q}`).catch(() => null),
    ]);
    repoContext = {
      openIssuesCount: issues.length,
      openPullsCount: pulls.length,
      latestCommitMessage: commits[0] ? commits[0].message : null,
      checks: checks ? { passing: checks.passing, failing: checks.failing } : null,
    };
  } catch (err) {
    console.error(err);
    alert(`Couldn't refresh repository context: ${err.message}`);
  } finally {
    renderRepoPanel();
  }
}

async function disconnectGithub() {
  try {
    await apiFetch("/api/auth/github/logout", { method: "POST" });
  } catch (err) {
    console.error(err);
  }
  cachedRepoList = null;
  repoContext = null;
  if (state.repo) Board.clearRepo("human");
  Board._setGithubStatus({ connected: false, login: null, avatarUrl: null });
}

async function refreshGithubStatus() {
  try {
    const data = await apiFetch("/api/auth/github/status");
    Board._setGithubStatus(data);
    if (data.connected && state.repo) refreshRepoContext();
  } catch (err) {
    // Most likely running on a host without the backend deployed (e.g. a
    // plain static server during local dev). Fail quietly and just show
    // the "Connect GitHub" state — the rest of the board still works.
    Board._setGithubStatus({ connected: false, login: null, avatarUrl: null });
  }
}

function renderColumns() {
  for (const col of COLUMNS) {
    const list = document.getElementById(`list-${col}`);
    const tasks = state.tasks.filter((t) => t.column === col).sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = "";
    document.getElementById(`count-${col}`).textContent = tasks.length;

    if (tasks.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "Nothing here yet.";
      list.appendChild(hint);
      continue;
    }
    for (const task of tasks) list.appendChild(renderCard(task));
  }
}

function renderCard(task) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = task.id;
  node.dataset.actor = task.lastActor;
  node.dataset.priority = task.priority;

  node.querySelector(".card-title").textContent = task.title;
  node.querySelector(".card-notes").textContent = task.notes || "";
  node.querySelector(".card-actor").textContent = task.lastActor === "agent" ? "agent" : "you";
  node.querySelector(".card-cost").textContent = money(task.cost) || "";
  node.querySelector(".card-time").textContent = timeAgo(task.updatedAt);
  node.querySelector(".external-flag").hidden = !task.external;

  node.querySelector(".card-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    Board.remove(task.id, "human");
  });

  node.querySelectorAll("[data-move]").forEach((btn) => {
    if (btn.dataset.move === task.column) btn.disabled = true;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      Board.move(task.id, btn.dataset.move, "human");
    });
  });

  node.addEventListener("dragstart", (e) => {
    node.classList.add("dragging");
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  });
  node.addEventListener("dragend", () => node.classList.remove("dragging"));

  if (task.id === lastTouchedId && task.lastActor === "agent") {
    requestAnimationFrame(() => node.classList.add("agent-touch"));
  }

  return node;
}

function renderDecisions() {
  const list = document.getElementById("decision-list");
  const pending = state.decisions.filter((d) => d.status === "pending");
  document.getElementById("decision-count").textContent = pending.length;
  list.innerHTML = "";

  if (pending.length === 0) {
    const empty = document.createElement("p");
    empty.className = "decision-empty";
    empty.textContent = "All clear — nothing waiting on you.";
    list.appendChild(empty);
    return;
  }

  for (const decision of pending) list.appendChild(renderDecisionCard(decision));
}

function renderDecisionCard(decision) {
  const node = decisionTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".decision-title").textContent = decision.title;
  node.querySelector(".decision-badge").textContent = decision.createdBy === "agent" ? "from agent" : "from you";
  node.querySelector(".decision-rationale").textContent = decision.rationale;

  const optionsHost = node.querySelector(".decision-options");
  decision.options.forEach((opt) => optionsHost.appendChild(renderOptionCard(opt, decision)));

  node.querySelector(".decision-reject").addEventListener("click", () => {
    Board.rejectDecision(decision.id, null, "human");
  });

  return node;
}

function renderOptionCard(option, decision) {
  const node = optionTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".option-label").textContent = option.label;
  const riskEl = node.querySelector(".option-risk");
  if (option.risk) {
    riskEl.textContent = `${option.risk} risk`;
    riskEl.dataset.risk = option.risk;
  } else {
    riskEl.remove();
  }
  node.querySelector(".option-description").textContent = option.description;
  const costEl = node.querySelector(".option-cost");
  costEl.textContent = money(option.costEstimate) ? `Estimated cost: ${money(option.costEstimate)}` : "";
  if (!costEl.textContent) costEl.remove();

  const githubChanges = (option.changes || []).filter((c) => c.action && c.action.startsWith("github_"));
  if (githubChanges.length) {
    const tag = document.createElement("span");
    tag.className = "option-github-tag";
    tag.textContent = `⇄ GitHub: ${githubChanges.map((c) => GITHUB_ACTION_LABEL[c.action] || c.action).join(", ")}`;
    node.querySelector(".option-description").after(tag);
  }

  const btn = node.querySelector(".option-choose");
  const originalLabel = decision.options.length > 1 ? `Choose "${option.label}"` : "Approve";
  btn.textContent = originalLabel;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Approving…";
    try {
      await Board.approveDecision(decision.id, option.id, "human");
    } catch (err) {
      console.error(err);
      alert(`Couldn't apply that: ${err.message}`);
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  return node;
}

const GITHUB_ACTION_LABEL = {
  github_create_issue: "create issue",
  github_comment_issue: "comment on issue",
  github_create_branch: "create branch",
  github_open_pr: "open pull request",
};

function renderLedger() {
  const feed = document.getElementById("ledger-feed");
  feed.innerHTML = "";
  const entries = [...state.ledger].slice(-60).reverse();

  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "ledger-empty";
    li.textContent = "No activity yet. Set a mission, or hand the board to your agent.";
    feed.appendChild(li);
    return;
  }

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "ledger-entry";
    li.dataset.actor = entry.actor;
    li.innerHTML = `
      <span class="ledger-icon">${entry.actor === "agent" ? "AI" : "you"}</span>
      <span class="ledger-text">
        ${escapeHtml(entry.text)}
        ${entry.link ? ` <a class="ledger-link" href="${escapeAttr(entry.link)}" target="_blank" rel="noopener">view ↗</a>` : ""}
        ${entry.why ? `<span class="ledger-why">${escapeHtml(entry.why)}</span>` : ""}
        <span class="ledger-time">${timeAgo(entry.ts)}</span>
      </span>
    `;
    feed.appendChild(li);
  }
}

function renderAutonomyPill() {
  const pct = Board.summary().agentAutonomyPercent;
  document.getElementById("autonomy-value").textContent = pct === null ? "—" : `${pct}%`;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/* Human-facing interactions                                           */
/* ------------------------------------------------------------------ */

document.querySelectorAll(".quick-add").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector("input[name=title]");
    const title = input.value.trim();
    if (!title) return;
    Board.create({ title, column: form.dataset.column, priority: "medium" }, "human");
    input.value = "";
    input.focus();
  });
});

document.querySelectorAll(".card-list").forEach((list) => {
  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    list.classList.add("drag-over");
  });
  list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
  list.addEventListener("drop", (e) => {
    e.preventDefault();
    list.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    if (id) Board.move(id, list.dataset.column, "human");
  });
});

document.getElementById("seed-btn").addEventListener("click", () => Board.seed("human"));
document.getElementById("reset-btn").addEventListener("click", () => {
  if (state.tasks.length === 0 || confirm("Clear the whole board, mission, and history? This can't be undone.")) {
    Board.reset("human");
  }
});

/* Mission edit form */
const missionForm = document.getElementById("mission-form");
const missionView = document.getElementById("mission-view");
document.getElementById("mission-edit-toggle").addEventListener("click", () => {
  if (state.mission) {
    missionForm.title.value = state.mission.title || "";
    missionForm.deadline.value = state.mission.deadline || "";
    missionForm.budget.value = state.mission.budget ?? "";
    missionForm.constraints.value = (state.mission.constraints || []).join("\n");
  }
  missionForm.hidden = false;
  missionView.hidden = true;
  missionForm.title.focus();
});
document.getElementById("mission-cancel").addEventListener("click", () => {
  missionForm.hidden = true;
  missionView.hidden = false;
});
missionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  Board.setMission(
    {
      title: missionForm.title.value,
      deadline: missionForm.deadline.value || null,
      budget: missionForm.budget.value === "" ? null : Number(missionForm.budget.value),
      constraints: missionForm.constraints.value,
    },
    "human"
  );
  missionForm.hidden = true;
  missionView.hidden = false;
});

/* Keep relative timestamps fresh */
setInterval(render, 30000);

/* ------------------------------------------------------------------ */
/* Replay                                                               */
/* ------------------------------------------------------------------ */

(function setupReplay() {
  const overlay = document.getElementById("replay-overlay");
  const board = document.getElementById("replay-board");
  const text = document.getElementById("replay-entry-text");
  const scrub = document.getElementById("replay-scrub");
  const position = document.getElementById("replay-position");
  const playBtn = document.getElementById("replay-play");

  let entries = [];
  let idx = 0;
  let timer = null;

  function stopPlaying() {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = "Play";
  }

  function renderAt(i) {
    if (!entries.length) {
      text.textContent = "No activity yet — nothing to replay.";
      board.innerHTML = "";
      position.textContent = "0 / 0";
      return;
    }
    idx = Math.max(0, Math.min(entries.length - 1, i));
    const entry = entries[idx];
    scrub.value = idx;
    position.textContent = `${idx + 1} / ${entries.length}`;
    text.innerHTML = `<span class="replay-actor" data-actor="${entry.actor}">${entry.actor === "agent" ? "Agent" : "You"}</span> ${escapeHtml(entry.text)}${entry.why ? ` — <em>${escapeHtml(entry.why)}</em>` : ""}`;

    const snap = entry.snapshot || { tasks: [], mission: null };
    board.innerHTML = COLUMNS.map((col) => {
      const tasks = snap.tasks.filter((t) => t.column === col);
      return `
        <div class="replay-column">
          <h4>${COLUMN_LABEL[col]} <span>${tasks.length}</span></h4>
          ${tasks
            .map(
              (t) => `<div class="replay-card" data-actor="${t.lastActor}">${t.external ? "<b>EXT</b> " : ""}${escapeHtml(t.title)}</div>`
            )
            .join("") || `<div class="replay-card replay-card--empty">empty</div>`}
        </div>
      `;
    }).join("");
  }

  document.getElementById("replay-btn").addEventListener("click", () => {
    entries = state.ledger.slice();
    overlay.hidden = false;
    renderAt(entries.length - 1);
    scrub.max = Math.max(0, entries.length - 1);
  });

  document.getElementById("replay-exit").addEventListener("click", () => {
    stopPlaying();
    overlay.hidden = true;
  });

  document.getElementById("replay-prev").addEventListener("click", () => {
    stopPlaying();
    renderAt(idx - 1);
  });
  document.getElementById("replay-next").addEventListener("click", () => {
    stopPlaying();
    renderAt(idx + 1);
  });
  scrub.addEventListener("input", () => {
    stopPlaying();
    renderAt(Number(scrub.value));
  });
  playBtn.addEventListener("click", () => {
    if (timer) {
      stopPlaying();
      return;
    }
    if (idx >= entries.length - 1) idx = -1;
    playBtn.textContent = "Pause";
    timer = setInterval(() => {
      if (idx >= entries.length - 1) {
        stopPlaying();
        return;
      }
      renderAt(idx + 1);
    }, 1000);
  });
})();

/* ------------------------------------------------------------------ */
/* GitHub OAuth redirect banner                                        */
/* ------------------------------------------------------------------ */

function showBanner(text, kind) {
  const el = document.getElementById("toast-banner");
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => {
    el.hidden = true;
  }, 6000);
}

(function handleGithubRedirect() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("github");
  if (!status) return;

  if (status === "connected") {
    showBanner("Connected to GitHub.", "good");
  } else if (status === "error") {
    const message = params.get("message");
    showBanner(`Couldn't connect to GitHub${message ? `: ${message}` : "."}`, "danger");
  }

  params.delete("github");
  params.delete("message");
  const rest = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
})();

/* ------------------------------------------------------------------ */
/* First paint                                                         */
/* ------------------------------------------------------------------ */

if (state.tasks.length === 0 && state.ledger.length === 0 && !state.mission) {
  Board.seed("human");
} else {
  render();
}

refreshGithubStatus();
