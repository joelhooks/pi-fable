---
description: Pi Fable context-build and clarify workflow
---

Use `pi-fable` plus `pi-subagents` to build grounded context before planning or implementation.

Target request:

$@

Workflow:

1. Classify the request with `pi_fable_route`.
2. If local code context matters, run fresh-context `context-builder` or `scout` agents through `subagent`.
3. If external/current docs matter, run `researcher` with primary-source requirements.
4. Synthesize only the context that changes execution.
5. Ask the user the smallest set of decisions still needed. Use MCQ when there are multiple valid paths.
6. Do not implement unless the request explicitly asks you to continue into implementation.

Context builders should return:

- relevant files and line ranges;
- constraints and invariants;
- risks and unknowns;
- validation commands or next-best checks;
- a compact meta-prompt for a planner or worker.
