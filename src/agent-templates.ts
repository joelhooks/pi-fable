import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect } from "effect";

export const AGENT_TEMPLATE_SUBDIR = path.join("agents", "pi-fable");

export type AgentInstallScope = "project" | "user";
export type AgentTemplateAction = "list" | "install";

export interface AgentTemplateInfo {
  readonly name: string;
  readonly runtimeName: string;
  readonly sourcePath: string;
}

export interface AgentInstallInput {
  readonly action: AgentTemplateAction;
  readonly scope?: AgentInstallScope;
  readonly force?: boolean;
  readonly dryRun?: boolean;
}

export interface AgentInstallReceipt {
  readonly action: AgentTemplateAction;
  readonly scope: AgentInstallScope;
  readonly targetDir: string;
  readonly templates: readonly AgentTemplateInfo[];
  readonly installed: readonly string[];
  readonly skipped: readonly string[];
  readonly dryRun: boolean;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function exists(filePath: string): Effect.Effect<boolean, Error> {
  return Effect.tryPromise({
    try: async () => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    catch: asError,
  });
}

function findProjectRootSync(cwd: string): string {
  let current = path.resolve(cwd);
  while (true) {
    const entries = [".git", "package.json", ".pi", ".agents"];
    if (entries.some((entry) => existsSync(path.join(current, entry)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

async function hasProjectMarker(dir: string): Promise<boolean> {
  for (const entry of [".git", "package.json", ".pi", ".agents"]) {
    try {
      await fs.stat(path.join(dir, entry));
      return true;
    } catch {
      // Keep looking.
    }
  }
  return false;
}

function findProjectRoot(cwd: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: async () => {
      let current = path.resolve(cwd);
      while (true) {
        if (await hasProjectMarker(current)) return current;
        const parent = path.dirname(current);
        if (parent === current) return path.resolve(cwd);
        current = parent;
      }
    },
    catch: asError,
  });
}

export function resolveAgentTargetDir(cwd: string, scope: AgentInstallScope): Effect.Effect<string, Error> {
  if (scope === "user") {
    return Effect.succeed(path.join(os.homedir(), ".pi", "agent", "agents", "pi-fable"));
  }
  return Effect.map(findProjectRoot(cwd), (projectRoot) => path.join(projectRoot, ".pi", "agents", "pi-fable"));
}

export function resolveAgentTargetDirSync(cwd: string, scope: AgentInstallScope): string {
  if (scope === "user") return path.join(os.homedir(), ".pi", "agent", "agents", "pi-fable");
  return path.join(findProjectRootSync(cwd), ".pi", "agents", "pi-fable");
}

export function listAgentTemplates(packageRoot: string): Effect.Effect<readonly AgentTemplateInfo[], Error> {
  return Effect.tryPromise({
    try: async () => {
      const templateDir = path.join(packageRoot, AGENT_TEMPLATE_SUBDIR);
      const entries = await fs.readdir(templateDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => {
          const name = entry.name.replace(/\.md$/, "");
          return {
            name,
            runtimeName: `pi-fable.${name}`,
            sourcePath: path.join(templateDir, entry.name),
          } satisfies AgentTemplateInfo;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    catch: asError,
  });
}

export function handleAgentTemplates(
  cwd: string,
  packageRoot: string,
  input: AgentInstallInput,
): Promise<AgentInstallReceipt> {
  return Effect.runPromise(Effect.gen(function* () {
    const scope = input.scope ?? "project";
    const dryRun = input.dryRun ?? false;
    const force = input.force ?? false;
    const templates = yield* listAgentTemplates(packageRoot);
    const targetDir = yield* resolveAgentTargetDir(cwd, scope);

    if (input.action === "list") {
      return {
        action: input.action,
        scope,
        targetDir,
        templates,
        installed: [],
        skipped: [],
        dryRun: true,
      } satisfies AgentInstallReceipt;
    }

    if (!dryRun) {
      yield* Effect.tryPromise({ try: () => fs.mkdir(targetDir, { recursive: true }), catch: asError });
    }

    const installed: string[] = [];
    const skipped: string[] = [];
    for (const template of templates) {
      const targetPath = path.join(targetDir, `${template.name}.md`);
      const alreadyExists = yield* exists(targetPath);
      if (alreadyExists && !force) {
        skipped.push(targetPath);
        continue;
      }
      installed.push(targetPath);
      if (!dryRun) {
        const content = yield* Effect.tryPromise({ try: () => fs.readFile(template.sourcePath, "utf8"), catch: asError });
        yield* Effect.tryPromise({ try: () => fs.writeFile(targetPath, content, "utf8"), catch: asError });
      }
    }

    return {
      action: input.action,
      scope,
      targetDir,
      templates,
      installed,
      skipped,
      dryRun,
    } satisfies AgentInstallReceipt;
  }));
}
