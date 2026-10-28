# ADR-005 SPOS moves into this repo after Beta

- Status: Accepted 2026-10-21
- Decided by: Naoki
- Supersedes: none (answers ADR-004's open question)

## Context

ADR-004 gave Naoki control of SPOS but left open whether the frozen assumption (SPOS at
`5950238`, never changed) still held.

## Decision

- SPOS is **unfrozen**. After Beta it moves into `spos/` with `git subtree add --prefix=spos`,
  keeping its full history, in one attended PR (`spos-import`).
- That PR adds `spos/CLAUDE.md`, moves the mail secrets to `.env`, adds a guard-db rule for
  SPOS's `schema.sql` DROPs, keeps graphify out of `spos/`, and untracks `backend/uploads/`.
- One repo, still two apps (D3 and hybrid A unchanged): a test forbids `require` across
  `server/` + `public/` and `spos/`. The autopilot never touches `spos/`.
- The SPOS mailbox password is rotated before the import (done 2026-10-25).

## Why

One place to work, with history kept. The boundary between the apps is held by a test rather
than by keeping two repos.

## Consequences

- The rotated password stays in the imported history. That is acceptable only because it was
  rotated first: never import a live secret.
- Queue: `spos-import` is listed under Planned.

## Reopen only if

Prince resumes SPOS as a separate product, or the cross-require test cannot hold the boundary.

## Sources

ARCHITECTURE-HANDOFF-2026-10-21 (archived), "Decided" item 1; ADR-004.
