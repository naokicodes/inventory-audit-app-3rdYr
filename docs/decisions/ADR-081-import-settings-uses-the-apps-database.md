# ADR-081 The settings import uses the app's database and says which file

- Status: Accepted 2026-11-15
- Decided by: Naoki
- Supersedes: import-identity's "DB_PATH from the environment, unset = the live inventory.db", for
  the import-settings command only

## Context

On the restaurant PC the app reads `DB_PATH=server/db/beta.db` from `.env` (restaurant-pc.bat
writes it). `npm run import:settings` read DB_PATH from the environment only, so a people import
run without a typed `$env:DB_PATH` line opened, and created, `server/db/inventory.db`: an unused
file on the PC. The login list stayed empty and nothing said why (ARCHITECTURE-HANDOFF-2026-11-14,
beta-2 item 4).

## Decision

- The import-settings command (import and `--export`) takes DB_PATH as the app does: from the
  environment first, else from the repo's `.env`. Only DB_PATH is read from `.env`.
- Before it opens the database it prints the file and where the setting came from.
- It refuses a database file that does not exist, and creates nothing.
- `seed.js --reset` and `seed-test-accounts.js` keep reading the environment only. On the
  restaurant PC `.env` names beta.db, which is never reseeded and never gets test accounts
  (ADR-039); their guards rely on DB_PATH being typed.

## Why

An import must land where the app reads, and a wrong path should be loud, not a quiet new file.

## Consequences

Step import-settings-env (server only). beta-2 is tagged before it, so the beta-2 people import on
the PC still sets `$env:DB_PATH="server/db/beta.db"` first; from beta-3 it is not needed.

## Reopen only if

The import moves into the app (an upload in Settings), or the PC stops keeping its settings in
`.env`.

## Sources

ARCHITECTURE-HANDOFF-2026-11-14 (archived), beta-2 item 4; architect chat 2026-11-15 (A0, "recs").
