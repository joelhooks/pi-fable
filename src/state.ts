import { promises as fs } from "node:fs";
import path from "node:path";
import { Effect } from "effect";
import {
  type ActionResult,
  type FableStatus,
  type Finding,
  type FindingsLedger,
  type FindingSeverity,
  type FindingSource,
  type FindingStatus,
  type Goal,
  type GoalPlan,
  type GoalStatus,
  isFindingSeverity,
  isFindingSource,
  isFindingStatus,
  isGoalStatus,
} from "./domain.ts";
import { findingsFile, goalsFile, ledgerFile, lockDir, stateDir } from "./paths.ts";

const openGoalStatuses = new Set<GoalStatus>(["pending", "in_progress"]);
const terminalIncompleteGoalStatuses = new Set<GoalStatus>(["failed", "blocked"]);
const blockingFindingStatuses = new Set<FindingStatus>(["open", "blocked"]);
const severityOrder: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function now(): string {
  return new Date().toISOString();
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function readText(filePath: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf8"),
    catch: asError,
  });
}

function writeText(filePath: string, content: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
      await fs.writeFile(tmp, content, "utf8");
      await fs.rename(tmp, filePath);
    },
    catch: asError,
  });
}

function fileExists(filePath: string): Effect.Effect<boolean, Error> {
  return Effect.tryPromise({
    try: async () => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    catch: asError,
  });
}

function ensureStateDir(cwd: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      await fs.mkdir(stateDir(cwd), { recursive: true });
    },
    catch: asError,
  });
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`pi-fable: ${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function writeJson(filePath: string, value: unknown): Effect.Effect<void, Error> {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function appendLedger(cwd: string, event: string, fields: Record<string, unknown>): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      await fs.mkdir(stateDir(cwd), { recursive: true });
      const record = { ts: now(), event, ...fields };
      await fs.appendFile(ledgerFile(cwd), `${JSON.stringify(record)}\n`, "utf8");
    },
    catch: asError,
  });
}

async function withStateLock<T>(cwd: string, action: () => Promise<T>): Promise<T> {
  await fs.mkdir(stateDir(cwd), { recursive: true });
  const lock = lockDir(cwd);
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await fs.mkdir(lock);
      break;
    } catch (error) {
      const e = error as NodeJS.ErrnoException;
      if (e.code !== "EEXIST") throw e;
      if (Date.now() >= deadline) throw new Error(`pi-fable: timed out waiting for state lock (${lock}).`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await action();
  } finally {
    await fs.rm(lock, { recursive: true, force: true });
  }
}

function parseGoal(raw: string, index: number): Goal {
  const goalNumber = index + 1;
  if (!raw.includes("::")) throw new Error(`pi-fable: goal ${goalNumber} must use 'title::objective' format.`);
  const [rawTitle, ...rest] = raw.split("::");
  const title = (rawTitle ?? "").trim();
  const objective = rest.join("::").trim();
  if (!title || !objective) throw new Error(`pi-fable: goal ${goalNumber} needs both title and objective.`);
  const stamp = now();
  return {
    id: `G${String(goalNumber).padStart(3, "0")}`,
    title,
    objective,
    status: "pending",
    evidence: "",
    verifyCmd: "",
    verifyEvidence: "",
    created: stamp,
    updated: "",
  };
}

function validateGoalPlan(data: Record<string, unknown>, filePath: string): GoalPlan {
  if (typeof data.brief !== "string") throw new Error(`pi-fable: goal plan field 'brief' must be a string (${filePath}).`);
  if (!Array.isArray(data.goals)) throw new Error(`pi-fable: goal plan field 'goals' must be a list (${filePath}).`);
  const goals = data.goals.map((goal, index) => {
    if (!goal || typeof goal !== "object" || Array.isArray(goal)) {
      throw new Error(`pi-fable: goal ${index + 1} must be an object (${filePath}).`);
    }
    const item = goal as Record<string, unknown>;
    for (const field of ["id", "title", "objective", "status", "evidence", "verifyCmd", "verifyEvidence", "created", "updated"]) {
      if (typeof item[field] !== "string") throw new Error(`pi-fable: goal ${index + 1} field '${field}' must be a string (${filePath}).`);
    }
    const status = item.status;
    if (typeof status !== "string" || !isGoalStatus(status)) throw new Error(`pi-fable: goal ${index + 1} has invalid status '${String(status)}'.`);
    return item as unknown as Goal;
  });
  if (goals.length === 0) throw new Error(`pi-fable: goal plan must contain at least one goal (${filePath}).`);
  return {
    brief: data.brief,
    created: typeof data.created === "string" ? data.created : "",
    updated: typeof data.updated === "string" ? data.updated : "",
    goals,
  } as GoalPlan;
}

function validateFindings(data: Record<string, unknown>, filePath: string): FindingsLedger {
  const rawFindings = data.findings ?? [];
  if (!Array.isArray(rawFindings)) throw new Error(`pi-fable: findings field 'findings' must be a list (${filePath}).`);
  const findings = rawFindings.map((finding, index) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      throw new Error(`pi-fable: finding ${index + 1} must be an object (${filePath}).`);
    }
    const item = finding as Record<string, unknown>;
    for (const field of ["id", "goal", "title", "severity", "source", "status", "location", "evidence", "resolution", "verifyCmd", "verifyEvidence", "created", "updated"]) {
      if (typeof item[field] !== "string") throw new Error(`pi-fable: finding ${index + 1} field '${field}' must be a string (${filePath}).`);
    }
    const severity = item.severity;
    const source = item.source;
    const status = item.status;
    if (typeof severity !== "string" || !isFindingSeverity(severity)) throw new Error(`pi-fable: finding ${index + 1} has invalid severity '${String(severity)}'.`);
    if (typeof source !== "string" || !isFindingSource(source)) throw new Error(`pi-fable: finding ${index + 1} has invalid source '${String(source)}'.`);
    if (typeof status !== "string" || !isFindingStatus(status)) throw new Error(`pi-fable: finding ${index + 1} has invalid status '${String(status)}'.`);
    return item as unknown as Finding;
  });
  return {
    created: typeof data.created === "string" ? data.created : now(),
    updated: typeof data.updated === "string" ? data.updated : "",
    findings,
  };
}

function loadPlan(cwd: string): Effect.Effect<GoalPlan, Error> {
  const filePath = goalsFile(cwd);
  return Effect.gen(function* () {
    const exists = yield* fileExists(filePath);
    if (!exists) throw new Error("pi-fable: no goal plan. Create one first.");
    const text = yield* readText(filePath);
    return validateGoalPlan(parseJsonObject(text, "goal plan"), filePath);
  });
}

function loadFindings(cwd: string): Effect.Effect<FindingsLedger, Error> {
  const filePath = findingsFile(cwd);
  return Effect.gen(function* () {
    const exists = yield* fileExists(filePath);
    if (!exists) return { created: now(), updated: "", findings: [] } satisfies FindingsLedger;
    const text = yield* readText(filePath);
    return validateFindings(parseJsonObject(text, "findings ledger"), filePath);
  });
}

function savePlan(cwd: string, plan: GoalPlan): Effect.Effect<void, Error> {
  return writeJson(goalsFile(cwd), { ...plan, updated: now() });
}

function saveFindings(cwd: string, ledger: FindingsLedger): Effect.Effect<void, Error> {
  return writeJson(findingsFile(cwd), { ...ledger, updated: now() });
}

function blockingFindings(ledger: FindingsLedger): readonly Finding[] {
  return ledger.findings.filter((finding) => blockingFindingStatuses.has(finding.status));
}

function sortFindings(findings: readonly Finding[]): readonly Finding[] {
  return [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.id.localeCompare(b.id));
}

function nextFindingId(findings: readonly Finding[]): string {
  let max = 0;
  for (const finding of findings) {
    const match = /^F(\d+)$/.exec(finding.id);
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return `F${String(max + 1).padStart(3, "0")}`;
}

function activeGoalId(plan: GoalPlan | null): string {
  const active = plan?.goals.filter((goal) => goal.status === "in_progress") ?? [];
  return active.length === 1 ? active[0]?.id ?? "" : "";
}

function result<TDetails extends Record<string, unknown>>(message: string, details: TDetails, ok = true): ActionResult<TDetails> {
  return { ok, message, details };
}

export interface GoalToolInput {
  readonly action: "create" | "next" | "checkpoint" | "status";
  readonly brief?: string;
  readonly goals?: readonly string[];
  readonly force?: boolean;
  readonly id?: string;
  readonly status?: GoalStatus;
  readonly evidence?: string;
  readonly verifyCmd?: string;
  readonly verifyEvidence?: string;
}

export async function handleGoal(cwd: string, input: GoalToolInput): Promise<ActionResult> {
  return withStateLock(cwd, () => Effect.runPromise(handleGoalEffect(cwd, input)));
}

function handleGoalEffect(cwd: string, input: GoalToolInput): Effect.Effect<ActionResult, Error> {
  return Effect.gen(function* () {
    yield* ensureStateDir(cwd);
    switch (input.action) {
      case "create": {
        const brief = input.brief?.trim() ?? "";
        if (!brief) throw new Error("pi-fable: create requires a non-empty brief.");
        const rawGoals = input.goals ?? [];
        if (rawGoals.length === 0) throw new Error("pi-fable: create requires at least one goal.");
        const exists = yield* fileExists(goalsFile(cwd));
        if (exists && input.force !== true) throw new Error("pi-fable: goal plan already exists. Use force to replace it.");
        const goals = rawGoals.map(parseGoal);
        const plan: GoalPlan = { brief, created: now(), updated: "", goals };
        yield* savePlan(cwd, plan);
        if (input.force === true) {
          const findingsExists = yield* fileExists(findingsFile(cwd));
          if (findingsExists) {
            const archive = findingsFile(cwd).replace(/\.json$/, `.${Date.now()}.archive.json`);
            yield* Effect.tryPromise({ try: () => fs.rename(findingsFile(cwd), archive), catch: asError });
          }
        }
        yield* appendLedger(cwd, "goal_plan_created", { brief, count: goals.length });
        return result(`pi-fable: plan created with ${goals.length} goals`, { plan: { ...plan, updated: now() } });
      }
      case "next": {
        const plan = yield* loadPlan(cwd);
        const active = plan.goals.find((goal) => goal.status === "in_progress");
        let goals = [...plan.goals];
        let selected = active;
        let prefix = "";
        if (!selected) {
          selected = goals.find((goal) => terminalIncompleteGoalStatuses.has(goal.status));
          if (selected) {
            const previous = selected.status;
            goals = goals.map((goal) => goal.id === selected?.id ? { ...goal, status: "in_progress", updated: now() } : goal);
            selected = goals.find((goal) => goal.id === selected?.id);
            prefix = `Reopened ${selected?.id ?? "goal"} from ${previous}.\n`;
          }
        }
        if (!selected) {
          selected = goals.find((goal) => goal.status === "pending");
          if (selected) {
            goals = goals.map((goal) => goal.id === selected?.id ? { ...goal, status: "in_progress", updated: now() } : goal);
            selected = goals.find((goal) => goal.id === selected?.id);
          }
        }
        if (!selected) return result("pi-fable: all goals complete", { plan });
        const nextPlan = { ...plan, goals };
        yield* savePlan(cwd, nextPlan);
        yield* appendLedger(cwd, "goal_started", { id: selected.id, title: selected.title });
        const final = selected.id === goals[goals.length - 1]?.id;
        const message = `${prefix}=== pi-fable goal: ${selected.id} ${selected.title}\nObjective: ${selected.objective}\nRule: work this goal only and produce concrete evidence.${final ? "\nFinal goal: completion requires verifyCmd and verifyEvidence, and no blocking findings." : ""}`;
        return result(message, { goal: selected, final, plan: nextPlan });
      }
      case "checkpoint": {
        const id = input.id?.trim() ?? "";
        const status = input.status;
        if (!id) throw new Error("pi-fable: checkpoint requires id.");
        if (!status || !isGoalStatus(status) || status === "pending" || status === "in_progress") {
          throw new Error("pi-fable: checkpoint status must be complete, failed, or blocked.");
        }
        const plan = yield* loadPlan(cwd);
        const goal = plan.goals.find((item) => item.id === id);
        if (!goal) throw new Error(`pi-fable: unknown goal id ${id}.`);
        if (goal.status !== "in_progress") throw new Error(`pi-fable: ${id} is ${goal.status}; activate it with next first.`);
        const evidence = input.evidence?.trim() ?? "";
        const verifyCmd = input.verifyCmd?.trim() ?? "";
        const verifyEvidence = input.verifyEvidence?.trim() ?? "";
        const final = goal.id === plan.goals[plan.goals.length - 1]?.id;
        if (status === "complete") {
          if (!evidence) throw new Error("pi-fable: complete checkpoints require non-empty evidence.");
          if (final && (!verifyCmd || !verifyEvidence)) throw new Error("pi-fable: final goal requires verifyCmd and verifyEvidence.");
          if (final) {
            const findings = yield* loadFindings(cwd);
            const blockers = blockingFindings(findings);
            if (blockers.length > 0) throw new Error(`pi-fable: final goal blocked by ${blockers.length} open/blocking finding(s): ${blockers.map((finding) => finding.id).join(", ")}.`);
          }
        }
        const goals = plan.goals.map((item) => item.id === id ? { ...item, status, evidence, verifyCmd, verifyEvidence, updated: now() } : item);
        const nextPlan = { ...plan, goals };
        yield* savePlan(cwd, nextPlan);
        yield* appendLedger(cwd, "goal_checkpoint", { id, status, evidence, verifyCmd, verifyEvidence });
        const remainingOpen = goals.filter((item) => openGoalStatuses.has(item.status)).length;
        const failedOrBlocked = goals.filter((item) => terminalIncompleteGoalStatuses.has(item.status)).length;
        const suffix = failedOrBlocked > 0
          ? ` plan is not complete; ${failedOrBlocked} failed/blocked goal(s).`
          : remainingOpen > 0
            ? ` ${remainingOpen} goal(s) left.`
            : " all goals complete.";
        return result(`pi-fable: ${id} -> ${status};${suffix}`, { plan: nextPlan, goal: goals.find((item) => item.id === id) ?? goal });
      }
      case "status":
        return yield* goalStatusEffect(cwd);
    }
  });
}

function goalStatusEffect(cwd: string): Effect.Effect<ActionResult, Error> {
  return Effect.gen(function* () {
    const exists = yield* fileExists(goalsFile(cwd));
    if (!exists) return result("pi-fable: no goal plan", { exists: false });
    const plan = yield* loadPlan(cwd);
    const complete = plan.goals.filter((goal) => goal.status === "complete").length;
    const open = plan.goals.filter((goal) => openGoalStatuses.has(goal.status)).length;
    const failedOrBlocked = plan.goals.filter((goal) => terminalIncompleteGoalStatuses.has(goal.status)).length;
    return result(`pi-fable: ${complete}/${plan.goals.length} goals complete - ${plan.brief}`, { exists: true, plan, complete, open, failedOrBlocked });
  });
}

export interface FindingToolInput {
  readonly action: "add" | "list" | "next" | "resolve" | "reject" | "block" | "reopen" | "gate" | "status";
  readonly id?: string;
  readonly goal?: string;
  readonly title?: string;
  readonly severity?: FindingSeverity;
  readonly source?: FindingSource;
  readonly status?: FindingStatus;
  readonly location?: string;
  readonly evidence?: string;
  readonly verifyCmd?: string;
  readonly verifyEvidence?: string;
  readonly reason?: string;
  readonly allowBlocked?: boolean;
}

export async function handleFinding(cwd: string, input: FindingToolInput): Promise<ActionResult> {
  return withStateLock(cwd, () => Effect.runPromise(handleFindingEffect(cwd, input)));
}

function handleFindingEffect(cwd: string, input: FindingToolInput): Effect.Effect<ActionResult, Error> {
  return Effect.gen(function* () {
    yield* ensureStateDir(cwd);
    switch (input.action) {
      case "add": {
        const title = input.title?.trim() ?? "";
        const evidence = input.evidence?.trim() ?? "";
        if (!title) throw new Error("pi-fable: add finding requires title.");
        if (!evidence) throw new Error("pi-fable: add finding requires evidence.");
        const severity = input.severity ?? "medium";
        const source = input.source ?? "main";
        if (!isFindingSeverity(severity)) throw new Error(`pi-fable: invalid severity ${String(severity)}.`);
        if (!isFindingSource(source)) throw new Error(`pi-fable: invalid source ${String(source)}.`);
        const ledger = yield* loadFindings(cwd);
        let plan: GoalPlan | null = null;
        const hasGoals = yield* fileExists(goalsFile(cwd));
        if (hasGoals) plan = yield* loadPlan(cwd);
        const stamp = now();
        const finding: Finding = {
          id: nextFindingId(ledger.findings),
          goal: input.goal?.trim() || activeGoalId(plan),
          title,
          severity,
          source,
          status: "open",
          location: input.location?.trim() ?? "",
          evidence,
          resolution: "",
          verifyCmd: "",
          verifyEvidence: "",
          created: stamp,
          updated: "",
        };
        const nextLedger = { ...ledger, findings: [...ledger.findings, finding] };
        yield* saveFindings(cwd, nextLedger);
        yield* appendLedger(cwd, "finding_added", { id: finding.id, title, severity, source, goal: finding.goal });
        return result(`pi-fable: added ${finding.id} [${severity}] ${title}`, { finding, ledger: nextLedger });
      }
      case "list": {
        const ledger = yield* loadFindings(cwd);
        const filtered = sortFindings(ledger.findings.filter((finding) => {
          const statusMatches = input.status ? finding.status === input.status : true;
          const goalMatches = input.goal ? finding.goal === input.goal : true;
          return statusMatches && goalMatches;
        }));
        const lines = filtered.map((finding) => `${finding.id} [${finding.status}] ${finding.severity} ${finding.title}${finding.goal ? ` goal=${finding.goal}` : ""}${finding.location ? ` location=${finding.location}` : ""}`);
        return result(lines.length > 0 ? lines.join("\n") : "pi-fable: no findings", { findings: filtered, ledger });
      }
      case "next": {
        const ledger = yield* loadFindings(cwd);
        const open = sortFindings(ledger.findings.filter((finding) => finding.status === "open" && (!input.goal || finding.goal === input.goal)));
        const finding = open[0];
        if (!finding) return result("pi-fable: no open findings", { finding: null, ledger });
        const message = `=== pi-fable finding: ${finding.id} ${finding.title}\nSeverity: ${finding.severity}${finding.goal ? `\nGoal: ${finding.goal}` : ""}${finding.location ? `\nLocation: ${finding.location}` : ""}\nEvidence: ${finding.evidence}\nResolve only after fix plus verification evidence.`;
        return result(message, { finding, ledger });
      }
      case "resolve": {
        return yield* updateFinding(cwd, input, "resolved");
      }
      case "reject": {
        return yield* updateFinding(cwd, input, "rejected");
      }
      case "block": {
        return yield* updateFinding(cwd, input, "blocked");
      }
      case "reopen": {
        return yield* updateFinding(cwd, input, "open");
      }
      case "gate": {
        const ledger = yield* loadFindings(cwd);
        const blockingStatuses = input.allowBlocked === true ? new Set<FindingStatus>(["open"]) : blockingFindingStatuses;
        const blockers = sortFindings(ledger.findings.filter((finding) => blockingStatuses.has(finding.status) && (!input.goal || finding.goal === input.goal)));
        if (blockers.length > 0) {
          return result(`pi-fable: findings gate failed; ${blockers.length} blocking finding(s) remain`, { passed: false, blockers, ledger }, false);
        }
        return result(`pi-fable: findings gate passed${input.goal ? ` for ${input.goal}` : ""}`, { passed: true, blockers: [], ledger });
      }
      case "status":
        return yield* findingsStatusEffect(cwd);
    }
  });
}

function updateFinding(cwd: string, input: FindingToolInput, nextStatus: FindingStatus): Effect.Effect<ActionResult, Error> {
  return Effect.gen(function* () {
    const id = input.id?.trim() ?? "";
    if (!id) throw new Error(`pi-fable: ${nextStatus} requires id.`);
    const ledger = yield* loadFindings(cwd);
    const existing = ledger.findings.find((finding) => finding.id === id);
    if (!existing) throw new Error(`pi-fable: unknown finding id ${id}.`);
    const evidence = input.evidence?.trim() ?? "";
    const verifyEvidence = input.verifyEvidence?.trim() ?? "";
    const reason = input.reason?.trim() ?? "";
    if (nextStatus === "resolved") {
      if (!evidence) throw new Error("pi-fable: resolve requires evidence.");
      if (!verifyEvidence) throw new Error("pi-fable: resolve requires verifyEvidence.");
    }
    if ((nextStatus === "rejected" || nextStatus === "blocked") && !reason) {
      throw new Error(`pi-fable: ${nextStatus} requires reason.`);
    }
    const findings: readonly Finding[] = ledger.findings.map((finding): Finding => {
      if (finding.id !== id) return finding;
      if (nextStatus === "open") {
        return { ...finding, status: "open", resolution: "", verifyCmd: "", verifyEvidence: "", updated: now() };
      }
      if (nextStatus === "resolved") {
        return {
          ...finding,
          status: nextStatus,
          resolution: evidence,
          verifyCmd: input.verifyCmd?.trim() ?? "",
          verifyEvidence,
          updated: now(),
        };
      }
      return { ...finding, status: nextStatus, resolution: reason, updated: now() };
    });
    const nextLedger = { ...ledger, findings };
    yield* saveFindings(cwd, nextLedger);
    yield* appendLedger(cwd, `finding_${nextStatus}`, { id });
    return result(`pi-fable: ${id} -> ${nextStatus}`, { finding: findings.find((finding) => finding.id === id) ?? existing, ledger: nextLedger });
  });
}

function findingsStatusEffect(cwd: string): Effect.Effect<ActionResult, Error> {
  return Effect.gen(function* () {
    const exists = yield* fileExists(findingsFile(cwd));
    if (!exists) return result("pi-fable: no findings", { exists: false });
    const ledger = yield* loadFindings(cwd);
    const counts = {
      open: ledger.findings.filter((finding) => finding.status === "open").length,
      blocked: ledger.findings.filter((finding) => finding.status === "blocked").length,
      resolved: ledger.findings.filter((finding) => finding.status === "resolved").length,
      rejected: ledger.findings.filter((finding) => finding.status === "rejected").length,
    };
    const summary = Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => `${count} ${status}`).join(", ") || "0 findings";
    return result(`pi-fable: ${summary}`, { exists: true, ledger, counts });
  });
}

export async function handleStatus(cwd: string): Promise<ActionResult<{ status: FableStatus }>> {
  return withStateLock(cwd, () => Effect.runPromise(Effect.gen(function* () {
    yield* ensureStateDir(cwd);
    const goalExists = yield* fileExists(goalsFile(cwd));
    const findingExists = yield* fileExists(findingsFile(cwd));
    let goalSummary = "no goal plan";
    let open = 0;
    let complete = 0;
    let failedOrBlocked = 0;
    if (goalExists) {
      const plan = yield* loadPlan(cwd);
      complete = plan.goals.filter((goal) => goal.status === "complete").length;
      open = plan.goals.filter((goal) => openGoalStatuses.has(goal.status)).length;
      failedOrBlocked = plan.goals.filter((goal) => terminalIncompleteGoalStatuses.has(goal.status)).length;
      goalSummary = `${complete}/${plan.goals.length} goals complete - ${plan.brief}`;
    }
    let findingSummary = "no findings";
    let blocking = 0;
    let resolved = 0;
    if (findingExists) {
      const ledger = yield* loadFindings(cwd);
      blocking = ledger.findings.filter((finding) => blockingFindingStatuses.has(finding.status)).length;
      resolved = ledger.findings.filter((finding) => finding.status === "resolved").length;
      findingSummary = `${blocking} blocking, ${resolved} resolved`;
    }
    const status: FableStatus = {
      goals: { exists: goalExists, summary: goalSummary, open, complete, failedOrBlocked },
      findings: { exists: findingExists, summary: findingSummary, blocking, resolved },
    };
    return result(`pi-fable status\nGoals: ${goalSummary}\nFindings: ${findingSummary}`, { status });
  })));
}
