// Tests for Step ui-shell (ADR-111): every page gets its top bar and menu from
// public/shell.js, the head lines for the icon and manifest, and no inline body
// width; the manifest and its icons are real. A static check like
// selfHostFont.test.js, plus one request to the same static middleware the
// server uses. Plain assertions and the suite's "N passed, M failed" line.

const assert = require('assert');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const express = require('express');

const PUBLIC = join(__dirname, '..', 'public');
const pages = readdirSync(PUBLIC).filter((f) => f.endsWith('.html')).sort();
const read = (f) => readFileSync(join(PUBLIC, f), 'utf8');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// A PNG's width and height sit in its IHDR chunk, bytes 16-23.
function pngSize(file) {
  const b = readFileSync(join(PUBLIC, file));
  assert.strictEqual(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

console.log('UI Shell Tests (ui-shell)\n');

test('there are 14 pages', () => {
  assert.strictEqual(pages.length, 14, pages.join(', '));
});

test('every page has one empty <nav></nav> and loads shell.js (no old link list)', () => {
  for (const f of pages) {
    const html = read(f);
    assert.strictEqual((html.match(/<nav\b/g) || []).length, 1, `${f}: one <nav>`);
    assert.ok(html.includes('<nav></nav>'), `${f}: the <nav> is not empty`);
    assert.ok(html.includes('<script src="shell.js"></script>'), `${f}: does not load shell.js`);
  }
});

test('the login page asks for the logo only', () => {
  assert.ok(/<body[^>]*data-shell="login"/.test(read('login.html')));
});

test('every href in shell.js is a file in public/; Kitchen Sales in Kitchen, Typed sales in Admin', () => {
  const js = read('shell.js');
  const hrefs = [...js.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.strictEqual(hrefs.length, 12);
  for (const h of hrefs) assert.ok(existsSync(join(PUBLIC, h)), `missing ${h}`);
  const kitchen = js.slice(js.indexOf("name: 'Kitchen'"), js.indexOf("name: 'Commissary'"));
  assert.ok(kitchen.includes("{ label: 'Kitchen Sales', href: 'kitchen-sales.html' }"));
  const admin = js.slice(js.indexOf("name: 'Admin'"));
  assert.ok(admin.includes("{ label: 'Typed sales', href: 'sales.html' }"));
});

test('every page has the manifest, icon, apple-touch-icon and theme-color lines', () => {
  for (const f of pages) {
    const html = read(f);
    for (const line of [
      '<link rel="manifest" href="manifest.webmanifest">',
      '<link rel="icon" href="icons/favicon-32.png">',
      '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
      '<meta name="theme-color" content="#222121">',
    ]) assert.ok(html.includes(line), `${f}: missing ${line}`);
  }
});

test('no page keeps an inline body max-width; Home and Login narrow, the rest wide', () => {
  for (const f of pages) {
    const body = read(f).match(/<body[^>]*>/)[0];
    assert.ok(!/style=/.test(body), `${f}: ${body}`);
    const wide = /class="page-wide"/.test(body);
    assert.strictEqual(wide, !['index.html', 'login.html'].includes(f), `${f}: ${body}`);
  }
});

test('the typed sales page reads "Typed sales"', () => {
  const html = read('sales.html');
  assert.ok(html.includes('<title>Typed sales - Inventory Audit App</title>'));
  assert.ok(html.includes('<h1>Typed sales</h1>'));
});

test('the manifest parses, names the three icons, and each icon is its stated size', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.strictEqual(m.name, 'Silingan Inventory');
  assert.strictEqual(m.short_name, 'Inventory');
  assert.strictEqual(m.start_url, '/index.html');
  assert.strictEqual(m.display, 'standalone');
  assert.strictEqual(m.background_color, '#222121');
  assert.strictEqual(m.theme_color, '#222121');
  assert.deepStrictEqual(m.icons.map((i) => [i.src, i.purpose]), [
    ['icons/icon-192.png', 'any'],
    ['icons/icon-512.png', 'any'],
    ['icons/icon-maskable-512.png', 'maskable'],
  ]);
  for (const icon of m.icons) assert.strictEqual(pngSize(icon.src), icon.sizes, icon.src);
  assert.strictEqual(pngSize('icons/apple-touch-icon.png'), '180x180');
  assert.strictEqual(pngSize('icons/favicon-32.png'), '32x32');
});

test('command-panel.js no longer fetches /api/auth/me', () => {
  assert.ok(!read('command-panel.js').includes('/api/auth/me'));
});

test('the server serves manifest.webmanifest as application/manifest+json', async () => {
  // The same middleware line as server/index.js, on its own port.
  const index = readFileSync(join(__dirname, 'index.js'), 'utf8');
  assert.ok(index.includes("app.use(express.static(path.join(__dirname, '..', 'public')));"));
  const app = express();
  app.use(express.static(PUBLIC));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/manifest.webmanifest`);
    assert.strictEqual(res.status, 200);
    assert.ok(/^application\/manifest\+json/.test(res.headers.get('content-type')), res.headers.get('content-type'));
  } finally {
    server.close();
  }
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
