import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, type Static } from "typebox";

interface TextContent {
  readonly type: "text";
  readonly text: string;
}

interface AgentToolResult<TDetails extends Record<string, unknown> = Record<string, unknown>> {
  readonly content: readonly TextContent[];
  readonly details: TDetails;
}

interface ExtensionContext {
  readonly cwd?: string;
  readonly ui: {
    notify(message: string, level?: "info" | "warning" | "error"): void;
  };
}

interface ExtensionAPI {
  on(event: "resources_discover", handler: () => Record<string, readonly string[]>): void;
  registerTool(tool: {
    readonly name: string;
    readonly label: string;
    readonly description: string;
    readonly promptSnippet?: string;
    readonly promptGuidelines?: readonly string[];
    readonly parameters: unknown;
    readonly execute: (...args: any[]) => AgentToolResult | Promise<AgentToolResult>;
  }): void;
  registerCommand(name: string, command: {
    readonly description: string;
    readonly handler: (args: readonly string[], ctx: ExtensionContext) => void | Promise<void>;
  }): void;
}
import { handleAgentTemplates } from "../../src/agent-templates.ts";
import { classifyRequest } from "../../src/router.ts";
import { handleFinding, handleGoal, handleStatus } from "../../src/state.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(baseDir, "..", "..");

const GoalParams = Type.Object({
  action: Type.String({ enum: ["create", "next", "checkpoint", "status"], description: "Goal action to run." }),
  brief: Type.Optional(Type.String({ description: "Plan brief for action=create." })),
  goals: Type.Optional(Type.Array(Type.String({ description: "Goal in title::objective form." }), { description: "Goals for action=create." })),
  force: Type.Optional(Type.Boolean({ description: "Replace existing goal plan and archive findings for action=create." })),
  id: Type.Optional(Type.String({ description: "Goal id for action=checkpoint." })),
  status: Type.Optional(Type.String({ enum: ["complete", "failed", "blocked"], description: "Checkpoint status." })),
  evidence: Type.Optional(Type.String({ description: "Concrete evidence for a checkpoint." })),
  verifyCmd: Type.Optional(Type.String({ description: "Verification command for final goal completion." })),
  verifyEvidence: Type.Optional(Type.String({ description: "Verification output/evidence for final goal completion." })),
}, { additionalProperties: false });

type GoalParams = Static<typeof GoalParams>;

const FindingParams = Type.Object({
  action: Type.String({ enum: ["add", "list", "next", "resolve", "reject", "block", "reopen", "gate", "status"], description: "Finding action to run." }),
  id: Type.Optional(Type.String({ description: "Finding id for resolve/reject/block/reopen." })),
  goal: Type.Optional(Type.String({ description: "Optional goal id filter or attachment." })),
  title: Type.Optional(Type.String({ description: "Finding title for action=add." })),
  severity: Type.Optional(Type.String({ enum: ["low", "medium", "high", "critical"], description: "Finding severity." })),
  source: Type.Optional(Type.String({ enum: ["main", "subagent", "test", "user", "review", "command"], description: "Finding source." })),
  status: Type.Optional(Type.String({ enum: ["open", "blocked", "resolved", "rejected"], description: "Status filter for action=list." })),
  location: Type.Optional(Type.String({ description: "File, line, URL, or artifact location." })),
  evidence: Type.Optional(Type.String({ description: "Evidence for add/resolve." })),
  verifyCmd: Type.Optional(Type.String({ description: "Verification command for resolve." })),
  verifyEvidence: Type.Optional(Type.String({ description: "Verification evidence for resolve." })),
  reason: Type.Optional(Type.String({ description: "Reason for reject/block." })),
  allowBlocked: Type.Optional(Type.Boolean({ description: "For gate: fail only on open findings, allowing blocked residual risk." })),
}, { additionalProperties: false });

type FindingParams = Static<typeof FindingParams>;

const RouteParams = Type.Object({
  request: Type.String({ description: "Task/request text to classify into a Pi Fable subagent route." }),
}, { additionalProperties: false });

type RouteParams = Static<typeof RouteParams>;

const AgentsParams = Type.Object({
  action: Type.String({ enum: ["list", "install"], description: "Agent template action to run." }),
  scope: Type.Optional(Type.String({ enum: ["project", "user"], description: "Install target scope. Project writes .pi/agents/pi-fable; user writes ~/.pi/agent/agents/pi-fable." })),
  force: Type.Optional(Type.Boolean({ description: "Overwrite existing installed templates." })),
  dryRun: Type.Optional(Type.Boolean({ description: "Preview install paths without writing files." })),
}, { additionalProperties: false });

type AgentsParams = Static<typeof AgentsParams>;

type ToolDetails = Record<string, unknown>;

function textResult(message: string, details: ToolDetails): AgentToolResult<ToolDetails> {
  return { content: [{ type: "text", text: message }], details };
}

function toGoalInput(params: GoalParams) {
  return params as unknown as Parameters<typeof handleGoal>[1];
}

function toFindingInput(params: FindingParams) {
  return params as unknown as Parameters<typeof handleFinding>[1];
}

function errorResult(error: unknown): AgentToolResult<ToolDetails> {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(message, { ok: false, error: message });
}

function commandCwd(ctx: ExtensionContext): string {
  return ctx.cwd || process.cwd();
}

export default function registerPiFable(pi: ExtensionAPI): void {
  pi.on("resources_discover", () => ({
    skillPaths: [join(packageRoot, "skills", "pi-fable", "SKILL.md")],
    promptPaths: [
      join(packageRoot, "prompts", "fable.md"),
      join(packageRoot, "prompts", "fable-context.md"),
      join(packageRoot, "prompts", "fable-review.md"),
    ],
  }));

  pi.registerTool({
    name: "pi_fable_route",
    label: "Pi Fable Route",
    description: "Classify a task into a Pi Fable evidence-gated pi-subagents workflow.",
    promptSnippet: "pi_fable_route: classify work into Pi Fable subagent patterns before broad implementation/review.",
    promptGuidelines: [
      "Use pi_fable_route for non-trivial, review-sensitive, unclear, or multi-step work before choosing subagents.",
      "Routing is advice, not authority. The parent session still owns orchestration decisions.",
    ],
    parameters: RouteParams,
    async execute(_toolCallId: string, params: RouteParams) {
      const route = classifyRequest(params.request);
      return textResult(
        `pi-fable route: ${route.id} — ${route.label}\nReason: ${route.reason}\nPattern: ${route.subagentPattern}\nGoal ledger: ${route.goalLedger}; findings gate: ${route.findingsGate}`,
        { ok: true, route },
      );
    },
  });

  pi.registerTool({
    name: "pi_fable_agents",
    label: "Pi Fable Agents",
    description: "List or install Pi Fable specialist pi-subagents templates into project/user agent scope.",
    promptSnippet: "pi_fable_agents: install opt-in pi-fable.* specialist subagent templates when a workflow needs reusable Fable roles.",
    promptGuidelines: [
      "Pi package resources do not auto-load pi-subagents agent definitions; install templates into .pi/agents or ~/.pi/agent/agents first.",
      "Prefer project scope for repo-specific work. Do not force-overwrite existing agent templates unless the user approves.",
    ],
    parameters: AgentsParams,
    async execute(_toolCallId: string, params: AgentsParams, _signal, _onUpdate, ctx) {
      try {
        const output = await handleAgentTemplates(commandCwd(ctx), packageRoot, params as Parameters<typeof handleAgentTemplates>[2]);
        const names = output.templates.map((template) => template.runtimeName).join(", ");
        const actionLine = output.action === "list"
          ? `available templates: ${names}`
          : `${output.dryRun ? "would install" : "installed"} ${output.installed.length} template(s), skipped ${output.skipped.length}`;
        return textResult(
          `pi-fable agents: ${actionLine}\nTarget: ${output.targetDir}`,
          { ok: true, agents: output },
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "pi_fable_goal",
    label: "Pi Fable Goal",
    description: "Manage the local .pi-fable goal ledger with evidence checkpoints and final verification gate.",
    promptSnippet: "pi_fable_goal: create/advance/checkpoint/status local multi-step evidence goals.",
    promptGuidelines: [
      "Use pi_fable_goal for dependent multi-step work where losing state or skipping verification would hurt.",
      "Do not create ledgers for tiny one-step edits.",
      "Final goal completion requires verification evidence and no blocking findings.",
    ],
    parameters: GoalParams,
    async execute(_toolCallId: string, params: GoalParams, _signal, _onUpdate, ctx) {
      try {
        const output = await handleGoal(commandCwd(ctx), toGoalInput(params));
        return textResult(output.message, output.details);
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "pi_fable_finding",
    label: "Pi Fable Finding",
    description: "Manage accepted review/verification findings and the findings gate in .pi-fable/findings.json.",
    promptSnippet: "pi_fable_finding: record and close evidence-backed findings before final completion.",
    promptGuidelines: [
      "Findings are accepted repair work, not brainstorming notes.",
      "Resolve findings only with resolution evidence plus verification evidence.",
      "Run the findings gate before claiming completion when findings may remain.",
    ],
    parameters: FindingParams,
    async execute(_toolCallId: string, params: FindingParams, _signal, _onUpdate, ctx) {
      try {
        const output = await handleFinding(commandCwd(ctx), toFindingInput(params));
        return textResult(output.message, output.details);
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "pi_fable_status",
    label: "Pi Fable Status",
    description: "Summarize .pi-fable goals and findings for the current workspace.",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_toolCallId: string, _params: Record<string, never>, _signal, _onUpdate, ctx) {
      try {
        const output = await handleStatus(commandCwd(ctx));
        return textResult(output.message, output.details);
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerCommand("fable-status", {
    description: "Show Pi Fable goal/finding status for this workspace.",
    handler: async (_args, ctx) => {
      try {
        const output = await handleStatus(commandCwd(ctx));
        ctx.ui.notify(output.message, output.ok ? "info" : "warning");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
