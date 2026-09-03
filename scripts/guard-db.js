// PreToolUse guard: refuse any destructive operation on the local
// database files (rule 24).
//
// Added after 2026-09-03, when a worker ran `rm -f` on inventory.db,
// inventory.db-wal and inventory.db-shm intending to back them up first.
// The backup `cp` ran *after* the `rm` and carried `2>/dev/null`, so its
// failure was silent and the database was gone with no backup. The
// contents turned out to be test residue, which does not make the action
// safe -- the same sequence against a soft-launched database loses real
// counts.
//
// Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the
// call and returns stderr to the model; exit 0 allows it.
//
// Deliberately narrow: this blocks deletion and truncation, not reads,
// not `sqlite3` queries, not the server opening the file normally.

const DB_NAMES = ['inventory.db', 'inventory.db-wal', 'inventory.db-shm'];

// Destructive shell verbs, checked only when a db filename is also present.
const DESTRUCTIVE = [
  /\brm\b/,
  /\bdel\b/,
  /\bunlink\b/,
  /\bmv\b/,
  /\bmove\b/,
  /\btruncate\b/,
  /Remove-Item/i,
  /Clear-Content/i,
  />\s*[^>]*inventory\.db/, // shell redirection onto the file
];

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function block(reason) {
  process.stderr.write(
    `BLOCKED by scripts/guard-db.js (rule 24).\n\n${reason}\n\n` +
      'Never delete or overwrite server/db/inventory.db or its -wal/-shm\n' +
      'files. If this step needs a clean database, build a scratch one\n' +
      'OUTSIDE the repo from server/db/schema.sql and point at that\n' +
      'instead. If you believe the rule genuinely does not apply here,\n' +
      'stop and ask the architect rather than working around this hook.\n'
  );
  process.exit(2);
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // Never block on a parse failure.
  }

  const tool = payload.tool_name || '';
  const input = payload.tool_input || {};

  if (tool === 'Bash') {
    const cmd = String(input.command || '');
    const touchesDb = DB_NAMES.some((n) => cmd.includes(n));
    if (touchesDb && DESTRUCTIVE.some((re) => re.test(cmd))) {
      block(`This Bash command would delete, move or truncate a database file:\n\n  ${cmd}`);
    }
  }

  if (tool === 'Write' || tool === 'Edit') {
    const p = String(input.file_path || '');
    if (DB_NAMES.some((n) => p.endsWith(n))) {
      block(`This would write directly to a database file:\n\n  ${p}`);
    }
  }

  process.exit(0);
}

main();
