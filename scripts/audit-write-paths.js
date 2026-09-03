#!/usr/bin/env node
// Write-path audit.
//
// Catches the bug class that has hit this project twice:
//   - 24a / 24b-i: output_commissary_meat_id and input_quantity were in the
//     schema and fully READ by the engine, but written by no route. A worker
//     dispatched on the UI step would have built a form that posted both
//     fields, got {ok: true}, and had them silently discarded.
//   - 25a / 25b: commissary_opening_stock and commissary_stock_receipts are
//     read by the engine and written by nothing at all, so every commissary
//     balance is null and variance never computes.
//
// Both are mechanically detectable: parse schema.sql, then check whether
// anything in server/ ever writes each table and column.
//
// KNOWN GAPS. This is a grep, not a parser. It will not see a write built
// from a template string with an interpolated table name, and it does not
// know whether a write is reachable. A clean run means "a write path exists
// in the source", not "the feature works".
//
// Expected-missing entries live in scripts/write-path-allowlist.json with a
// reason each. Delete an entry when its step lands - that is the point.

const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const ROOT = join(__dirname, '..');
const SCHEMA = join(ROOT, 'server', 'db', 'schema.sql');
const ALLOWLIST = join(__dirname, 'write-path-allowlist.json');

// Columns every table has that are written implicitly or by convention.
const IGNORED_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

// Parse CREATE TABLE blocks into { table: [columns] }.
function parseSchema(sql) {
  const tables = {};
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)\s*\(/gi;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const name = match[1];
    // Walk from the opening paren to its matching close.
    let depth = 1;
    let i = re.lastIndex;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      i++;
    }
    const body = sql.slice(re.lastIndex, i - 1);

    // Split on top-level commas only, so composite keys don't fragment.
    const parts = [];
    let buf = '';
    let d = 0;
    for (const ch of body) {
      if (ch === '(') d++;
      if (ch === ')') d--;
      if (ch === ',' && d === 0) {
        parts.push(buf);
        buf = '';
      } else buf += ch;
    }
    parts.push(buf);

    const columns = [];
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue;
      const col = line.match(/^([a-zA-Z_][\w]*)/);
      if (col) columns.push(col[1]);
    }
    tables[name] = columns;
  }
  return tables;
}

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) out.push(full);
  }
  return out;
}

const schemaSql = stripSqlComments(readFileSync(SCHEMA, 'utf8'));
const tables = parseSchema(schemaSql);

const sources = collectJsFiles(join(ROOT, 'server'));

// schema.sql seeds some reference tables with its own INSERT statements, so
// those count as write paths. Strip the CREATE TABLE bodies first, or a
// column declaration would read as a write of itself.
const schemaWrites = schemaSql.replace(
  /CREATE\s+TABLE[\s\S]*?\n\s*\)\s*;/gi,
  ''
);

const corpus = [...sources.map((f) => readFileSync(f, 'utf8')), schemaWrites].join('\n');

let allowlist = { tables: {}, columns: {} };
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
} catch {
  // No allowlist yet - every finding reports.
}

const missingTables = [];
const missingColumns = [];
// Allowlist entries whose write path now EXISTS. Just as important as a
// missing writer: an allowlist nobody prunes silently stops being a record
// of deliberate gaps and becomes a list everyone scrolls past.
const staleAllowlist = [];

for (const [table, columns] of Object.entries(tables)) {
  const insertRe = new RegExp(`INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO\\s+${table}\\b`, 'i');
  const updateRe = new RegExp(`UPDATE\\s+${table}\\b`, 'i');
  const hasInsert = insertRe.test(corpus);
  const hasUpdate = updateRe.test(corpus);

  if (!hasInsert && !hasUpdate) {
    if (!allowlist.tables[table]) missingTables.push(table);
    continue;
  }
  if (allowlist.tables[table]) {
    staleAllowlist.push(`${table} (table) - a write path now exists`);
  }

  // Column-level: gather every column named in this table's INSERT column
  // lists and UPDATE SET clauses.
  const written = new Set();

  const insertLists = corpus.matchAll(
    new RegExp(`INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO\\s+${table}\\s*\\(([^)]*)\\)`, 'gi')
  );
  for (const m of insertLists) {
    for (const c of m[1].split(',')) {
      const name = c.trim().replace(/["'\`\[\]]/g, '');
      if (name) written.add(name);
    }
  }

  // UPDATE <table> SET a = ?, b = ? ... up to WHERE / end of statement.
  const updates = corpus.matchAll(
    new RegExp(`UPDATE\\s+${table}\\s+SET\\s+([\\s\\S]*?)(?:\\bWHERE\\b|;|\`)`, 'gi')
  );
  for (const m of updates) {
    for (const assign of m[1].split(',')) {
      const name = assign.trim().match(/^([a-zA-Z_][\w]*)\s*=/);
      if (name) written.add(name[1]);
    }
  }

  // ON CONFLICT ... DO UPDATE SET counts too.
  const upserts = corpus.matchAll(
    new RegExp(`INSERT[\\s\\S]{0,400}?INTO\\s+${table}[\\s\\S]*?DO\\s+UPDATE\\s+SET\\s+([\\s\\S]*?)(?:\\bWHERE\\b|;|\`)`, 'gi')
  );
  for (const m of upserts) {
    for (const assign of m[1].split(',')) {
      const name = assign.trim().match(/^([a-zA-Z_][\w]*)\s*=/);
      if (name) written.add(name[1]);
    }
  }

  const allowedCols = new Set(Object.keys(allowlist.columns[table] || {}));
  for (const col of columns) {
    if (IGNORED_COLUMNS.has(col)) continue;
    if (written.has(col)) {
      if (allowedCols.has(col)) {
        staleAllowlist.push(`${table}.${col} - a write path now exists`);
      }
      continue;
    }
    if (allowedCols.has(col)) continue;
    missingColumns.push(`${table}.${col}`);
  }
}

console.log('Write-path audit');
console.log(`  schema: ${relative(ROOT, SCHEMA).replace(/\\/g, '/')}`);
console.log(`  scanned: ${sources.length} source files under server/ (tests excluded)`);
console.log(`  tables: ${Object.keys(tables).length}`);
console.log('');

if (missingTables.length > 0) {
  console.log('  TABLES read-only in source - nothing ever writes them:');
  for (const t of missingTables) console.log(`    ${t}`);
  console.log('');
}
if (missingColumns.length > 0) {
  console.log('  COLUMNS never written by any INSERT or UPDATE:');
  for (const c of missingColumns) console.log(`    ${c}`);
  console.log('');
}
if (staleAllowlist.length > 0) {
  console.log('  STALE ALLOWLIST - delete these entries, the gap is closed:');
  for (const s of staleAllowlist) console.log(`    ${s}`);
  console.log('');
}

const allowedTableCount = Object.keys(allowlist.tables).length;
const allowedColCount = Object.values(allowlist.columns).reduce(
  (n, cols) => n + Object.keys(cols).length,
  0
);
if (allowedTableCount || allowedColCount) {
  console.log(
    `  allowlisted as expected-missing: ${allowedTableCount} tables, ${allowedColCount} columns`
  );
  console.log('');
}

const problems = missingTables.length + missingColumns.length + staleAllowlist.length;
if (problems === 0) {
  console.log('  AUDIT CLEAN');
  process.exit(0);
}
console.log(`  AUDIT FAILED - ${problems} finding(s).`);
console.log('  Either build the write path, or add an entry with a reason to');
console.log('  scripts/write-path-allowlist.json - and delete any entry listed');
console.log('  as stale, since its gap has been closed.');
process.exit(1);
