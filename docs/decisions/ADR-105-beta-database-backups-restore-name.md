# ADR-105 Beta's database: one-file backups, a restore, a copy off the PC, its name

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: ADR-007 in part (its Backups line)

## Context

Fable F4 (P0): a backup is the `.db` plus its `-wal`; restoring the `.db` alone loses saves or, next
to a newer `-wal`, corrupts the database. Backups sit on the same disk, are made only at Start, and
there is no restore. Run 4 also asked where an off-PC copy goes (D1) and whether Live keeps the name
beta.db (D8); PERM-18 showed `npm run reseed` suggests beta.db as its example.

## Decision

- Each backup is one self-contained file (SQLite's VACUUM INTO), safe to take while phones save.
  Kept by age (every backup of the last 14 days, plus one a month), not "the newest 14".
- The launcher has a `restore` word: it lists the backups, refuses while the app runs, moves the
  current files aside (never deletes them) and copies the chosen backup in.
- An optional "copy backups to" folder in `.env`: the launcher copies each finished backup there,
  never the live database. During Beta it is a folder in Naoki's Google Drive shared with the
  management, set once Google Drive for desktop is on the restaurant PC. Hosting comes later (the
  SPOS developer's Hostinger), when the app is far enough along.
- The live database keeps the name beta.db, through Live.
- `npm run reseed` refuses beta.db, however the path is written.

## Why

A backup nobody can restore is not a backup, and the admin does not code (ADR-097).

## Consequences

Steps backup-restore (the backup, restore and copy), db-start (the reseed guard) and
restaurant-pc-ii.

## Reopen only if

The app moves to hosting (the host's backups then replace these).

## Sources

docs/reviews/fable-2026-11-17-4-scale.md (F4, D1, D8); -1-permissions.md (PERM-18);
-5-pages-updates.md (B1 note 2); architect chat 2026-11-17 (answers 5, 6, 10).
