> **ARCHIVED 2026-10-20 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/`. Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - §2 core-app line landed in session-status ("Core app + integration shape").
> - "Open for Prince" items on supplier POs and the cost-price owner were resolved on 10-19; the quantities endpoint was replaced by a column-limited read-only MySQL user.
> - Roadmap amended 10-19: UI pass before finishing the core; Beta 2026-10-26.
> - Queue state is stale (users-roles closed 10-13, 24d-iii closed).

# Architecture Handoff — 2026-10-05

Paste this alongside `architect-notes-PRIVATE.md` at the start of a new architect
conversation. **Where this contradicts earlier handoffs or the notes file, this wins.**
It supersedes ARCHITECTURE-HANDOFF-2026-09-28 and the "two deltas" opening message of
2026-10-04 (both folded in below).

**Treat as a lead, not a source.** Verified against `origin/main` at `1f62de5` by a fresh
clone + `npm run verify`. Clone, verify, and re-check before building on anything here.

---

## 0. Opening message to paste into the fresh conversation

> Architect mode. This continues the inventory-audit-app project. The attached
> ARCHITECTURE-HANDOFF-2026-10-05 and architect-notes-PRIVATE are leads, not sources.
> Clone github.com/naokicodes/inventory-audit-app-3rdYr, run `npm run verify`, skim
> docs/session-status.md ("Things NOT to re-litigate"), docs/dispatch-queue.md and
> docs/autopilot-guide.md, then tell me where things actually stand. Agenda: C (land the
> core-app line, §2), then A (slice the Planned families starting at queue id 3u, §5).
> B (SPOS/API planning) stays parked. Working style: architect DEFINES drop-in edits
> guarded with assert count==1; every decision lands in session-status.md; verify every
> new spec against "Things NOT to re-litigate" (the #16 lesson); options as problem /
> choices / example / suggestion and I pick; hand me downloadable files + the git
> commands, one command per line (PowerShell 5.1).

---

## 1. State of main (verified 2026-10-05)

- **HEAD `1f62de5`** — "docs: SPOS hybrid-A decisions + queue loyverse-preview-i/ii/iii",
  directly on top of `d6e89c3` (autopilot plan, 2026-10-04). Suite **18 files, 443/443**,
  **AUDIT CLEAN**.
- **Nothing new built since 2026-09-28.** The last two commits are docs plus one data file
  (`server/db/loyverse-name-map.json`).
- **Queue:**
  - Runnable: `24d-iii` (3f), `users-roles` (3h), `autopilot-runner` (3n),
    `architect-docs-pickup` (3o), `loyverse-preview-i` (3r).
  - Blocked: the identity chain 3i–3m; `autopilot-doorbell` / `autopilot-preview` (3p, 3q);
    `loyverse-preview-ii` / `-iii` (3s, 3t, on 3r).
  - Not runnable: 25a (needs the quantity-only rewrite), 25e (after soft launch).
  - **Next free queue id: 3u.**
- **Local noise on Naoki's PC:** `graphify-out/` is tracked in the repo and a graphify git
  hook rewrites it on commit, so it shows as modified/untracked after most commits. It is
  not part of any step. Never sweep it into a step PR with `git add .`; decide separately
  whether to gitignore it or commit it deliberately.

## 2. The core-app decision (Naoki, 2026-10-05) — NOT yet in session-status

- **This web app is the core app.** SPOS is integrated onto our web app **gradually, our
  own way** — the usual architect → slice → build → review flow, at our pace. **Prince
  agreed.**
- The technical shape stays **hybrid A** (already recorded in session-status by
  `1f62de5`): inventory on SQLite, SPOS on MySQL, connected by API; only sales quantities
  cross. The 2026-09-28 "DB target becomes MySQL" line is dead and marked superseded.
- **First job of the next conversation (new agenda C):** land this core-app line in
  session-status, extending the "SPOS integration - settled 2026-10-03" entry.
- **Open — ask Naoki before any SPOS slice (SPOS work is parked anyway):** does
  "integrate SPOS onto our webapp" stop at pulling sales quantities via the API, or will
  some of SPOS's own screens/data eventually live in this app? If the latter, the settled
  "no revenue in the inventory DB / quantities only" boundary must be revisited on
  purpose, not drift.

## 3. Decisions landed by `1f62de5` — do not re-litigate

Full text in session-status ("SPOS integration - settled 2026-10-03"). In short:

- **Domain split:** Prince (SPOS) = finance and service; this app = inventory, and its
  logic is the inventory core. Our position (Prince to confirm): SPOS's own inventory
  screens are retired at these sites.
- **Hybrid A**, **only quantities cross**, **SPOS = a second sales source** through the
  same intake as Loyverse with OUR business-date rules, **logic stays on the server**,
  **phones use the web app** (native apps later, if at all).
- **Recyclable-logic rule for new work:** business rules go in engine modules, not routes
  or pages.
- **Likod** is Silingan's backyard restaurant: Likod customers can order the Silingan
  menu, cooked in Silingan's kitchen and served in the back, so Likod's sales of
  Silingan-menu dishes count toward Silingan's kitchen usage. Likod's own menu: open.
- **Loyverse preview first (1b + 2a):** a read-only preview engine + Kitchen Sales page
  (Dish | Likod | Silingan | Total), built as the real port's dry run; writes nothing.
  The real port later adds the write into `sales`, a Sync button and the nightly run on
  the SAME module.
- **Our own curated name map, confirmed:** `server/db/loyverse-name-map.json` (39 dishes,
  both accounts, account-keyed, no tokens). The engines only ever see dish codes. The
  09-15 "map by explicit product_id, never by name" rule governs the sync step that
  WRITES `sales`; before the real port writes, decide its key (the curated name map or
  Loyverse `item_id` / `variant_id`) using the evidence the preview reports.
- **Refunds:** Loyverse REFUND receipts carry positive amounts and the old Apps Script
  doesn't check receipt type, so it likely counted refunds as sales. The preview keeps
  the script's numbers and reports refund counts; the real port decides.
- **Wildcard catches** are checked from a terminal command (3t), not the daily UI.
- **Env:** tokens live in `.env` (gitignored), loaded by `server/index.js` via
  `process.loadEnvFile()` so every start path works (including the autopilot's plain
  `node server/index.js`). Autopilot previews have no `.env` — the page's
  "token not set" banner is part of that click-through.
- **Housekeeping done:** stub-login / site-filter `Touches:` fixed from the non-existent
  `server/app.js` to `server/index.js`; the stale "7. Nothing - do not invent a step 25"
  stop retired; the "MySQL migration parked" note updated.

## 4. Autopilot (settled 2026-10-04, from `d6e89c3`)

- The dispatcher role is replaced by an unattended runner on the server PC
  (phone-triggered, scheduled), specced as steps 3n–3q + `docs/autopilot-guide.md`.
  **Not active until the server install** — the interactive `/start` flow still works.
- The runner's `architect-docs` issue pickup applies edits under **`docs/` only**. A drop-in
  that also touches another path (like the name map did) is a direct push by Naoki.

## 5. Agenda for the next conversation

- **C (new):** land the §2 core-app line in session-status.
- **A:** slice the Planned families into dispatchable steps **starting at 3u**, in order:
  sheets tier-1 (`sheet_definitions`) → sides → PO Option-B loop → staging Stage-2/3 →
  settings export. All decided; full decisions in session-status (Q2–Q6, round-2
  S/A/B/C/D, D3).
- **Also to place (proposed, not decided):** the real Loyverse port (write into `sales`,
  Sync button, nightly run on the preview's module). Suggested slot: right after the
  identity chain, ahead of sides and PO, because sales drive usage on every Landing
  Sheet. Naoki decides.
- **B:** SPOS/API integration planning — parked unless Naoki says so.

## 6. Open items carried forward

- **Intake rule drift:** session-status still lists the 2026-09-02 rule "every intake
  records both a count and a weight"; the 2026-09-24 weigh-in cancellation supersedes it.
  Naoki was asked to confirm (in the meeting doc); unanswered. Land a superseded marker
  once confirmed.
- **UNCERTAIN name-map rows** — D013, D014, D015, D024, D025, D037 (the weight-variant
  wildcards). Check them with 3t's report once 3r lands, before anything feeds an audit.
- **Open for Prince** (listed in session-status): identity link, SPOS server-side auth,
  product↔dish map, branch↔site, cost-price owner, supplier POs, combined analytics, and
  the SPOS asks (void instead of hard-delete, item-level refunds, modifiers on order
  lines, `paid_at`, a quantities endpoint).
- `data-model.md` §10 is stale (schema.sql is the source of truth); the definition of done
  stays directional until beta.
- **Meeting doc** ("Inventory Audit App — How It Works, Schema & Roadmap", shared as a
  Google Doc) reflects hybrid A but not the autopilot or the core-app line. It lives
  outside the repo; session-status is the record.

## 7. Lessons from this stretch

- **Rebase drop-ins on current main before pushing.** A week-old drop-in collided with
  the autopilot commit on queue ids (3n–3q) and on both insertion anchors. The
  `count == 1` guards refused instead of corrupting; the fix was to regenerate on a fresh
  clone of the new HEAD, dry-run it, and re-verify. Always check the next free queue id.
- **Cross-check specs against settled decisions, not just the code** — it caught the
  "never by name" conflict before dispatch (the #16 lesson, again).
- **PowerShell:** one command per line. A pasted block keeps running after a failed `cd`,
  and running commands together on one line breaks them.

## 8. How to resume

1. Paste §0's opening message + this file + `architect-notes-PRIVATE.md`.
2. Clone; `npm run verify` before believing any state.
3. Do C, then A from 3u.

*Execution boundary: this handoff DEFINES; it does not dispatch. Turning anything here
into queue steps is the architect's call, step by step.*
