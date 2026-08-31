// Tests for step 23c-ii-d's Terminal qualified-token grammar - mirrors
// ONLY the resolver logic added to public/terminal.html's inline script
// (resolveCommissaryMeat / commissaryMeatToken), not any DOM/page logic,
// same mirrored-logic style as commands.test.js. No DB involved: the
// resolver operates purely on the array GET /api/commissary/meats
// already returns (id, code, name, commissary_id, commissary_code,
// commissary_name - see 23c-ii-c), so the fixtures here are plain JS
// objects shaped exactly like that response, not a seeded schema.

const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('Terminal Route Tests (step 23c-ii-d: qualified-token commissary-meat resolver)\n');

// ---- mirrors terminal.html's normalize/resolveCommissaryMeat/commissaryMeatToken exactly ----

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

function resolveCommissaryMeat(token, commissaryMeats) {
  const slashIdx = token.indexOf('/');
  if (slashIdx !== -1) {
    const commissaryPart = normalize(token.slice(0, slashIdx));
    const meatPart = normalize(token.slice(slashIdx + 1));
    const matches = commissaryMeats.filter(m =>
      normalize(m.commissary_code) === commissaryPart &&
      (normalize(m.code) === meatPart || normalize(m.name) === meatPart)
    );
    if (matches.length === 1) return { status: 'resolved', meat: matches[0] };
    if (matches.length > 1) return { status: 'ambiguous', matches };
    return { status: 'unknown' };
  }
  const norm = normalize(token);
  const matches = commissaryMeats.filter(m =>
    normalize(m.code) === norm || normalize(m.name) === norm
  );
  if (matches.length === 1) return { status: 'resolved', meat: matches[0] };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'unknown' };
}

function commissaryMeatToken(meat, commissaryMeats) {
  const bareNorm = normalize(meat.name);
  const bareResult = resolveCommissaryMeat(bareNorm, commissaryMeats);
  if (bareResult.status === 'resolved' && bareResult.meat.id === meat.id) return bareNorm;
  if (!meat.commissary_code) return bareNorm;
  return `${normalize(meat.commissary_code)}/${normalize(meat.code)}`;
}

// ---- fixtures: JOWL exists under both COM-A (code M05) and COM-B (code
// M05 too - same code, different commissary, exactly the reachable
// collision schema.sql's UNIQUE(commissary_id, code) allows). PATA is a
// non-colliding meat under COM-A only, for the "still resolves bare
// exactly as before" case. GHOST has a null commissary_code, mirroring a
// dangling commissary_id under 23c-ii-c's LEFT JOIN. ----

const comAJowl = { id: 1, code: 'M05', name: 'JOWL', commissary_id: 1, commissary_code: 'COM-A', commissary_name: 'Commissary A' };
const comBJowl = { id: 2, code: 'M05', name: 'JOWL', commissary_id: 2, commissary_code: 'COM-B', commissary_name: 'Commissary B' };
const comAPata = { id: 3, code: 'M07', name: 'PATA', commissary_id: 1, commissary_code: 'COM-A', commissary_name: 'Commissary A' };
const ghostMeat = { id: 4, code: 'M99', name: 'Ghost Meat', commissary_id: 9999, commissary_code: null, commissary_name: null };
// Reachable same-commissary collision: schema.sql's UNIQUE is on
// (commissary_id, code), not name, so two meats under COM-A can share a
// name with different codes - this trips the QUALIFIED branch's own
// filter (matches on code OR name), unlike comAJowl/comBJowl above which
// only collide across different commissaries.
const comAJowl2 = { id: 5, code: 'M06', name: 'JOWL', commissary_id: 1, commissary_code: 'COM-A', commissary_name: 'Commissary A' };

const commissaryMeats = [comAJowl, comBJowl, comAPata, ghostMeat, comAJowl2];

test('a bare unique token resolves', () => {
  const result = resolveCommissaryMeat('pata', commissaryMeats);
  assert.strictEqual(result.status, 'resolved');
  assert.strictEqual(result.meat.id, 3);
});

test('a bare ambiguous token returns ambiguous, not a silent first match - this is the bug the resolver fixes', () => {
  const result = resolveCommissaryMeat('jowl', commissaryMeats);
  assert.strictEqual(result.status, 'ambiguous');
  assert.strictEqual(result.matches.length, 3);
  assert.deepStrictEqual(result.matches.map(m => m.id).sort(), [1, 2, 5]);
});

test('a bare ambiguous token by code (not name) is also caught', () => {
  const result = resolveCommissaryMeat('m05', commissaryMeats);
  assert.strictEqual(result.status, 'ambiguous');
  assert.strictEqual(result.matches.length, 2);
});

test('a qualified token resolves the right one of two colliding meats', () => {
  const resultA = resolveCommissaryMeat('com-a/m05', commissaryMeats);
  assert.strictEqual(resultA.status, 'resolved');
  assert.strictEqual(resultA.meat.id, 1);

  const resultB = resolveCommissaryMeat('com-b/m05', commissaryMeats);
  assert.strictEqual(resultB.status, 'resolved');
  assert.strictEqual(resultB.meat.id, 2);
});

test('a qualified token matches the meat by normalized name too, not just code', () => {
  const result = resolveCommissaryMeat('com-a/pata', commissaryMeats);
  assert.strictEqual(result.status, 'resolved');
  assert.strictEqual(result.meat.id, 3);
});

test('a qualified token matching two same-commissary meats by name is ambiguous, not a silent first pick', () => {
  const result = resolveCommissaryMeat('com-a/jowl', commissaryMeats);
  assert.strictEqual(result.status, 'ambiguous');
  assert.strictEqual(result.matches.length, 2);
  assert.deepStrictEqual(result.matches.map(m => m.id).sort(), [1, 5]);
});

test('a qualified token still resolves uniquely when qualified by code even though the name collides', () => {
  const resultCode1 = resolveCommissaryMeat('com-a/m05', commissaryMeats);
  assert.strictEqual(resultCode1.status, 'resolved');
  assert.strictEqual(resultCode1.meat.id, 1);

  const resultCode2 = resolveCommissaryMeat('com-a/m06', commissaryMeats);
  assert.strictEqual(resultCode2.status, 'resolved');
  assert.strictEqual(resultCode2.meat.id, 5);
});

test('a qualified token works even when the bare form was already unique - never refused for over-qualifying', () => {
  const result = resolveCommissaryMeat('com-a/pata', commissaryMeats);
  assert.strictEqual(result.status, 'resolved');
  assert.strictEqual(result.meat.id, 3);
});

test('a qualified token is case/space-insensitive, matching schema examples like COM-A', () => {
  const result = resolveCommissaryMeat('COM-A/M05', commissaryMeats);
  assert.strictEqual(result.status, 'resolved');
  assert.strictEqual(result.meat.id, 1);
});

test('an unknown token is unknown, not ambiguous', () => {
  const result = resolveCommissaryMeat('nonexistent', commissaryMeats);
  assert.strictEqual(result.status, 'unknown');
});

test('an unknown qualified commissary code is unknown, not a fallback match', () => {
  const result = resolveCommissaryMeat('com-z/m05', commissaryMeats);
  assert.strictEqual(result.status, 'unknown');
});

test('a meat with a null commissary_code does not throw and still resolves by its bare token', () => {
  assert.doesNotThrow(() => resolveCommissaryMeat('ghostmeat', commissaryMeats));
  const result = resolveCommissaryMeat('ghostmeat', commissaryMeats);
  assert.strictEqual(result.status, 'resolved');
  assert.strictEqual(result.meat.id, 4);
});

test('commissaryMeatToken: a non-colliding meat gets its bare normalized name', () => {
  assert.strictEqual(commissaryMeatToken(comAPata, commissaryMeats), 'pata');
});

test('commissaryMeatToken: a colliding meat gets the qualified form', () => {
  assert.strictEqual(commissaryMeatToken(comAJowl, commissaryMeats), 'com-a/m05');
  assert.strictEqual(commissaryMeatToken(comBJowl, commissaryMeats), 'com-b/m05');
});

test('commissaryMeatToken: a null-commissary_code meat falls back to its bare name, never "undefined/..."', () => {
  const token = commissaryMeatToken(ghostMeat, commissaryMeats);
  assert.strictEqual(token, 'ghostmeat');
  assert.ok(!token.includes('undefined'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
