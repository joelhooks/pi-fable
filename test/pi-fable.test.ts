import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyRequest } from "../src/router.ts";
import { handleFinding, handleGoal, handleStatus } from "../src/state.ts";

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-fable-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("classifies implementation work into execute route", () => {
  const route = classifyRequest("build a Pi extension package around subagents");
  assert.equal(route.id, "execute");
  assert.equal(route.goalLedger, "recommended");
});

test("classifies review work into required findings gate route", () => {
  const route = classifyRequest("review this diff for security issues");
  assert.equal(route.id, "review");
  assert.equal(route.findingsGate, "required");
});

test("goal final checkpoint is blocked by open findings", async () => {
  await withTemp(async (cwd) => {
    const created = await handleGoal(cwd, {
      action: "create",
      brief: "Smoke",
      goals: ["inspect::Read state", "verify::Confirm done"],
    });
    assert.equal(created.ok, true);

    const first = await handleGoal(cwd, { action: "next" });
    assert.match(first.message, /G001/);
    await handleGoal(cwd, { action: "checkpoint", id: "G001", status: "complete", evidence: "read files" });

    const second = await handleGoal(cwd, { action: "next" });
    assert.match(second.message, /Final goal/);

    await handleFinding(cwd, {
      action: "add",
      title: "Missing proof",
      severity: "high",
      source: "review",
      evidence: "No command output was recorded.",
    });

    await assert.rejects(
      () => handleGoal(cwd, {
        action: "checkpoint",
        id: "G002",
        status: "complete",
        evidence: "done",
        verifyCmd: "npm test",
        verifyEvidence: "passed",
      }),
      /blocked by 1 open\/blocking finding/,
    );
  });
});

test("resolved finding lets final goal complete", async () => {
  await withTemp(async (cwd) => {
    await handleGoal(cwd, {
      action: "create",
      brief: "Smoke",
      goals: ["inspect::Read state", "verify::Confirm done"],
    });
    await handleGoal(cwd, { action: "next" });
    await handleGoal(cwd, { action: "checkpoint", id: "G001", status: "complete", evidence: "read files" });
    await handleGoal(cwd, { action: "next" });
    await handleFinding(cwd, {
      action: "add",
      title: "Missing proof",
      severity: "high",
      source: "review",
      evidence: "No command output was recorded.",
    });
    await handleFinding(cwd, {
      action: "resolve",
      id: "F001",
      evidence: "Added verification evidence.",
      verifyEvidence: "npm test exited 0.",
    });
    const final = await handleGoal(cwd, {
      action: "checkpoint",
      id: "G002",
      status: "complete",
      evidence: "done",
      verifyCmd: "npm test",
      verifyEvidence: "passed",
    });
    assert.match(final.message, /all goals complete/);
    const status = await handleStatus(cwd);
    assert.match(status.message, /2\/2 goals complete/);
    assert.match(status.message, /0 blocking, 1 resolved/);
  });
});
