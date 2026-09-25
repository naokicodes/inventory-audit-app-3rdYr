# Testing Plan — DRAFT 2026-09-25

**Status: DRAFT.** Architect capture, not committed until Naoki confirms — mirrors
how `architecture-decisions-DRAFT-2026-09-24.md` is handled. Written so the UI
lane (parallel `public/` work) and the core lane read the same plan.

The two phases were implicit in conversation; this makes them explicit so entry
and exit stop being guesswork.

---

## Two phases

**Phase 1 — Beta (closed).** Naoki + friends, on their own phones (iOS/Android)
and PC, against **sample data**. The goal is to break the main operation and
surface bugs, not to exercise every surface. **Deliberately loose:** no process
enforcement, no ceremony, the database is disposable and resettable. The
"discover by breaking it" phase.

**Phase 2 — Live testing.** Real staff, real stock, real operation. Strict.
Everything Beta was allowed to skip becomes a prerequisite here, because Live
writes data that has to be trusted — and, in one case, cannot be reconstructed
later.

---

## Beta entry requirements

- **Viewport meta on every page — DONE** (ui-viewport, PR #10).
- **Daily-audit mobile layout (Review ⇄ Enter) — in progress, UI lane.** The
  phone is the device testers hold; without it the nightly count pass isn't
  testable on a phone.
- **A resettable beta database seeded with sample data, plus a one-command
  reseed** so a tester who breaks it can reset (see Reseed).

**Not required for Beta (kept loose):** users table / attribution, finalization,
PO screens, sides. Beta is about breaking the daily-audit workflow on a phone,
not about completeness.

---

## The Beta → Live gate (hard requirements before real staff)

Things Beta may run without but Live may not:

- **24b-v landed** — the yield-output kg guard (live data-corruption guard).
- **Identity / attribution in place** — whichever mechanism wins (thin users
  table, or the Phase-1 pick-your-name stub). Live restaurant counts must record
  *who* entered them, and that **cannot be backfilled**: launch without it and
  those counts are permanently anonymous. This is the one gate that is about
  time, not effort — it must be there before the first real count, not after.
- **Clean reseed of the live database** — no test residue mixed with real stock.
- **Month-1 openings declared** — the go-live runbook step.

---

## Reseed

Today there is **no clean reseed**: `server/db/seed.js` is additive (INSERT OR
IGNORE — safe to re-run, but it only tops up, never clears), and the `guard-db`
hook (rule 24) blocks deleting `inventory.db`. So resetting to a known clean
state is not a supported action yet. It is needed for Beta (free resets) and
eventually for the live wipe. **Approach chosen 2026-09-25 (core lane, not yet
built):** a `reseed` command that clears the tables in SQL, then re-runs schema +
migrate + seed (guard-friendly — no file deletion); plus an env-selectable DB
path so Beta runs on a disposable `beta.db`, separate from the live
`inventory.db`.

---

## Target

Testing plan finalized and Beta-ready within ~1 week (≈ **2026-10-02**).

---

## Pointers

Link once from `docs/session-status.md` and `docs/dispatch-queue.md` so this
doesn't drift out of sight. The Beta→Live identity gate is the same decision the
architecture draft (§2, §5) and the queue (25d HOLD) are already circling —
resolve it once, and reference it from all three rather than restating it.
