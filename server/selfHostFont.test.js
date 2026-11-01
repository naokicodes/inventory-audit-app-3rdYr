// Tests for Step self-host-font: pages never load fonts from Google, and every
// font file style.css points at is in public/. Plain assertions and the same
// "N passed, M failed" count line as the rest of the suite.

const assert = require('assert');
const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const PUBLIC = join(__dirname, '..', 'public');

function allFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...allFiles(full));
    else out.push(full);
  }
  return out;
}

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('Self-host Font Tests (self-host-font)\n');

test('no file under public/ references fonts.googleapis.com or fonts.gstatic.com', () => {
  const hits = allFiles(PUBLIC)
    .filter((f) => !f.endsWith('.woff2'))
    .filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, 'utf8')));
  assert.deepStrictEqual(hits, []);
});

test('style.css has Archivo 400/500/600/700 and each file exists under public/', () => {
  const css = readFileSync(join(PUBLIC, 'style.css'), 'utf8');
  const urls = [...css.matchAll(/url\('(fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]);
  assert.deepStrictEqual(urls.map((u) => u.match(/-(\d{3})-/)[1]), ['400', '500', '600', '700']);
  for (const u of urls) assert.ok(existsSync(join(PUBLIC, u)), `missing ${u}`);
  assert.ok(existsSync(join(PUBLIC, 'fonts', 'OFL.txt')), 'missing fonts/OFL.txt');
});

for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
