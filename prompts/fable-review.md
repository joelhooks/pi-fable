---
description: Pi Fable review and findings gate
---

Run a Pi Fable review flow for the target below.

Target:

$@

Workflow:

1. Inspect the target diff/files directly.
2. Use `subagent` to run fresh-context reviewers with distinct angles chosen from the actual change: correctness/regressions, tests/validation, simplicity/maintainability, security/privacy, docs/API, or user-flow behavior.
3. Reviewers must not edit project/source files. They may return findings through their normal output.
4. Synthesize reviewer output into blockers, fixes worth doing now, optional/deferred items, and feedback to ignore.
5. Record accepted blockers/fixes with `pi_fable_finding` so they cannot be dropped.
6. If implementation is authorized, launch exactly one worker to apply accepted fixes.
7. Resolve findings only with resolution and verification evidence.
8. Run `pi_fable_finding` gate before saying complete.

Final output: reviewers run, accepted findings, fixes applied, verification evidence, gate status, residual risk.
