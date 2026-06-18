# Provenance

Pi Fable is a Pi-native adaptation. It borrows workflow ideas, not model identity or hidden prompt authority.

## Primary sources inspected

- `baskduf/FableCodex`
  - Repository: <https://github.com/baskduf/FableCodex>
  - Relevant files inspected: `README.md`, `NOTICE`, `plugins/codex-fable5/skills/codex-fable5/SKILL.md`, `scripts/codex_goals.py`, `scripts/codex_findings.py`, `references/task-routing.md`, `references/provenance.md`.
  - Adapted ideas: task routing, inspect-first loop, goal ledger, findings gate, final verification gate, capability honesty, public package structure.

- `voodootikigod/adlc`
  - Repository: <https://github.com/voodootikigod/adlc>
  - Relevant files inspected: `README.md`, `scripts/rails-guard-ci.mjs`, `scripts/release.mjs`, `scripts/test/rails-guard-ci.test.mjs`.
  - Adapted ideas: gate-shaped tooling, trusted-base rail loading, fail-closed trust roots, small scripts with clear exit semantics, offline throwaway-git tests, and release-version helper shape.
  - Local files: `scripts/fable-guard-ci.mjs`, `scripts/release.mjs`, and `test/fable-guard-ci.test.mjs` are Pi Fable implementations inspired by those ADLC scripts; they do not vendor ADLC code.

- `nicobailon/pi-subagents`
  - Repository: <https://github.com/nicobailon/pi-subagents>
  - Relevant installed package files inspected locally: `README.md`, `skills/pi-subagents/SKILL.md`, `src/extension/index.ts`, prompt templates.
  - Adapted ideas: parent-owned orchestration, fresh-context review, single-writer worker, async background runs, explicit role prompts.

## Upstream sources credited by FableCodex

FableCodex credits:

- `elder-plinius/CL4R1T4S`, commit `dc626fed52b06d687cdc812d51090c95ed03d575`.
- `fivetaku/fablize`, commit `15912466994e71a234d18fe9c74b46a68fb6a07d`.
- `itsinseong/value-for-fable`, commit `35a9bd27de961a49c343f41ac47c49114d51a328`.

Pi Fable keeps that chain visible because this package is a derivative workflow adaptation.

## Boundary

Pi Fable does not claim to be Fable, Claude, Anthropic, Codex, or any provider-specific model. It is a Pi extension package that helps the parent Pi agent use tools and subagents with stricter evidence gates.

Procedure helps prevent missed steps. It does not create model capability.
