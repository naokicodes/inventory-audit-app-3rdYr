> **ARCHIVED 2026-10-20 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/`. Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - **§4 richer yield model REVERSED on 09-28** (Path 1: output always kg, no output_quantity, miscut as a field, coherence guard). It broke a settled rule; that is the #16 lesson.
> - §2 finalization sharpened on 09-28: Done is mark-and-warn; head-chef acknowledges flags at Close.
> - §2 receipts and 25a quantity-only still stand.

# Architecture Handoff — 2026-09-26

Paste this alongside `architect-notes-PRIVATE.md` at the start of a new architect
conversation. **Where this contradicts earlier handoffs/notes, this wins.**

**Treat as a lead, not a source.** Verified against `origin/main` at `85ac0e8`
by clone + schema inspection (not a full suite run). Clone, run `npm run verify`,
and re-check before building on anything here.

---

## 1. State of main

- **HEAD `85ac0e8`.** Suite reported 402/402 green + audit clean (per the parallel
  sync — confirm with `npm run verify`).
- **Merged since the 09-24 handoff:** 26a-iii (recount overwrites an opening on
  its date, PR #9) and ui-viewport (viewport meta on **all 11 pages**, PR #10).
- **Beta blocker cleared:** pages now render on phones.
- **Still unbuilt:** users/attribution, first-class sheet entity, sides, PO,
  par levels, the richer yield model (§4).
- **`session-status.md` is 1,696 lines** — the archive pass is overdue (clean
  parallel step).

## 2. Decisions closed this session — do not re-litigate

- **Roles (5, confirmed for now):** super-admin, admin, management (read-only),
  head-chef/ops, checker. Checker is differentiated by **site membership, not
  role**. Cashier is NOT an app user (money lives outside the app).
- **Four axes stay separate:** system role (permission) · IRL position
  (attribute) · daily assignment/rota (informational) · official-vs-witness
  (finalization + ack). Kitchen stations (fryer, saute, cold, griller) are not
  app concepts. The scoping dimension is **site**, not "station."
- **Commi-weigh:** falls out of site scoping — **no separate capability** (there's
  an always-on trusted commi; restaurants carry 2 days of stock on his rest day).
- **Auth:** stub login (pick-your-name from active accounts, no password);
  accounts + roles are **admin-managed**; real passwords wait for the recycled
  auth repo (unseen).
- **Authorship: forward-clean** — new writes carry `user_id`; legacy free-text
  drops at the pre-launch wipe. No backfill.
- **Sheets: overlay-not-churn (yes), first-class two-tier entity.** Tier 1 =
  definition (site, category, `engine_type` MEAT|SIDE, active), admin-fed per
  site. Tier 2 = dated instance (site, category, date) with `owner_user_id` +
  `finalization_status` — **lazy-created** (row appears on first touch, no cron).
- **Finalization: two-step.** Owner (assigned cook) marks **Done**; head-chef/admin
  **Closes** (reopen logged, soft). State model: **Not started → In progress →
  Done → Closed.**
- **Categories:** **Landing** (= "Core"; the one restaurant meat sheet, real-world
  "Landing Sheet") · **Commi** · **Sides** (Veggies, Pantry, Pizza, Bar, Scullery
  — Scullery FC-only). Category set is **admin config, per-site**.
- **Sides engine: minimal** — ending + new stock → usage (prior ending vs today's
  ending). **Never routes through `auditEngine`.** Track "received" so usage/
  consumption is real; the paper's waste/inhouse/cooked columns are an optional
  richer layer later. The stored daily-ending series **is** the analytics feed
  management wants (usage trends, wastage, budget).
- **Running-low:** admin sets a per-item **par**; two toggleable modes —
  **PERCENT** (flag when ending < X% of par) and **ABSOLUTE** (flag when ending
  ≤ N). Feeds shorts → PO.
- **Receipts: two distinct shapes** — supplier intake (external, authoritative)
  and endorsement (internal ack of a `commissary_shipment`). **Commi is the
  source of truth for meat** (weighs no-ice + photo); the restaurant only
  acknowledges; the money receipt is the cashier's, outside this app.
- **25a: quantity-only** commissary receipts. Intake weigh-in stays **cancelled**
  (draft §8) — kg is measured at production (`raw_weight_in`), not at rest.
- **PO: Option B (two models)** — internal request (restaurant → commissary; loops
  back as a `commissary_shipment`) and supplier order (terminal). Carry an
  explicit `commissary_id` target. Populate from running-low shorts,
  **auto-suggested and editable**.
- **Multi-commi is already modeled** (`commissaries` table + `commissary_id`
  scoping). A future Davao commi extends it — not a rebuild.
- **Definition-of-done stays directional** (alpha): replace paper with phones,
  assist not replace, give management visibility into wastage/shrinkage/cost.
  No big overhauls.

## 3. Beta lane — dispatch-ready (lift into `dispatch-queue.md` / `session-status.md`)

Beta entry per `docs/testing-plan.md` needs exactly these two. Neither needs any
Live-gating decision.

**Step: `daily-audit-mobile` (UI lane).**
Two views over one fetch — a **Review** card view (display columns muted,
ending-actual the only accented input, variance the only colored chip) and an
**Enter** single-column count list. Same save contract; presentation-only. Must
carry the 26a tags — `(carried)`, `(N days)`, recount difference — and the
blocked "needs month opening" state. Dish rows need **two** inputs (prepped +
portion actual). Build so the later per-sheet "who counted" field (one
sheet-level field, not per-row) slots in without rework. On a phone the card
choice collapses to just the Review⇄Enter toggle (no desktop dock, no new
recount affordance — the month-opening panel already handles recount).
`Touches:` public/daily-audit.html (+ public/style.css). Public step →
requires a live click-through comment before merge.

**Step: `reseed-beta-db` (infra).**
A `reseed` command = clear the tables in SQL, then re-run schema + migrate +
seed (today's `seed.js` is additive INSERT-OR-IGNORE, so there is no clean
reset). Plus an env-selectable DB path so Beta runs on a disposable `beta.db`
separate from the live `inventory.db`.
`Touches:` server/db/seed.js (or a new reseed script), server/db/connection.js
(env DB path), package.json (script). Solo — it's a DB-path/migration change.

## 4. Commissary yield model — NEXT ARCHITECT CONVERSATION (the richer model)

Naoki chose to build the full model now so every commi yield combination is
covered once — a solid core that heads off future problems. **This is the topic
of the fresh commi conversation.** Everything he explained is captured here so it
need not be repeated.

**Current schema (`commissary_yield_log`):** input meat, output meat (NULL = same
as input), `input_quantity` (input's own count, nullable), `raw_weight_in` (kg,
required), `backed_weight_out` (kg, required). **No output-count field. No miscut
field.** So today the output is measured **only in kg**, and "miscut" is just the
implicit `raw_weight_in − backed_weight_out` gap (loss and reusable trim mixed
together).

**The richer model to build — all combinations a commi can yield:**
- **unit → unit:** (unit in, **unit processed** [output count], kg in, kg miscut)
- **unit → kg:** (unit in, **kg processed** [output weight], kg in, kg miscut)
- …and the kg-input variants, for completeness (all combinations).
- Add: an **output quantity in the output's own unit** (so a counted output is
  first-class, not forced to kg), and **miscut as a first-class weight** —
  wasted-but-reusable trim (e.g. allocatable to staff meals), wired into the
  allocation system rather than left implicit in the gap.

**This redefines 24b-v.** It is no longer "the output must be kg-tracked."
Because a counted output is now legitimate, the guard becomes: **the weight flow
must close** — `raw_weight_in` = `backed_weight_out` (or output-weight) + miscut +
true loss, with dimensions consistent. Enforcement is a **hard block** for
genuinely incoherent configs (a yield set up so the numbers can't close), per the
commi principle below. It does not babysit ordinary inputs.

**Governing principle (Naoki):** the commi is *stricter* (everything logical) yet
*flexible* — small and even medium mistakes are fixable upfront by the people, no
app hand-holding. The app is a tool for assistance, so it blocks only what would
silently corrupt (config-level dimension breaks), never normal correction.

**Open sub-questions for that convo:** exact column additions (output_quantity,
miscut_weight); how miscut links to allocations/adjustment types; whether the
guard audits existing rows (Naoki: no audits that break things — question him
with concrete use-cases, he'll pick from options); the precise "weight flow
closes" rule per combination.

## 5. Open / carried forward

- **The richer yield model (§4)** — the fresh commi convo.
- **Drift reconciliation (§6)** — before any big dispatch.
- **Definition-of-done** — stays directional; Naoki's to firm at beta.
- **Recycled auth repo / custom POS repo** — unseen; POS deferred indefinitely,
  auth read before real passwords.
- **Settings/seed Excel** — Naoki is filling `inventory-app-settings-template.xlsx`
  (off-repo); it feeds the eventual seed.

## 6. Drift to reconcile FIRST

The parallel sync still lists **finalization, tier-2 lazy, and the roles confirm
as open** — this session **closed** all three (§2). Land those closures in
`session-status.md` before the big planning dispatches anything, or the two
chats plan against different designs.

## 7. Doc-update actions (when the above firms)

`scope.md` (multi-user, partly done) · `tech-stack.md` (auth) · point the
`rules-for-claude-code.md` roles guard (line ~458) at *this* design, not the
2026-09-15 one · move `architect-notes-PRIVATE.md` and the dispatcher handoff
into the repo · `ui-conventions.md` becomes writable once the new pages (login,
roles admin, PO-request, acknowledgment, sides) are known · archive
`session-status.md`.

## 8. How to open the commi conversation without repeating yourself

1. Paste this handoff + `architect-notes-PRIVATE.md`.
2. Say: **architect mode**, topic = **richer commissary yield model (§4)**.
3. Tell it to clone the repo and run `npm run verify` before believing any state.
4. It reads §4 and picks up the unit→unit / unit→kg / miscut model directly —
   you won't need to re-explain any of it.

*Execution boundary: this handoff DEFINES; it does not dispatch. Turning §3 into
queue steps or §4 into a build is the architect's call, step by step.*
