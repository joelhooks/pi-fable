import path from "node:path";
import { STATE_DIR_NAME } from "./domain.ts";

export function stateDir(cwd: string): string {
  return path.join(cwd, STATE_DIR_NAME);
}

export function stateFile(cwd: string, name: string): string {
  return path.join(stateDir(cwd), name);
}

export function goalsFile(cwd: string): string {
  return stateFile(cwd, "goals.json");
}

export function findingsFile(cwd: string): string {
  return stateFile(cwd, "findings.json");
}

export function ledgerFile(cwd: string): string {
  return stateFile(cwd, "ledger.jsonl");
}

export function lockDir(cwd: string): string {
  return stateFile(cwd, "state.lockdir");
}
