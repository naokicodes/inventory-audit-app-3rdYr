> **ARCHIVED 2026-10-28 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - Decisions 1-15 are recorded as ADRs (item map in `docs/decisions/README.md`).
> - #39 and #40 merged 10-22; #31, #33 and #37 fixed and merged 10-24; #35 merged 10-26.
> - Open questions answered: W6 (separate sheets, ADR-024); advance meals are staff orders rung in Loyverse (ADR-028); Beta (ADR-007); pizza partly (ADR-031).
> - Item 11's "FC uses the template only" was replaced on 10-28 (ADR-013).

# Architecture Handoff - 2026-10-22

**Lead, not source.** Checked against `origin/main` at `1517380` (fresh clone,
`npm run verify`: 483/483, audit clean). Supersedes the 2026-10-21 handoff, whose
"Decided, NOT yet recorded" list is carried below. Session-status still wins.
Keep the 10-20 and 10-21 handoffs in the project files until the archive drop-in
copies them word for word; then remove them.

## State

- On `main` 10-22: `b860649` (decisions for issues #32 #34 #36 #38 written under
  each step spec) and `1517380` (`/naoki-qm`, batch merge of ready PRs).
- Issues #32 #34 #36 #38 closed. PRs #31 #33 #37 sent back (changes requested,
  pointing at the specs); #35 commented. None fixed yet (heads unchanged).
- #39 and #40 are Ready (evidence on heads `155053f`, `7d3fdf7`, no shared files):
  run `/naoki-qm 39 40`.
- #35 (user-sites) is BasedMaple's draft claim: Naoki's `/naoki-qs` never picks
  it up. 3j and 3m wait on it until Marble finishes or releases it.
- No `beta-1` tag yet. SPOS mail password: status unknown.
- `Default_Prices_by_Station.xlsx` exists (one sheet per station, meat items from
  the three audit workbooks). Naoki is collecting the real prices. Never in the
  repo.

## Decided, NOT yet recorded - write these ADRs first

From 10-20/21 (unchanged): SPOS unfrozen, moves in via `git subtree` after Beta
(one attended `spos-import` PR, password rotated first, test forbids requires
across `spos/`); `/naoki-qs` merge policy (gates replace review, only naokicodes
merges); Beta setup (testers Naoki + Likod members, old restaurant PC wired,
own clone on tag `beta-1`); Sunday shows roster + meals on the prototype;
grouped nav after 3y; roster storage = separate staff table, optional link to a
login account.

From 10-21/22:
1. **Prices.** The default a cashier sees = the last billed unit price, falling
   back to the settings cost (seeded later from the private workbook through
   import-settings, never the repo). The cashier approves or edits the unit
   price per line; line = unit price x quantity arrived. The receipt grand
   total is typed once as a check: a mismatch warns, never blocks. Replaces the
   10-19 "paid / received". Valuation keeps using the last billed cost, so the
   default and the valuation cost are the same number.
2. **Blind counting, meat only.** Meat counters on the landing never see
   expected or variance. The landing person, head chef, supervisors and
   management do, and can order a recount by someone else; the first count stays
   in history, the recount becomes the count. Side sheets have no expected
   value, so nothing changes there.
3. **Meat counters enter endings + remarks only.** Allocations stay with the
   landing person / head chef; staff meals have their own page.
4. **Write permission is enforced; process is not.** Anyone may view; only
   tonight's assigned person or someone rostered on that station may write.
   Kitchen is strict: only the people the landing person / head chef confirmed.
   This sharpens, not breaks, scope.md's "assists, not enforces".
5. **New role: supervisor.** Makes the roster, sees everything incl. variance,
   edits POs, never counts. Landing person = head-chef role; station staff =
   checker; super-admin = Naoki; admin = full power for a trusted helper (none
   yet); management = read-only; cashier = bills-only.
6. **Stations are first-class for who-does-what only.** Each sheet belongs to a
   station; the roster places people at stations; tonight's assignment = the
   dated sheet's owner (sheets tier 2). No station-level stock or transfers.
7. **Kitchen veggies and pantry stay two sheets** (W6 UX still open, below).
8. **Likod is its own site**: own arrivals, POs, cashier, landing. Its only core
   sheet now is the grill's (Likod's own kitchen comes later). Likod sales of
   Silingan-menu dishes still count against Silingan's kitchen (10-03 rule).
9. **Moving an arrival line between Silingan and Likod**: a logged "move to the
   other restaurant" on the arrival, same day; after counts, the existing
   transfer allocation.
10. **POs keep a change history.** Every counter adds lines for their items; the
    landing person has the final say; head chef and supervisors may edit; each
    change records who and what. Landing / head chef / supervisor see estimated
    cost; counters do not; the supplier picture never shows prices.
11. **Roster = weekly template + daily changes** (FC uses the template only).
    Stored: date, site, station, person, on duty / rest day; head count feeds the
    meal budget. People working at another site for a day use memberships.
12. **Login list = tonight's roster** (after the roster exists); nothing assigned
    -> "No work for you tonight". PINs for staff before Live: decide later.
13. **ADR-003's open check answered:** the side sheet's inhouse column is unused;
    staff meals live on their own page. Pantry stays out of staff meals.
14. **Names:** nicknames only, in the local DB via the private import. The repo
    keeps invented names.
15. **Process:** every step spec gets an "Edge states" line (failure, partial,
    empty, stale, blocked, inactive, two devices). New step "table-scroll"
    (#30) after 3y, before grouped nav.

## Workflow facts (for the workflow doc)

Night counts: Silingan 9:30-10:30pm; FC and Likod 11:30pm-1am. Every station
counts its own sheet daily and writes a PO for its items; the landing person
(head chef or the cold-station lead) copies them into the Landing PO section and
may cut quantities (slow weekdays, veggies spoil in 1-2 days). Kitchen counters
are picked by the landing person / head chef; bar, pizza, FC scullery = whoever
the roster puts there (either of two). Silingan/Likod scullery: no inventory.
Side sheets: staff fill only beginning and ending. Receiving: veggies -> kitchen,
meat -> commi, everything else -> podium. Each restaurant's cashier gets its own
receipts: Silingan and FC on arrival, Likod at shift end (hence defaults). One
commi (at Silingan) supplies most Silingan and Likod meat; FC also buys some
meat directly. Staff meals: one cook per meal writes what was used (meat exact,
sides guessed); OJT meals are simpler and logged the same way; leftovers are out
of scope. Supervisors make the weekly roster and daily changes and check POs,
counts and arrivals without doing them. A future Davao branch would have its own
commi: no action now.

## Open questions for Naoki

1. **Pizza:** how its inventory differs (he will explain).
2. **W6:** one assignment ("Kitchen sides") covering the Veggies and Pantry
   sheets, with quick kg estimates for veggies and exact counts for pantry?
3. **Advance meals** (the other meaning of "inhouse"): rung up in Loyverse, or
   taken from the kitchen without a sale?
4. **Beta:** tag `beta-1` now or after count-drafts merges? Mail password
   rotated? Which day at the restaurant PC, and how many testers in which roles?
5. Still open from before: operating expenses (Final scope); who maintains the
   app after the school project.

## Agenda for the next architect chat

1. **Beta runbook by Sat 10-24** (needs Q4): separate clone on `beta-1`;
   `$env:DB_PATH` on the start line; Ethernet IPv4; phones on main Wi-Fi;
   firewall Private; never sleep; DHCP reservation; resets by Naoki only,
   announced; per-role test scripts; bugs in one Messenger group, triaged end of
   week 1; pause autopilot counting hours on that PC.
2. **One docs drop-in:** the ADRs above; a workflow doc from "Workflow facts";
   testing-plan Beta entry; `click-through.md`; the counted-meat costing line;
   `scope.md` rewrite; queue entries (`spos-import`, grouped nav, table-scroll);
   the Edge-states template line; #40's follow-ups (autopilot-guide "another run
   is active forever" row, labels created at install); archive the 10-20 and
   10-21 handoffs word for word.
3. After Beta week 1: order roster + meals vs sides/supply, using the decisions
   above.

The reasoning behind items 1-15 is in the 10-21/22 architect chat in this
project (search "blind counting", "naoki-qm", "Default_Prices_by_Station").
