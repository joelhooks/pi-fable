#!/usr/bin/env node
// Small single-package release helper, inspired by ADLC's lockstep release script.
//
//   node scripts/release.mjs <version>          # update package + lock only
//   node scripts/release.mjs <version> --pack   # update, verify, and npm pack --dry-run
//
// This intentionally does not publish. Public release should still happen from a
// reviewed tag/CI path with provenance.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const pack = process.argv.includes('--pack');

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('usage: release.mjs <semver> [--pack]');
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const packagePath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');

const pkg = readJson(packagePath);
pkg.version = version;
writeJson(packagePath, pkg);
console.log(`set ${pkg.name}@${version}`);

try {
  const lock = readJson(lockPath);
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson(lockPath, lock);
  console.log(`set package-lock root @${version}`);
} catch (error) {
  console.warn(`warning: could not update package-lock.json (${error.message})`);
}

if (!pack) {
  console.log(`\nversion set to ${version}. Run npm run verify, commit, tag v${version}, then publish from CI.`);
  process.exit(0);
}

execFileSync('npm', ['run', 'verify'], { cwd: root, stdio: 'inherit' });
execFileSync('npm', ['pack', '--dry-run'], { cwd: root, stdio: 'inherit' });
console.log(`\nrelease dry-run passed for ${pkg.name}@${version}.`);
