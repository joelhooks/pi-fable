export const STATE_DIR_NAME = ".pi-fable";

export const goalStatuses = ["pending", "in_progress", "complete", "failed", "blocked"] as const;
export type GoalStatus = (typeof goalStatuses)[number];

export const findingStatuses = ["open", "blocked", "resolved", "rejected"] as const;
export type FindingStatus = (typeof findingStatuses)[number];

export const findingSeverities = ["low", "medium", "high", "critical"] as const;
export type FindingSeverity = (typeof findingSeverities)[number];

export const findingSources = ["main", "subagent", "test", "user", "review", "command"] as const;
export type FindingSource = (typeof findingSources)[number];

export interface Goal {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly status: GoalStatus;
  readonly evidence: string;
  readonly verifyCmd: string;
  readonly verifyEvidence: string;
  readonly created: string;
  readonly updated: string;
}

export interface GoalPlan {
  readonly brief: string;
  readonly created: string;
  readonly updated: string;
  readonly goals: readonly Goal[];
}

export interface Finding {
  readonly id: string;
  readonly goal: string;
  readonly title: string;
  readonly severity: FindingSeverity;
  readonly source: FindingSource;
  readonly status: FindingStatus;
  readonly location: string;
  readonly evidence: string;
  readonly resolution: string;
  readonly verifyCmd: string;
  readonly verifyEvidence: string;
  readonly created: string;
  readonly updated: string;
}

export interface FindingsLedger {
  readonly created: string;
  readonly updated: string;
  readonly findings: readonly Finding[];
}

export interface ActionResult<TDetails extends Record<string, unknown> = Record<string, unknown>> {
  readonly ok: boolean;
  readonly message: string;
  readonly details: TDetails;
}

export type RouteId = "simple" | "investigate" | "execute" | "review" | "research" | "decide" | "verify";

export interface FableRoute {
  readonly id: RouteId;
  readonly label: string;
  readonly reason: string;
  readonly subagentPattern: string;
  readonly goalLedger: "skip" | "recommended" | "required";
  readonly findingsGate: "skip" | "recommended" | "required";
  readonly prompt: string;
  readonly stopRule: string;
}

export interface FableStatus {
  readonly goals: {
    readonly exists: boolean;
    readonly summary: string;
    readonly open: number;
    readonly complete: number;
    readonly failedOrBlocked: number;
  };
  readonly findings: {
    readonly exists: boolean;
    readonly summary: string;
    readonly blocking: number;
    readonly resolved: number;
  };
}

export function isGoalStatus(value: string): value is GoalStatus {
  return goalStatuses.includes(value as GoalStatus);
}

export function isFindingStatus(value: string): value is FindingStatus {
  return findingStatuses.includes(value as FindingStatus);
}

export function isFindingSeverity(value: string): value is FindingSeverity {
  return findingSeverities.includes(value as FindingSeverity);
}

export function isFindingSource(value: string): value is FindingSource {
  return findingSources.includes(value as FindingSource);
}
