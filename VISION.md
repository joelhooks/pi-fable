# Pi Fable Vision

## Intent

Pi Fable is a Pi extension package for evidence-gated subagent workflows.

Its job is to wrap `pi-subagents` with operating discipline: inspect first, route the work, track goals for dependent tasks, record accepted findings, and verify before saying done. It adds Pi-native tools, prompt templates, skill guidance, and opt-in specialist subagent templates.

## Who It Serves

- Pi users who want subagent workflows with explicit evidence and closeout gates.
- Operators running reviews, migrations, investigations, or multi-step implementation work.
- Agents that need a lightweight goal/finding ledger without changing Pi model behavior.

## Product Bet

Subagents are more useful when their work is routed, evidenced, and reviewed. Pi Fable should improve discipline around Pi workflows without pretending to unlock hidden runtime capability.

## Priorities

1. **Evidence before confidence.** Prefer receipts, findings, and verification over vague completion claims.
2. **Clear routing.** Map task signals to concrete `pi-subagents` patterns.
3. **Local ledgers.** Keep `.pi-fable/goals.json` and `.pi-fable/findings.json` useful and uncommitted by default.
4. **Opt-in specialists.** Install specialist templates only when the operator asks.
5. **Runtime honesty.** Do not claim model, context, provider, or hidden behavior changes.

## Non-Goals

- Do not replace `pi-subagents`.
- Do not change model weights, context length, provider access, or hidden Pi runtime behavior.
- Do not make specialist agents write to the worktree when their role is advisory.
- Do not turn local goal/finding ledgers into committed project memory by default.

## Merge By Default

Merge small, tested changes that:

- improve routing recommendations;
- harden goal or finding ledger behavior;
- make specialist template installation clearer;
- improve prompt templates without overstating capability;
- add focused tests for tool behavior and ledger gates.

## Needs Owner Sign-Off

Stop for explicit approval before:

- changing default ledger storage or commit behavior;
- making specialist agents write-capable by default;
- adding networked state or telemetry;
- claiming hidden Pi runtime capabilities;
- changing package install assumptions around `pi-subagents`.

## Evidence Of Progress

The package is working when:

- `/fable`, `/fable-context`, and `/fable-review` route work into clear patterns;
- goal ledgers preserve dependent work state;
- findings cannot be closed without resolution and verification evidence;
- opt-in specialist templates install predictably;
- users understand this is workflow discipline, not a model unlocker.
