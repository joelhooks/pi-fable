import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'fable-guard-ci.mjs');

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function write(dir, file, content) {
  mkdirSync(join(dir, dirname(file)), { recursive: true });
  writeFileSync(join(dir, file), content);
}

function runScript(cwd, base = 'main') {
  try {
    execFileSync(process.execPath, [SCRIPT, base], { cwd, stdio: 'pipe' });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

function runScenario({ baseRails, seedFiles, mutate }) {
  const dir = mkdtempSync(join(tmpdir(), 'pfable-guard-'));
  try {
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Pi Fable Test']);
    if (baseRails !== null) write(dir, '.pi-fable/rails.json', baseRails);
    for (const file of seedFiles) write(dir, file, 'orig\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    git(dir, ['checkout', '-q', '-b', 'feature']);
    mutate(dir);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'change']);
    return runScript(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const RAILED = JSON.stringify({ rails: ['src/critical/**'] });

test('base rails reject edits to protected files', () => {
  const code = runScenario({
    baseRails: RAILED,
    seedFiles: ['src/critical/auth.ts'],
    mutate: (dir) => write(dir, 'src/critical/auth.ts', 'weakened\n'),
  });
  assert.equal(code, 2);
});

test('base rails still apply when branch empties rails', () => {
  const code = runScenario({
    baseRails: RAILED,
    seedFiles: ['src/critical/auth.ts'],
    mutate: (dir) => {
      write(dir, '.pi-fable/rails.json', JSON.stringify({ rails: [] }));
      write(dir, 'src/critical/auth.ts', 'weakened\n');
    },
  });
  assert.equal(code, 2);
});

test('rail trust root is protected when base rails exist', () => {
  const code = runScenario({
    baseRails: RAILED,
    seedFiles: ['src/critical/auth.ts'],
    mutate: (dir) => write(dir, '.pi-fable/rails.json', JSON.stringify({ rails: ['src/critical/**', 'src/new/**'] })),
  });
  assert.equal(code, 2);
});

test('non-rail changes pass when base rails exist', () => {
  const code = runScenario({
    baseRails: RAILED,
    seedFiles: ['src/critical/auth.ts', 'src/app.ts'],
    mutate: (dir) => write(dir, 'src/app.ts', 'feature\n'),
  });
  assert.equal(code, 0);
});

test('no rails declared at base passes', () => {
  const code = runScenario({
    baseRails: JSON.stringify({ rails: [] }),
    seedFiles: ['src/app.ts'],
    mutate: (dir) => write(dir, 'src/app.ts', 'feature\n'),
  });
  assert.equal(code, 0);
});

test('malformed base rail file fails closed', () => {
  const code = runScenario({
    baseRails: '{ nope',
    seedFiles: ['src/app.ts'],
    mutate: (dir) => write(dir, 'src/app.ts', 'feature\n'),
  });
  assert.equal(code, 1);
});

test('missing base rail file passes as genuinely nothing frozen', () => {
  const code = runScenario({
    baseRails: null,
    seedFiles: ['src/app.ts'],
    mutate: (dir) => write(dir, 'src/app.ts', 'feature\n'),
  });
  assert.equal(code, 0);
});

test('unresolvable base fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pfable-guard-'));
  try {
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Pi Fable Test']);
    write(dir, '.pi-fable/rails.json', RAILED);
    write(dir, 'src/app.ts', 'x\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    assert.equal(runScript(dir, 'origin/nope'), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
