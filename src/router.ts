import { assign, createActor, setup } from "xstate";
import type { FableRoute, RouteId } from "./domain.ts";

interface RoutingInput {
  readonly request: string;
}

interface RoutingContext {
  readonly request: string;
  readonly route: FableRoute | null;
}

type RoutingEvent = { readonly type: "CLASSIFY" };

const routeTable: Record<RouteId, Omit<FableRoute, "reason">> = {
  simple: {
    id: "simple",
    label: "Simple parent-session work",
    subagentPattern: "Stay in the parent session. Skip ledgers unless the work grows teeth.",
    goalLedger: "skip",
    findingsGate: "skip",
    prompt: "Answer or make the small edit directly. Inspect the referenced file first if one exists.",
    stopRule: "Stop after the requested answer/edit and one cheap verification pass.",
  },
  investigate: {
    id: "investigate",
    label: "Reproduce-first investigation",
    subagentPattern: "Use scout or oracle for cause-finding, then one worker for the approved fix, then fresh-context reviewers.",
    goalLedger: "recommended",
    findingsGate: "recommended",
    prompt: "Reproduce or inspect the failing path first. Keep competing hypotheses until evidence kills them.",
    stopRule: "Do not patch symptoms without root-cause evidence and a before/after check.",
  },
  execute: {
    id: "execute",
    label: "Evidence-gated implementation",
    subagentPattern: "Goal ledger → async worker → parallel fresh-context reviewers → one fix worker.",
    goalLedger: "recommended",
    findingsGate: "recommended",
    prompt: "Create a goal ledger for dependent steps. Keep one writer in the active worktree.",
    stopRule: "Final completion needs changed files, commands run, verification output, and no blocking findings.",
  },
  review: {
    id: "review",
    label: "Review and findings gate",
    subagentPattern: "Run parallel fresh-context reviewers with distinct angles. Record accepted blockers as findings.",
    goalLedger: "skip",
    findingsGate: "required",
    prompt: "Review direct evidence from files, diffs, and commands. Do not rely on inherited conversation vibes.",
    stopRule: "Do not mark done while accepted findings are open or blocked.",
  },
  research: {
    id: "research",
    label: "External evidence plus local implications",
    subagentPattern: "Run researcher for primary sources and scout/context-builder for local integration context.",
    goalLedger: "skip",
    findingsGate: "recommended",
    prompt: "Fetch current primary sources and local code context before deciding or editing.",
    stopRule: "State source gaps plainly; do not convert stale memory into facts.",
  },
  decide: {
    id: "decide",
    label: "Decision consistency check",
    subagentPattern: "Ask oracle to challenge assumptions. Pause for human approval on product/scope/architecture choices.",
    goalLedger: "skip",
    findingsGate: "skip",
    prompt: "Conclusion first, then clues, tradeoffs, cheapest discriminating measurement, and the sharp recommended move.",
    stopRule: "Do not let a child agent silently make irreversible scope decisions.",
  },
  verify: {
    id: "verify",
    label: "Behavioral verification",
    subagentPattern: "Use the artifact naturally: browser, CLI, screenshot, logs, command output, or readback. Add reviewers when misses cost real money.",
    goalLedger: "recommended",
    findingsGate: "recommended",
    prompt: "A syntax check is not behavioral proof. Observe the actual thing working.",
    stopRule: "If observation fails, fix and observe again before completion.",
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`, "i").test(text));
}

function classifyText(request: string): FableRoute {
  const text = request.toLowerCase();
  let id: RouteId = "simple";
  let reason = "No costly-miss signal found; keep the process light.";

  if (includesAny(text, ["debug", "diagnose", "failing", "failure", "broken", "regression", "root cause", "why is", "flaky"])) {
    id = "investigate";
    reason = "The request names an unknown failure or root-cause hunt.";
  } else if (includesAny(text, ["review", "pr", "diff", "security", "audit", "findings", "gate"])) {
    id = "review";
    reason = "The request is review-sensitive or asks for a gate.";
  } else if (includesAny(text, ["research", "docs", "documentation", "api", "provider", "current", "latest", "source", "benchmark"])) {
    id = "research";
    reason = "The request depends on current or external evidence.";
  } else if (includesAny(text, ["architecture", "tradeoff", "decision", "decide", "should we", "scope", "prd", "plan"])) {
    id = "decide";
    reason = "The request includes a decision or tradeoff before implementation.";
  } else if (includesAny(text, ["ui", "browser", "screenshot", "render", "cli", "script", "artifact", "animation", "game", "visual"])) {
    id = "verify";
    reason = "The output needs behavioral or visual observation, not just source inspection.";
  } else if (includesAny(text, ["implement", "build", "refactor", "migration", "multi-step", "feature", "release", "ship", "extension", "package"])) {
    id = "execute";
    reason = "The request implies multi-step implementation work.";
  }

  return { ...routeTable[id], reason };
}

export const fableRoutingMachine = setup({
  types: {
    input: {} as RoutingInput,
    context: {} as RoutingContext,
    events: {} as RoutingEvent,
  },
  actions: {
    classify: assign({
      route: ({ context }) => classifyText(context.request),
    }),
  },
}).createMachine({
  id: "pi-fable-routing",
  context: ({ input }) => ({
    request: input.request,
    route: null,
  }),
  initial: "idle",
  states: {
    idle: {
      on: {
        CLASSIFY: {
          target: "routed",
          actions: "classify",
        },
      },
    },
    routed: {},
  },
});

export function classifyRequest(request: string): FableRoute {
  const actor = createActor(fableRoutingMachine, { input: { request } });
  actor.start();
  actor.send({ type: "CLASSIFY" });
  const route = actor.getSnapshot().context.route;
  actor.stop();
  return route ?? classifyText(request);
}
