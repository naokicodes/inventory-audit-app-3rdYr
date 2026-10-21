> **ARCHIVED 2026-10-20 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/`. Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - **§4 "DB target becomes MySQL on the merge" is dead** (10-05: hybrid A, this app is the core app).
> - Supplier POs and the cost-price owner were resolved on 10-19 (supplier orders and bills are ours).
> - §2 Path 1 yield and three-stage staging still stand.

# Architecture Handoff — 2026-09-28

Paste this alongside `architect-notes-PRIVATE.md` at the start of a new architect
conversation. **Where this contradicts earlier handoffs/notes, this wins.**

**Treat as a lead, not a source.** Verified against `origin/main` at `7d7e14e` by
clone + inspection. Clone, run `npm run verify`, and re-check before building.

## 1. State of main
- HEAD `7d7e14e`. Suite green (18 files, 443/443 as of PR #21), AUDIT CLEAN.
- **Merged this stretch:** 24d-i (kg-output guard + miscut + coherence, PR #20),
  24d-ii (surface miscut/residualLoss on reads, PR #21), nav-mobile (#17),
  archive-pass-2 (#18); plus the earlier beta steps (#14/#15).
- **Runnable now:** `24d-iii` (the commi miscut UI — PUBLIC, needs a click-through)
  and `users-roles`. (The 3e/3f tags were stamped 2026-09-28: 3e CLOSED via #21,
  3f runnable.)
- **Queued, blocked-chained (multi-user, de-risked by a verification pass):**
  user-sites -> import-identity -> stub-login -> user-id-authorship -> site-filter.

## 2. Decisions closed — do not re-litigate (all in session-status.md "Things NOT to re-litigate")
- **Yield -> Path 1 (#16).** Commi yield output is ALWAYS kg. 24d-i builds the
  kg-output guard (reject a unit-tracked effective output) + miscut_weight
  (analytics only, not subtracted from loss%) + coherence guard (backed+miscut<=raw).
  Ledger (getCommissaryBackedUp) UNCHANGED. 24b-v stands, built by 24d-i. No
  output_quantity. miscut must be >= 0 and finite.
- **Staging + restaurant conversion = 3 stages (corrected #16-class error):**
  (1) commi processing (yield, kg out) -> (2) commi staging/packing: commi meat ->
  ready-to-ship RESTAURANT meat via commissary_meat_map (a MAP, no ratio), staged at
  the commi, released by a shipment (staged->released) -> (3) restaurant conversion
  (OPTIONAL, on the spot): ratio standard, variance->shrinkage. The ratio-conversion
  is the RESTAURANT's, not the commi's.
- **Finalization (Q1):** two-step (owner Done -> head-chef Closes, soft). Done is
  mark-and-warn (incomplete rows flagged, never blocked); head-chef ACKNOWLEDGES the
  flags at Close.
- **Q2-Q6 + round-2 S/A/B/C/D + D3** (full detail in session-status): site keying =
  site_code text via siteAccess.js everywhere; sheets tier-1 first / auto in-progress
  / commi finalizes / category free-text per site; sides = one catalog + per-site
  availability, one SIDE sheet per category, simple prior-ending usage (no 26a carry,
  ~1/30 skew accepted); PO = internal-request-first (own record + request_id on the
  fulfilling shipment) + ack field, status requested->fulfilled->acknowledged->cancelled;
  staging = extend commissary_shipments with staged->released + weight/photo/ack;
  conversion standards = drop single-ratio UNIQUE + per-standard label + is_costing_default
  + log-time dropdown/override, log stores standard_id + actual ratio; import reader =
  CSV zero-dep + an export mode (round-trip); #22 = seed bootstrap super-admin
  "superadmin", import reconciles by role.

## 3. What's NEXT — the slicing (the fresh convo's first work)
All decided; turn each family into dispatchable slices, in order:
1. **Sheets — tier-1 sheet_definitions** (foundation; sides/finalization/PO sit on it).
2. **Sides** (side_items catalog + per-site availability + minimal usage engine).
3. **PO Option-B loop** (internal_requests + shipment.request_id + ack).
4. **Staging Stage-2/3** (extend shipments staged->released; conversion standards).
5. **import-identity export mode** when that slice is written.
Each is captured as a settled decision + a Planned family in dispatch-queue.md.

## 4. POS / MySQL target (Q5 concretized)
Integration target = **SPOS** (github.com/princeravenver01/SPOS): Node/Express +
**MySQL** (InnoDB), two apps (admin + pos), own access_roles, a PO concept. The POS
is the source of truth for MONEY/SALES — our app hands info OUT and pulls SALES IN.
**DB target becomes MySQL on the merge** (why the users/roles/importer specs carry a
portability bias). Sales: Loyverse on `main` now; a BRANCH completes the SPOS
integration; switch main HEAD when SPOS deploys. Do NOT migrate main to MySQL yet.

## 5. How to resume
1. Paste this + `architect-notes-PRIVATE.md`. Say: **architect mode**.
2. Clone the repo; `npm run verify` before believing any state.
3. First work: spec **sheets tier-1** as a drop-in slice (or the family you pick).
4. Workflow unchanged: architect DEFINES (drop-in doc edits, guarded with
   assert count==1); Marble builds via /start; PRs reviewed via /review; every
   decision lands in session-status.md.

## 6. Housekeeping owed
- The Planned "multi-user surface" section predates the detailed specs — reconcile
  when slicing.
- session-status.md will want another archive pass as it grows.
- Definition-of-done stays directional, firmed at beta.
