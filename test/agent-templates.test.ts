import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAgentTemplates } from "../src/agent-templates.ts";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withTempProject<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-fable-agents-"));
  try {
    await writeFile(path.join(dir, "package.json"), "{}\n", "utf8");
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("lists packaged specialist agent templates", async () => {
  await withTempProject(async (cwd) => {
    const receipt = await handleAgentTemplates(cwd, packageRoot, { action: "list" });
    assert.equal(receipt.scope, "project");
    assert.equal(receipt.dryRun, true);
    assert.deepEqual(receipt.templates.map((template) => template.runtimeName), [
      "pi-fable.findings-reviewer",
      "pi-fable.oracle",
      "pi-fable.verifier",
    ]);
  });
});

test("installs templates into project .pi/agents/pi-fable without overwriting by default", async () => {
  await withTempProject(async (cwd) => {
    const installed = await handleAgentTemplates(cwd, packageRoot, { action: "install" });
    assert.equal(installed.installed.length, 3);
    assert.equal(installed.skipped.length, 0);

    const verifier = await readFile(path.join(cwd, ".pi", "agents", "pi-fable", "verifier.md"), "utf8");
    assert.match(verifier, /package: pi-fable/);
    assert.match(verifier, /name: verifier/);

    const skipped = await handleAgentTemplates(cwd, packageRoot, { action: "install" });
    assert.equal(skipped.installed.length, 0);
    assert.equal(skipped.skipped.length, 3);
  });
});

test("dry-run install reports target paths but writes nothing", async () => {
  await withTempProject(async (cwd) => {
    const receipt = await handleAgentTemplates(cwd, packageRoot, { action: "install", dryRun: true });
    assert.equal(receipt.installed.length, 3);
    await assert.rejects(() => readFile(path.join(cwd, ".pi", "agents", "pi-fable", "oracle.md"), "utf8"), /ENOENT/);
  });
});
