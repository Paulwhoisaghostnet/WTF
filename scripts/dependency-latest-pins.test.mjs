import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const ignoredDirs = new Set([
  '.git',
  '.playwright-cli',
  'dist',
  'node_modules',
]);
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function findFiles(dir, fileName, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        findFiles(join(dir, entry.name), fileName, out);
      }
      continue;
    }

    if (entry.isFile() && entry.name === fileName) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function collectLatestSpecs(filePath, manifest) {
  const failures = [];
  for (const field of dependencyFields) {
    const deps = manifest[field] ?? {};
    for (const [name, spec] of Object.entries(deps)) {
      if (spec === 'latest') {
        failures.push(`${relative(repoRoot, filePath)} ${field}.${name}`);
      }
    }
  }
  return failures;
}

test('package manifests do not use latest dependency specs', () => {
  const failures = findFiles(repoRoot, 'package.json')
    .flatMap((filePath) => collectLatestSpecs(filePath, readJson(filePath)))
    .sort();

  assert.deepEqual(failures, []);
});

test('package lock root manifests do not use latest dependency specs', () => {
  const failures = findFiles(repoRoot, 'package-lock.json')
    .flatMap((filePath) => {
      const lock = readJson(filePath);
      const rootManifest = lock.packages?.[''];
      return rootManifest ? collectLatestSpecs(filePath, rootManifest) : [];
    })
    .sort();

  assert.deepEqual(failures, []);
});
