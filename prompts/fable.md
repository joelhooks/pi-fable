---
description: Pi Fable evidence-gated subagent workflow
---

Use the `pi-fable` skill and the `pi-subagents` workflow.

Treat the request below as the target. First classify it with `pi_fable_route` unless it is obviously tiny. Then choose the smallest matching process.

Rules:

- Inspect real files/docs/logs/diffs before acting.
- Use `pi_fable_goal` only when the work has dependent steps or expensive misses.
- Use `subagent` for focused help, not ceremony. Parent session stays in charge.
- Keep one writer in the active worktree.
- For implementation: goal ledger when useful → async worker → fresh-context reviewers → fix worker for accepted fixes.
- For review: fresh-context reviewers → record accepted blockers with `pi_fable_finding` → run findings gate before done.
- For unclear decisions: ask oracle, then ask the human before irreversible scope/product/architecture choices.
- Final answer must include outcome, files changed, verification evidence, findings gate status when used, and remaining risk.

Target request:

$@
