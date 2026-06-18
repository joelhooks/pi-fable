---
name: pi-fable
description: "Pi-native Fable-style evidence gates around pi-subagents: route work, use goal ledgers for long tasks, record accepted findings, and verify before completion. Use when the user says fable, pi-fable, FableCodex for Pi, strict evidence gates, review/findings gate, or wants safer pi-subagents orchestration."
---

# Pi Fable

Pi Fable adapts FableCodex-style workflow discipline to Pi. It is a process layer, not a model capability claim.

## Non-negotiables

- Active Pi system/developer/tool instructions win.
- Do not claim this unlocks Fable, Claude, Anthropic, Codex, hidden prompts, model weights, context length, or safety behavior.
- Use `pi-subagents` as the orchestration runtime. Pi Fable routes and gates; it does not replace subagents.
- Parent session owns decisions. Children inspect, implement, or review within a concrete role.
- Keep one writer in the active worktree unless isolated worktrees are explicitly approved.
- Use fresh-context reviewers for adversarial diff review.
- Findings are accepted repair work, not a junk drawer.

## Core loop

1. Classify the task with `pi_fable_route` when work is non-trivial, review-sensitive, unclear, or multi-step.
2. Inspect first. Read real files, logs, docs, screenshots, diffs, issues, or source links before claiming.
3. Choose the smallest fitting process.
4. For dependent multi-step work, create a goal ledger with `pi_fable_goal`.
5. Delegate through `subagent` when a child actually helps: scout, researcher, oracle, worker, reviewer, context-builder, or installed `pi-fable.*` specialists.
6. If specialist Pi Fable agents are needed, use `pi_fable_agents` to install the opt-in templates; package resources do not auto-load subagent agent paths.
7. Record accepted blockers with `pi_fable_finding`.
8. Verify with tests, typecheck, lint, browser, screenshots, logs, command output, source inspection, or API readback.
9. Before final completion, check `pi_fable_status`; run `pi_fable_finding` gate when findings may remain.

## Routing table

| Route | Use when | Pattern |
| --- | --- | --- |
| `simple` | Tiny answer/edit | Parent session only. Skip ledger ceremony. |
| `investigate` | Bug, regression, unknown failure, root cause | Reproduce/inspect → scout/oracle → worker → reviewers. |
| `execute` | Multi-step implementation/refactor/migration | Goal ledger → async worker → parallel reviewers → fix worker. |
| `review` | Review/PR/diff/security/high-cost miss | Parallel fresh-context reviewers → accepted findings → findings gate. |
| `research` | External docs/API/current/provider facts | Researcher + scout/context-builder → synthesis → only then edit. |
| `decide` | Product/architecture/scope tradeoff | Oracle challenges assumptions; ask human before irreversible choices. |
| `verify` | UI/CLI/rendered/artifact behavior | Use the artifact naturally; observation beats source-only vibes. |

## Goal ledger rules

Use `pi_fable_goal` for dependent work where state loss or skipped verification would be expensive.

Do not use it for tiny edits.

- `create` needs `brief` and goals in `title::objective` form.
- `next` activates or resumes one goal.
- Work only the active goal.
- `checkpoint` with `complete` requires concrete evidence.
- The final goal requires `verifyCmd` and `verifyEvidence`.
- The final goal fails while open/blocked findings remain.

Example:

```json
{
  "action": "create",
  "brief": "Build Pi Fable package",
  "goals": [
    "inspect::Read FableCodex, ADLC scripts, and pi-subagents",
    "implement::Create Pi package with extension, skill, prompts, and ledgers",
    "verify::Run typecheck, tests, and package smoke checks"
  ]
}
```

## Findings gate rules

Use `pi_fable_finding` when review or verification finds evidence-backed work that must not be lost.

Add findings for:

- missing requirements;
- regressions;
- failed checks;
- security/privacy issues;
- source-grounding errors;
- unexplained clues in an investigation;
- accepted reviewer blockers.

Do **not** add findings for vague optional polish or speculative ideas.

Resolve only after fix + verification evidence.

Run `pi_fable_finding` with `action: "gate"` before final completion when findings may exist.

## Specialist agents

Pi Fable ships opt-in specialist agent templates for `pi-subagents`:

- `pi-fable.oracle` — read-only decision/drift advisory before irreversible decisions.
- `pi-fable.findings-reviewer` — fresh-context review that returns candidate findings for the parent to accept/reject.
- `pi-fable.verifier` — read-only behavioral verification and residual-risk reporting.

They are not auto-loaded by the Pi package manifest. Install them first:

```json
{ "action": "install", "scope": "project" }
```

Use project scope by default so repos can inspect and adapt the templates. Use user scope only when Joel wants them everywhere.

Do not add a `pi-fable.worker` by default. Use the builtin `worker` as the single writer unless a specific repo needs a custom worker.

## Subagent prompting

A strong Pi Fable subagent handoff includes:

- goal/outcome;
- evidence already read;
- exact scope and non-goals;
- validation contract;
- hard constraints, especially no edits for reviewers and single-writer for workers;
- output shape: changed files, commands run, evidence, risks, decisions needed.

Reviewers should inspect real files/diffs directly from fresh context and report only evidence-backed findings with file/line refs when possible.

Workers should not invent product/scope/architecture decisions. If a decision is needed, stop and ask.

## Final response checklist

- Outcome first.
- Files changed or behavior changed.
- Evidence checked: commands, tests, screenshots, source readback, etc.
- Findings gate status if used.
- Remaining risk or exact blocker.
- No trailing “I'll do X next” if X is required and possible now.
