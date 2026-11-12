// Tests for lanUrls (Step lan-address). Pure: canned interfaces in the shape
// of os.networkInterfaces(), no real network. Plain assertions and the same
// "N passed, M failed" count line as the rest of the suite.

const assert = require('assert');
const { lanUrls } = require('./lanAddress.js');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

console.log('LAN Address Tests (lan-address)\n');

test('IPv6 and internal (127.0.0.1) entries are skipped', () => {
  const interfaces = {
    lo: [
      { address: '127.0.0.1', family: 'IPv4', internal: true },
      { address: '::1', family: 'IPv6', internal: true },
    ],
    'Wi-Fi': [
      { address: '192.168.1.23', family: 'IPv4', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false },
    ],
  };
  assert.deepStrictEqual(lanUrls(interfaces, 3000), [
    { name: 'Wi-Fi', url: 'http://192.168.1.23:3000' },
  ]);
});

test('two adapters -> two urls in the order given, with their names', () => {
  const interfaces = {
    'Wi-Fi': [{ address: '192.168.1.23', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '192.168.1.50', family: 'IPv4', internal: false }],
  };
  assert.deepStrictEqual(lanUrls(interfaces, 3000), [
    { name: 'Wi-Fi', url: 'http://192.168.1.23:3000' },
    { name: 'Ethernet', url: 'http://192.168.1.50:3000' },
  ]);
});

test('the port is used in each url', () => {
  const interfaces = {
    'Wi-Fi': [{ address: '192.168.1.23', family: 'IPv4', internal: false }],
  };
  assert.deepStrictEqual(lanUrls(interfaces, 8080), [
    { name: 'Wi-Fi', url: 'http://192.168.1.23:8080' },
  ]);
});

test('empty input -> []', () => {
  assert.deepStrictEqual(lanUrls({}, 3000), []);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
