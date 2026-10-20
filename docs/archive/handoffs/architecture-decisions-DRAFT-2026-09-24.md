> **ARCHIVED 2026-10-20 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/`. Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - The §9 open questions were closed on 09-26 and 09-28 (roles confirmed, two-step finalization, lazy tier-2, overlay).
> - "Cashier is NOT an inventory-app user" and "the money receipt is outside this app" gained one exception on 10-19: the Bills page behind a bills-only role.
> - §8 (intake weigh-in cancelled) still stands.

# Architecture Decisions — DRAFT 2026-09-24

**Status: DRAFT. Defined, not dispatched.** This is an architect capture from an
ARCHITECT-MODE conversation. Nothing here is a queue step yet — turning any of it
into `session-status.md` entries or Marble dispatch is Naoki's call, step by
step. Written to be edited and committed by Naoki, not pasted blind.

**Verified against** `origin/main` at `c8fb7e0` (the 26a merge, PR #7) on
2026-09-24 by clone + schema/workbook inspection. `main` had moved past the
2026-09-15 handoff's `3485782` — re-verify before building.

**Supersedes on overlap:** the queue/scope assumptions in
`architect-notes-PRIVATE.md` and the 2026-09-15 handoff where this contradicts
them. Where not contradicted, those still stand.

---

## 1. Product direction (the alpha north star)

Stage is **alpha**: engines are mature (325 tests), but the product — multi-user,
roles, mobile, the new surfaces — is early. The definition-of-done stays
*directional*, firmed at beta. The direction, which is the floor that keeps
"vague" from becoming "unbounded":

> Replace paper with phones. Assist the existing process, don't replace it. Give
> management clearer visibility into wastage, shrinkage, and cost so they can act
> on it.

A full written definition-of-done is still **Naoki's to draft** — it remains the
single biggest carried risk.

---

## 2. Roles & identity

**The four axes (do not collapse into one "role").** The keystone untangle:

- **System role** — what the app *permits*. Few, configurable. The only real
  "permission."
- **IRL position** (head chef, commi, podium, line cook…) — a descriptive
  *attribute* on the user. Can set a default role; is NOT the permission.
- **Daily assignment** (the rota) — who owns which sheet today. Real data;
  informational for now; may drive scoping/official-checker later.
- **Official vs witness** — official checker = sheet owner + whoever may close;
  witness = a coworker's non-binding acknowledgment tick. Different records, not
  roles.

Kitchen stations (fryer, saute, cold, griller) are IRL work areas — **not app
concepts**.

**System role set (5), pending Naoki's final confirm:**

- `super-admin` — Naoki. One, seeded in migration, cannot be locked out.
- `admin` — configures menus, recipes, prices, par levels, roles, sheet
  definitions. Has finalize capability but stays hands-off operationally.
- `management` (read-only) — owner / floor supervisor: sees wastage, shrinkage,
  cost valuation. No writes. This is the "stock as cash" view.
- `head-chef / ops` — finalize (close/reopen) his own kitchen. His job regardless
  of who's above.
- `checker` — enters counts, acknowledges arrivals, requests POs. Differentiated
  by **site membership, not role**. A commi-site checker weighs meat because
  commi-site receipts have the weigh field; a restaurant-site checker
  acknowledges. (Provisional: this falls out of site scoping, no separate
  capability. Revisit.)

**Cashier is NOT an inventory-app user** — money lives outside this app.

**Three separate facts (the scoping model):**

- **Membership** (`user_sites`) — which sites a user belongs to. Per-(user,site);
  each restaurant has its own roster. Answers "can I see this sheet?" Floaters
  belong to several; access = union. Admin-configured.
- **Role** — the permission set. Answers "can I do X here?"
- **Assignment** (per date) — the rota owner of a sheet. Answers "am I the owner
  today?" Drives concurrency and official-checker.

**Enforcement:** the site filter lives at the **query/middleware layer** so it
applies to every read automatically and can't be forgotten. Management / admin /
super-admin bypass it (see all); a checker is filtered to their memberships
("Silingan checker can't see Likod"). Never a hand-written per-query `WHERE`.

**Finalization:** owner (assigned cook) *enters* counts; head-chef *closes*.
Soft close (mark-and-warn, reopening logged), never a hard lock — fits the
correct-forward habit and 3am reality. First-time data entry is not logged;
changing something already stored is.

**Auth split:** identity + authorization now; passwords later. Phase 1 = stub
login (pick your name from a list, no password). The stable system role is
admin-assigned and enforced live server-side (Discord-style for the
*authorization* half only). The rota is the thing Discord lacks; it stays
informational data with a copy-to-FB button.

---

## 3. Sheets model

**Scoping is (site × category), not flat site.** A restaurant has multiple
sheets; the commissary has its own.

**Categories:**

- **Landing** — the one restaurant meat sheet. Real-world name "Landing Sheet"
  (meat that landed). The app's daily-audit *is* this. ("Core" = Landing; same
  thing.) MEAT engine.
- **Commi** — the commissary's own Landing-style meat audit. MEAT engine.
  (Schema already stubs "Commissary's own Landing-style audit tables — no
  engine/routes/UI yet.")
- **Sides** — Veggies, Pantry, Pizza, Bar, Scullery (Scullery separate only at
  FC). SIDE engine (simple counting). **Not built** — no schema, pages, or
  workbook tabs yet.

The category set is **admin config, per-site** — everything the webapp uses,
admins feed in (that's how Scullery-only-at-FC works).

**First-class sheet entity — two tiers (leaning yes to building it):**

- **Tier 1 — definition (config):** `site_id`, `category`, `engine_type`
  (`MEAT` | `SIDE`), active flag. Admin-fed. The §3.2 guard lives here:
  `engine_type = SIDE` routes through side-counting and NEVER touches
  `auditEngine`; `MEAT` routes through the audit/yield engine.
- **Tier 2 — instance (dated occurrence):** the (site, category, date) row that
  gets owned and closed. `owner_user_id`, `finalization_status`
  (open/finalized/reopened), `finalized_by`, `finalized_at`. POs/shorts
  reference this.

**Design principle — thin overlay, not churn.** The engine tables already key
off (site + date). Tier 2 is a small status/ownership row keyed by
(site, category, date) that sits *over* them — the tested engines stay
untouched (protects the 325-test asset). Leaning **lazy creation** (row appears
when someone first touches the sheet that day; no cron making empty rows).

---

## 4. Receipts, endorsement & POs

**Commissary is the source of truth for meat.** The commi weighs (no ice,
packaging only) + photographs at intake — that's the authoritative record, on
the commissary side (currently `commissary_shipments`/receipts carry no weight,
photo, or status — additive build). The **restaurant only acknowledges** the
endorsement (non-binding). The **money receipt is the cashier's**, in her own
log, **outside this app** (no revenue is stored here).

**Non-meat / podium** is lighter: a **count-only arrival log**, no weigh/photo
authority. The app shows the PO list as a convenience they don't have today, and
allows an **off-list addition** (tagged) for things that arrived unplanned.

**Intake weigh-in: DROPPED.** See §8.

**PO model — Option B (two models):**

- **Internal request** (restaurant → commissary): every meat goes through commi
  first, so kitchens request processed meat, never raws. This **loops back into
  the app** — a request becomes a `commissary_shipment` the commi fulfils, which
  the restaurant then acknowledges.
- **Supplier order** (commissary → supplier for raw meat; podium → supplier for
  non-meat): terminal, leaves the system.

Reason for two, not one typed table: the **lifecycles diverge** (loop vs
terminal), not the topology — one commi serving three restaurants is just fan-in,
which a single table handles fine. Carry an **explicit `commissary_id` target**
on internal requests (multi-commi is coming — see §7). Populate PO from the
sheet's running-low shorts, **auto-suggested and editable**. Par levels live in
settings; running-low watches the ending count (real or calculated).

**Two different "acks":** restaurant→commi arrival acknowledgment = **core**
(keep); multi-coworker witness/vouch ledger = **defer**.

**Catch-up:** late/forgotten items are added to *today's* sheet tagged
`catch-up`, never by reopening yesterday — the correct-forward habit.

---

## 5. Authorship & data

**Forward-clean (locked).** New writes carry a `user_id` (points at the thin
users table); legacy free-text `created_by` disappears at the pre-launch wipe.
No backfill — current data is all test residue. `created_by` = the logged-in
session user; resolved entirely by the users table (§2), so build that first.

---

## 6. UI

- **Plain CSS only.** One dependency (express), no build step. No Tailwind /
  PostCSS / bundler — that'd be the first build tooling and cuts against the
  no-build, single-machine design.
- **Beta-enabling UI is bounded and safe now** (Phase-0 prerequisite): viewport
  meta on all 11 pages (currently missing → pages render desktop-width and zoom
  out on phones) + the daily-audit mobile layout. Runs as labeled issues in
  parallel; can't regress engines.
- **Daily-audit mobile = two views over one fetch** (anti-drift): a **Review**
  card view (display columns muted, ending-actual the only accented input,
  variance the only colored chip) and an **Enter** single-column count list. Same
  save contract; presentation-only. Dish rows need **two** inputs (prepped +
  portion actual), not one. Side sheets get an even simpler variant (no
  calc-ending, no variance).
- **`ui-conventions.md`** (tokens + card/list patterns) should be written once
  the new pages are known (login, roles admin, PO-request, acknowledgment,
  sides) — it rides in on the doc-update wave.

---

## 7. Sequencing & dependencies

- **Users table early.** The expensive thing isn't the table, it's bolting
  identity on at the end after `Unknown` is cemented. Authorship (§5) depends on
  it, so it goes first/alongside — never after. Gate: confirm the role set and
  the site list.
- **Multi-commi is already modeled.** Schema has a `commissaries` table and
  `commissary_id` scoping (`UNIQUE(commissary_id, code)`); commi-to-commi
  movement is a designed allocation. A future Davao commi *extends* this
  dimension — not a rebuild. Design PO/requests with explicit `commissary_id`
  now.
- **Sites live now:** Commissary, Silingan (A), FC (Restaurant B), Likod (C).
  Likod finalizing its unique menu — a good conversion shakedown when its config
  lands.
- **Bottleneck is decisions, not coding time.** The definition-of-done and the
  roles design gate the most. UI runs in parallel because it doesn't consume
  those decisions.

---

## 8. Reversed / cancelled decisions (with why — so they don't get re-added)

- **Intake weigh-in — CANCELLED.** The 2026-09-03 "weigh every unit-tracked meat
  at intake" decision is reversed. Reason: production already records
  `raw_weight_in` (NOT NULL) + `input_quantity` at the yield event, so kg-to-kg
  yield is satisfied where the kg is actually used. Unit-raws need no kg at rest.
  **Consequence:** 25a shrinks to quantity-only commissary receipts.
  **Keep distinct:** we still weigh *at production* (`raw_weight_in`); we do NOT
  introduce "estimate kg from a count" (the separately-rejected idea). Unaffected:
  24b-v (about the *output* meat being kg-tracked) and miscut (a production-time
  gap). *Reopen only if a report ever needs kg of unit-meat at rest.*

---

## 9. Open questions (genuinely undecided)

- **Owner-done vs single close** — does an assigned cook tap an explicit "my
  sheet's done" (giving finished-on-time / disciplinary visibility), or does the
  chef just see which sheets have all counts in? Last open piece of the
  finalization model.
- **Tier-2 instance creation** — lazy (leaning) vs a daily job.
- **Overlay confirmation** — keep engine tables untouched, layer sheet-status
  over them (leaning yes).
- **Final role-set confirm** — Naoki to confirm the five; and whether
  commi-weigh truly falls out of site scoping or needs its own capability.
- **Definition-of-done** — Naoki's to draft (§1).
- **Recycled auth repo / custom POS repo** — unseen; read before designing
  passwords / the second sales source.

---

## 10. Doc-update actions (when the above firms)

Factual corrections (safe once decided): `scope.md` (multi-user, partly done),
`tech-stack.md` (auth), `package.json` description, `connection.js` pragma
comment. The **guard** `rules-for-claude-code.md` (~458–459, forbids auth/roles)
gets *replaced* with the new boundaries, not deleted, only after the roles design
firms. Add the routing rule (restaurant question → `needs-architect` issue →
Naoki; pure code → engineer decides + logs) to `engineer-role.md` /
`decision-authority.md`. Move `architect-notes-PRIVATE.md` and Marble's
`DISPATCHER-HANDOFF.md` into the repo — living outside version control is what let
them drift three times. `ui-conventions.md` becomes writable once the new pages
are known.

*Execution boundary: this doc DEFINES these edits; it does not make them. The
mechanical doc edits are a clean Class-A step (behind `assert
src.count(old)==1` guards) or Naoki's direct push — against the real files where
the guards run.*
