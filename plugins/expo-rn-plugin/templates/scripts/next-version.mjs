#!/usr/bin/env node
// Conventional-commits version resolver. Scans commits since the last release and
// computes the next marketing version:
//
//   feat: / feat(scope):                    -> minor
//   fix: / perf: (+ scope)                  -> patch
//   type!: in subject OR "BREAKING CHANGE:" -> major
//   anything else (chore/docs/ci/build/...) -> no bump
//
// Usage:
//   node scripts/next-version.mjs             # dry-run: prints JSON {current,next,level}
//   node scripts/next-version.mjs --apply     # writes package.json IF a bump is warranted
//   node scripts/next-version.mjs --set 2.0.0 # force an exact version, skipping the scan
//
// Version is decoupled from the OTA fingerprint (fingerprint.config.js skips
// ExpoConfigVersions), so bumping is cosmetic / store-facing and OTA-safe.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const tryGit = (args) => {
  try {
    // Suppress stderr — callers treat failure as "not found" (e.g. no tags yet).
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

// Base to scan from: the latest `vX.Y.Z` tag if you tag releases; otherwise the
// commit that last set the current version in package.json; otherwise the root.
function baseRef(currentVersion) {
  const tag = tryGit(['describe', '--tags', '--match', 'v*', '--abbrev=0']);
  if (tag) return tag;
  const commit = tryGit([
    'log',
    '-1',
    '--format=%H',
    '-S',
    `"version": "${currentVersion}"`,
    '--',
    'package.json',
  ]);
  if (commit) return commit;
  return git(['rev-list', '--max-parents=0', 'HEAD']);
}

const RANK = { patch: 1, minor: 2, major: 3 };

function resolveLevel(base) {
  const raw = git(['log', `${base}..HEAD`, '--format=%B%n==COMMIT-END==']);
  const messages = raw
    .split('==COMMIT-END==')
    .map((m) => m.trim())
    .filter(Boolean);

  let level = null;
  const considered = [];
  for (const msg of messages) {
    const subject = msg.split('\n')[0];
    let l = null;
    if (/^[a-z]+(\([^)]*\))?!:/.test(subject) || /BREAKING CHANGE/.test(msg)) l = 'major';
    else if (/^feat(\([^)]*\))?:/.test(subject)) l = 'minor';
    else if (/^(fix|perf)(\([^)]*\))?:/.test(subject)) l = 'patch';
    if (l) {
      considered.push(`${l.padEnd(5)}  ${subject}`);
      if (!level || RANK[l] > RANK[level]) level = l;
    }
  }
  return { level, considered };
}

// An explicit `--set X.Y.Z` overrides the commit scan entirely — the escape hatch
// for releases the conventional-commit history can't express (a deliberate 2.0.0,
// or re-cutting a version the store rejected).
function explicitVersion() {
  const i = process.argv.indexOf('--set');
  if (i === -1) return null;
  const value = (process.argv[i + 1] ?? '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    console.error(`--set expects a bare X.Y.Z version, got: ${JSON.stringify(value)}`);
    process.exit(1);
  }
  return value;
}

const url = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(url, 'utf8'));
const current = pkg.version;
const forced = explicitVersion();
const base = baseRef(current);
// Scanning is pure and its output is informative even when forcing, so it still
// runs — the summary shows what the commits WOULD have produced.
const { level, considered } = resolveLevel(base);

let next = current;
if (forced) {
  next = forced;
} else if (level) {
  const [maj, min, pat] = current.split('.').map(Number);
  next = {
    major: [maj + 1, 0, 0],
    minor: [maj, min + 1, 0],
    patch: [maj, min, pat + 1],
  }[level].join('.');
}

// A forced version that already matches package.json is a no-op, not a bump —
// callers key off `bumped` to decide whether there's anything to commit.
const changes = next !== current;
const apply = process.argv.includes('--apply');
if (apply && changes) {
  pkg.version = next;
  writeFileSync(url, JSON.stringify(pkg, null, 2) + '\n');
}

console.log(
  JSON.stringify(
    {
      current,
      next,
      level: forced ? 'explicit' : (level ?? 'none'),
      bumped: apply && changes,
      base,
      considered,
    },
    null,
    2,
  ),
);
