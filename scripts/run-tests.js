#!/usr/bin/env node
// Runs every *.test.js under server/ and prints one aggregate count.
// Exists because there was no runner: files were run one at a time by hand,
// two of them print an ExperimentalWarning AFTER their count line, and two
// live outside server/routes and server/engines and were easy to miss.
//
// Exit code 0 only if every file parsed and every assertion passed.

const { readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = join(__dirname, '..');
const SERVER = join(ROOT, 'server');

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findTests(full));
    else if (entry.endsWith('.test.js')) out.push(full);
  }
  return out.sort();
}

const files = findTests(SERVER);
if (files.length === 0) {
  console.error('No test files found under server/. Wrong working directory?');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const unparsed = [];
const red = [];

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const run = spawnSync(process.execPath, [file], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 120000,
  });
  const output = `${run.stdout || ''}\n${run.stderr || ''}`;

  // Count line is "N passed, M failed". Take the LAST match: some files print
  // a SQLite ExperimentalWarning after it, and a few print per-suite subtotals.
  const matches = [...output.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed/g)];

  if (matches.length === 0) {
    unparsed.push(rel);
    console.log(`  ??  ${rel.padEnd(44)} no count line`);
    continue;
  }

  const last = matches[matches.length - 1];
  const filePassed = Number(last[1]);
  const fileFailed = Number(last[2]);
  passed += filePassed;
  failed += fileFailed;

  const bad = fileFailed > 0 || run.status !== 0;
  if (bad) red.push(rel);
  console.log(
    `  ${bad ? 'FAIL' : ' ok '}  ${rel.padEnd(44)} ${filePassed} passed, ${fileFailed} failed`
  );
}

console.log('');
console.log(`  ${files.length} files, ${passed} passed, ${failed} failed`);

if (unparsed.length > 0) {
  console.log('');
  console.log('  Files that produced no count line (treated as failure):');
  for (const f of unparsed) console.log(`    ${f}`);
}
if (red.length > 0) {
  console.log('');
  console.log('  Failing files:');
  for (const f of red) console.log(`    ${f}`);
}

const ok = failed === 0 && unparsed.length === 0 && red.length === 0;
console.log('');
console.log(ok ? '  SUITE GREEN' : '  SUITE RED');
process.exit(ok ? 0 : 1);
