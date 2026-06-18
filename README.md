<div align="center">
  <h1>Pi Fable</h1>
  <p><strong>Evidence-gated subagent workflows for Pi.</strong></p>
  <p>
    <img alt="Pi package" src="https://img.shields.io/badge/Pi-Package-black?style=for-the-badge" />
    <img alt="Built around pi-subagents" src="https://img.shields.io/badge/Built%20around-pi--subagents-7c3aed?style=for-the-badge" />
    <img alt="License AGPL-3.0-or-later" src="https://img.shields.io/badge/License-AGPL--3.0--or--later-blue?style=for-the-badge" />
  </p>
</div>

---

Pi Fable is a Pi extension package that wraps `pi-subagents` with Fable-style operating discipline:
inspect first, route the work, track evidence when the work is long, record accepted findings, and verify before saying done.

It is the Pi sister of [FableCodex](https://github.com/baskduf/FableCodex), not a model unlocker.
It does **not** change model weights, context length, provider access, or hidden runtime behavior.
It adds Pi-native tools, prompt templates, and skill guidance for using subagents more carefully.

## Install

Install `pi-subagents` first:

```bash
pi install npm:pi-subagents
```

Then install Pi Fable from GitHub:

```bash
pi install git:github.com/joelhooks/pi-fable
```

Restart or `/reload` Pi.

## What it adds

- `@pi-fable` skill guidance for evidence-gated Pi work.
- Prompt templates:
  - `/fable` — route a request into the right pi-subagents workflow.
  - `/fable-context` — context-build and clarify before planning.
  - `/fable-review` — fresh-context review and findings closeout.
- Tools:
  - `pi_fable_route` — classify a task and return the recommended pi-subagents pattern.
  - `pi_fable_agents` — list/install opt-in `pi-fable.*` specialist subagent templates.
  - `pi_fable_goal` — create, advance, checkpoint, and inspect `.pi-fable/goals.json`.
  - `pi_fable_finding` — add, resolve, reject, block, reopen, list, and gate `.pi-fable/findings.json`.
  - `pi_fable_status` — summarize goals and findings.
- Specialist subagent templates:
  - `pi-fable.oracle`
  - `pi-fable.findings-reviewer`
  - `pi-fable.verifier`

Local state lives in `.pi-fable/` and is intentionally uncommitted by default.

## Try this first

```text
/fable Implement this safely. Use a goal ledger if it has multiple dependent steps, then run reviewers before completion.
```

```text
/fable-review Review the current diff. Record accepted findings and do not claim done until the findings gate passes.
```

```text
/fable-context Build fresh context for this migration, then ask me only the decisions that matter.
```

## Routing lookup table

Pi Fable maps task signals to concrete `pi-subagents` patterns.

| Signal | Route | Subagents pattern |
| --- | --- | --- |
| Tiny answer or one-file edit | `simple` | Stay in the parent session; no ledger ceremony. |
| Unknown bug, regression, “why” | `investigate` | `scout` or `oracle` first, then one `worker`, then fresh reviewers. |
| Multi-step implementation, refactor, migration | `execute` | Goal ledger → async `worker` → parallel fresh-context reviewers → fix worker. |
| Review, security, PR, expensive miss | `review` | Parallel fresh-context reviewers, accepted findings, findings gate. |
| External docs/API/provider/current facts | `research` | `researcher` + `scout`, then synthesis before writing. |
| Unclear product/architecture tradeoff | `decide` | `oracle` for challenge, ask human before irreversible scope changes. |
| Renderable UI/CLI/artifact | `verify` | Use the artifact naturally; screenshot/log/output evidence beats vibes. |

## Specialist subagents

Pi packages currently auto-discover skills, prompts, extensions, and themes. `pi-subagents` agent definitions are discovered from user/project agent directories, not arbitrary package resource paths. So Pi Fable ships specialist agents as opt-in templates instead of silently shadowing your existing subagents.

Call `pi_fable_agents` to list templates:

```json
{ "action": "list" }
```

Install into the current project:

```json
{ "action": "install", "scope": "project" }
```

This writes:

```text
.pi/agents/pi-fable/oracle.md
.pi/agents/pi-fable/findings-reviewer.md
.pi/agents/pi-fable/verifier.md
```

Install globally instead:

```json
{ "action": "install", "scope": "user" }
```

After install, run `/reload` or start a new Pi session, then use:

```json
{ "agent": "pi-fable.findings-reviewer", "agentScope": "both", "task": "Review the current diff and return candidate findings only." }
```

These agents are intentionally read-only advisory/verification roles. Use the builtin `worker` for writing so the active worktree still has one writer.

## Goal ledger

Use goals for dependent work where losing state would be expensive.

The parent agent can call:

```json
{
  "action": "create",
  "brief": "Add typed import flow",
  "goals": [
    "inspect::Find current import behavior and tests",
    "implement::Add the typed flow",
    "verify::Run tests and inspect output"
  ]
}
```

Then advance and checkpoint:

```json
{ "action": "next" }
```

```json
{
  "action": "checkpoint",
  "id": "G001",
  "status": "complete",
  "evidence": "Read src/import.ts and test/import.test.ts; current parser rejects quoted commas."
}
```

The final goal requires verification evidence and fails while open findings remain.

## Findings gate

Findings are accepted repair work, not a scratchpad.

Use them for review issues, failed verification, missing requirements, security-sensitive problems, or unexplained clues that must not be lost.

A finding needs evidence:

```json
{
  "action": "add",
  "title": "Missing final verification",
  "severity": "high",
  "source": "review",
  "evidence": "The worker reported tests but did not include command output or a failing/passing check."
}
```

Resolve it only with resolution and verification evidence:

```json
{
  "action": "resolve",
  "id": "F001",
  "evidence": "Added a verification command to the final acceptance path.",
  "verifyEvidence": "npm test exited 0."
}
```

Then run the gate:

```json
{ "action": "gate" }
```

## ADLC-inspired rail guard

Pi Fable includes a small CI backstop adapted from ADLC's fail-closed rail-freeze pattern:

```bash
node scripts/fable-guard-ci.mjs [base-ref]
```

It reads protected paths from the trusted base copy of `.pi-fable/rails.json`, not the branch copy, so a PR cannot remove rails and edit a formerly protected file in the same change.

Supported shapes:

```json
{ "rails": ["src/critical/**", "docs/policy.md"] }
```

```json
{ "tickets": [{ "id": "FABLE-1", "rails": ["src/critical/**"] }] }
```

Exit codes:

- `0` — no base rails, or no protected path changed.
- `2` — protected path changed.
- `1` — base ref, git, or trusted rail-file problem; fail closed.

The package also ships `scripts/release.mjs <version> [--pack]`, a single-package release helper inspired by ADLC's lockstep release script. It updates `package.json` and `package-lock.json`; `--pack` runs `npm run verify` and `npm pack --dry-run`.

## Design notes

- The extension lifecycle is modeled with [XState v5](https://stately.ai/docs/setup): routes are explicit states, not boolean soup.
- Local state operations are wrapped with [Effect v4 beta](https://effect.website/blog/releases/effect/40-beta/) so file IO has one composable boundary.
- The gate shape borrows from [ADLC](https://github.com/voodootikigod/adlc): small checks, JSON-shaped details, fail-closed defaults, and evidence over assertion.
- The orchestration layer deliberately depends on `pi-subagents`; Pi Fable should make delegation sharper, not fork another agent runner.

## Attribution

See [NOTICE](./NOTICE) and [docs/provenance.md](./docs/provenance.md).

Short version: this is a Pi-native adaptation of ideas from FableCodex, ADLC, and pi-subagents, with additional inspiration from the sources FableCodex credits. It paraphrases and reimplements workflow procedures for Pi.

## License

AGPL-3.0-or-later.
