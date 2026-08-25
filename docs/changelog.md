# Changelog / Development Notices

A running, dated log of real fixes, decisions, and environment quirks hit
during development — so they don't have to get rediscovered later, and so
anyone picking this project up (including future-you) has context on *why*
something is built the way it is, not just *what* it does.

Newest entries at the top. Small/routine commits don't need an entry here —
this is for things that took real debugging, changed a decision, or are
worth remembering if they happen again.

---

## 2026-08-25 — Windows: SQLite test file wouldn't delete (EBUSY)
**Symptom**: `auditEngine.test.js` passed all 7 tests, then crashed during
its own cleanup step with `EBUSY: resource busy or locked, unlink ...test.db`.

**Cause**: Windows keeps a file lock on an open SQLite database until the
connection is explicitly closed. Linux (used during initial development/
testing) releases the lock automatically at process exit, so this didn't
surface until testing on the real Windows machine.

**Fix**: added `db.close()` before attempting to delete the test database
file, wrapped in try/catch as a safety net for edge cases (antivirus/
indexing software briefly holding a file lock on some machines).

**Lesson**: always explicitly close database connections before deleting
their files — don't rely on process exit to release locks, especially
since this project's target machine is Windows.

---

## 2026-08-25 — node:test + node:sqlite don't play well together
**Symptom**: Audit engine tests failed with `attempt to write a readonly
database` partway through a `node --test` run — but the exact same code,
run as a plain script (no test framework), worked perfectly.

**Cause**: both `node:test` (Node's built-in test runner) and `node:sqlite`
are still experimental/newer Node features. Something about how the test
runner isolates/re-enters test blocks conflicts with an open SQLite
connection across those boundaries. Confirmed via isolated repro that the
writes themselves are correct — this is a framework interaction issue, not
an app bug.

**Fix**: switched to plain test scripts (`node server/engines/whatever.test.js`)
instead of `node --test`. Same rigor (real assertions, real pass/fail, real
exit codes) without the framework conflict.

**Lesson**: when combining multiple still-experimental Node features, test
early and don't assume a "should work" combination actually does.

---

## 2026-08-25 — Switched from better-sqlite3 to Node's built-in node:sqlite
**Symptom**: `npm install` failed on Windows with a long `node-gyp` error
ending in "You need to install the latest version of Visual Studio...
including the Desktop development with C++ workload."

**Cause**: `better-sqlite3` is a native module — part of it is C++ code that
needs to be compiled during install. That requires a C++ compiler
(Visual Studio Build Tools on Windows), which isn't installed by default
and is a multi-GB download just for this one dependency.

**Fix**: switched to Node's built-in `node:sqlite` module (`DatabaseSync`),
available without any install since Node 22.13+. Zero compilation, zero
extra setup. Confirmed `docs/tech-stack.md` updated to match.

**Trade-off accepted**: `node:sqlite` is still marked experimental/
release-candidate by Node as of this writing (prints a harmless
`ExperimentalWarning` on every run — expected, not a bug). Acceptable for
a small local single-user tool; revisit only if it causes a real problem.

---

## Known, harmless, recurring notices (not worth re-investigating each time)
These show up regularly and are expected — listed here so they're not
mistaken for new problems:

- **`warning: ... LF will be replaced by CRLF ...`** on `git add` — Windows/
  Git line-ending normalization. Cosmetic, not an error.
- **`(node:####) ExperimentalWarning: SQLite is an experimental feature...`**
  on every `npm run dev` / test run — expected, see the entry above.
- **PowerShell quoting for inline `node -e "..."` commands** is fragile with
  nested quotes — prefer a real `.js` file over inline one-liners when the
  command has any quotes inside it.
- **`git status` showing "upstream is gone"`** right after cloning a fresh
  empty repo — resolves itself after the first `git push`, not an error.
