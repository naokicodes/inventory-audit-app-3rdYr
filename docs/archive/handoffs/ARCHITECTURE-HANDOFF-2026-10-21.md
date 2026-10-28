> **ARCHIVED 2026-10-28 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - Its "Decided, NOT yet recorded" list is recorded: ADR-005 (SPOS), ADR-006 (merge policy), ADR-007 (Beta), ADR-013 (roster storage), ADR-032 (grouped nav).
> - Beta moved to the laptop on 10-24, then back to the restaurant PC, pinned to tags, on 10-28 (ADR-007).
> - The SPOS mail password was rotated (confirmed 10-25); removing it from the code still rides `spos-import`.
> - The counted-meat costing line was generalised for miscut (ADR-018).
> - Agenda: the Beta setup and the docs drop-in landed 10-28.

# Architecture Handoff - 2026-10-21

**Lead, not source.** Checked against `origin/main` at `144c33d` (fresh clone,
`npm run verify`: 483/483, audit clean). Supersedes the 2026-10-20 handoff;
session-status still wins over both.

## State

- `/naoki-qs` is live (v2, `144c33d`). Merged with it today: PR #28
  loyverse-preview-i, Reading B (`4592207`); PR #29 ui-pass / 3x (`e5dc987`).
- Building is handed to Marble (`/naoki-qs` builder runs stop at "Ready to
  merge"). Naoki merges by tapping on GitHub to save usage, so those PRs have
  **no CLOSED line yet** - backfill them.
- Prototype canvas (12 phone screens, sample data, for the Sunday demo):
  https://claude.ai/artifact/DzKMp1RX7fjMfXmPXkp4iK - open with Artifact `read`.
- SPOS still at `5950238`; its Hostinger mail password is still hardcoded at HEAD
  (`backend/routes/purchase_orders.js`, `backend/test_smtp.js`).

## Decided 10-20/21, NOT yet recorded - write these ADRs first

1. **SPOS unfrozen, moves into this repo** (answers ADR-004's open question).
   `git subtree add --prefix=spos` with full history, after Beta, one attended
   PR (`spos-import`): `spos/CLAUDE.md`, mail secrets to `.env`, a guard-db rule
   for SPOS's `schema.sql` DROPs, graphify kept out of `spos/`, `backend/uploads/`
   untracked. Password rotated before the import. One repo, still two apps (D3,
   hybrid A unchanged): a test forbids `require` across `server/`+`public/` and
   `spos/`. Autopilot never touches `spos/`.
2. **`/naoki-qs` merge policy.** Gates replace human code review: fresh-context
   review subagent, CI, verify, and a phone check for `public/`. Only
   `naokicodes` merges; builder runs stop at Ready. Overrides engineer-role's
   "never merge your own PR" for this command only.
3. **Beta.** Testers: Naoki + Likod members (Likod also try the PO flow on the
   prototype). Server: the old restaurant PC, wired to the router, run from its
   own clone pinned to tag `beta-1` (the last phone-checked `main`).
4. **Sunday** shows roster + staff meals exist (prototype); their testing is the
   week after 10-25. **Roadmap order** (roster + meals vs sides/supply) is decided
   after Beta week 1.
5. **Grouped navigation** follows the prototype (Tonight / Supply / Staff /
   Management). Step not written yet; it touches every page, so it goes after 3y.

6. **Roster storage** (ADR-002's open item): a separate staff table, with an
   optional link to a user account for people who are both. `users` stays
   "people who sign in", so 3j/3k run as specced. During testing, every tester
   gets a password-less account and picks their name (3k); cooks who never use
   the app exist only on the staff list. Real auth is added to the same
   accounts before Live data; nothing is thrown away.

## Spec notes to land (architect)

- Counted-meat costing: batch cost = `input_quantity` x unit cost; shrinkage
  pesos = batch x (raw - backed) / raw; backed cost/kg = batch / backed kg. No
  schema change (valuation spec).
- `scope.md` rewrite - deadline is the first sides/supply step, not "after Beta"
  (rules forbid building what scope.md doesn't list).
- `docs/click-through.md`: Chrome runs the checklist, a person checks a real
  phone; record the commit hash.
- From the Silingan Landing photo (10-18): the PO block mixes the commi meat
  request (internal loop) with outside-supplier orders; each sheet adds its own
  lines and the Landing sends one order per supplier (no copying); REM = last
  count, on screen, off the picture; INHOUSE holds staff meals as quantities
  (mostly answers the 10-20 Q1). The photo carries a price - never in the repo.

## Agenda for the next architect chat

1. **Beta runbook, by Sat 10-24.** Separate clone on `beta-1`; start lines with
   `$env:DB_PATH` on the same line; Ethernet IPv4 from `ipconfig`; phones on the
   main Wi-Fi, not guest; firewall Private; never sleep; DHCP reservation;
   resets only by Naoki, announced; per-role test scripts; bug reports in one
   Messenger group, triaged at the end of week 1; pause the autopilot's counting
   hours if it is installed on that PC.
2. **One docs drop-in:** the ADRs above, testing-plan Beta entry,
   `click-through.md`, the costing line, `scope.md`, queue entries (`spos-import`,
   grouped nav), CLOSED backfill, and archive the 10-20 handoff word for word.
3. **Password:** whoever owns the mailbox rotates it now; code removal rides
   `spos-import`.

Still open: operating expenses (Final scope); who maintains the app after the
school project.
