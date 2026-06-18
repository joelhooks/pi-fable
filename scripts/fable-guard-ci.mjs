#!/usr/bin/env node
// Pi Fable CI backstop, adapted from ADLC's fail-closed rail guard pattern.
//
// The protected rail set is read from the TRUSTED BASE version of
// .pi-fable/rails.json, never the PR/worktree copy. That means a branch cannot
// remove rails and edit a formerly protected file in the same change.
//
//   node scripts/fable-guard-ci.mjs [base-ref]      (default: origin/main)
//
// Exit: 0 = no protected rails at base OR no rail touched
//       2 = a protected rail was modified
//       1 = operational error / malformed trusted base rail file (fail closed)

import { spawnSync } from 'node:child_process';

const base = process.argv[2] || process.env.FABLE_BASE || 'origin/main';
const railFile = '.pi-fable/rails.json';

function fail(message) {
  console.error(`fable-guard-ci: ${message}`);
  process.exit(1);
}

function runGit(args, options = {}) {
  return spawnSync('git', args, { encoding: 'utf8', ...options });
}

function normalizePath(value) {
  return value.replace(/^\.\//, '').replace(/^\/+/, '');
}

function escapeRegexChar(char) {
  return /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
}

function globToRegExp(glob) {
  const normalized = normalizePath(glob);
  if (!normalized) fail('empty rail entry — failing closed.');
  if (!/[?*]/.test(normalized)) {
    const exact = normalized.endsWith('/') ? `${normalized}.*` : normalized;
    return new RegExp(`^${[...exact].map(escapeRegexChar).join('')}$`);
  }

  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegexChar(char);
    }
  }
  source += '$';
  return new RegExp(source);
}

function parseRails(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    fail(`cannot parse ${base}:${railFile} (${error.message}) — failing closed.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(`${base}:${railFile} must be a JSON object — failing closed.`);
  }

  const rails = [];
  if (data.rails !== undefined) {
    if (!Array.isArray(data.rails)) fail(`${base}:${railFile} field "rails" must be an array — failing closed.`);
    for (const rail of data.rails) {
      if (typeof rail !== 'string') fail(`${base}:${railFile} has a non-string rail entry — failing closed.`);
      rails.push(rail);
    }
  }

  if (data.tickets !== undefined) {
    if (!Array.isArray(data.tickets)) fail(`${base}:${railFile} field "tickets" must be an array — failing closed.`);
    for (const ticket of data.tickets) {
      if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) fail('a trusted base ticket is not an object — failing closed.');
      if (ticket.rails !== undefined && !Array.isArray(ticket.rails)) fail('a trusted base ticket has a non-array rails field — failing closed.');
      for (const rail of ticket.rails ?? []) {
        if (typeof rail !== 'string') fail('a trusted base ticket has a non-string rail entry — failing closed.');
        rails.push(rail);
      }
    }
  }

  return [...new Set(rails.map(normalizePath))];
}

const ref = runGit(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
if (ref.status !== 0) {
  fail(`base ref '${base}' does not resolve — rails cannot be verified. Fetch it or pass the correct base.`);
}

const ls = runGit(['ls-tree', '--name-only', base, '--', railFile]);
if (ls.status !== 0) {
  fail(`git ls-tree failed for '${base}' (operational error) — failing closed.`);
}
if (!ls.stdout.trim()) {
  console.log(`fable-guard-ci: no ${railFile} at ${base} — nothing was frozen.`);
  process.exit(0);
}

const show = runGit(['show', `${base}:${railFile}`]);
if (show.status !== 0) {
  fail(`git show failed for existing ${base}:${railFile} (operational error) — failing closed.`);
}

const rails = parseRails(show.stdout);
if (rails.length === 0) {
  console.log(`fable-guard-ci: no rails declared at ${base} — nothing frozen.`);
  process.exit(0);
}

rails.push(railFile);
const matchers = rails.map((rail) => ({ rail, matcher: globToRegExp(rail) }));

const diff = runGit(['diff', '--name-only', `${base}...HEAD`, '--']);
if (diff.status !== 0) {
  fail(`git diff failed against '${base}' — failing closed.`);
}

const changed = diff.stdout
  .split('\n')
  .map((line) => normalizePath(line.trim()))
  .filter(Boolean);

const touched = [];
for (const file of changed) {
  for (const { rail, matcher } of matchers) {
    if (matcher.test(file)) touched.push({ file, rail });
  }
}

if (touched.length > 0) {
  console.error('fable-guard-ci: protected rails changed:');
  for (const hit of touched) console.error(`- ${hit.file} matched ${hit.rail}`);
  process.exit(2);
}

console.log(`fable-guard-ci: ${changed.length} changed file(s), no protected rails touched.`);
