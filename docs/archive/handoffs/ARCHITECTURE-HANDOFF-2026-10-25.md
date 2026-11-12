> **ARCHIVED 2026-10-28 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - Decisions 16-59 are recorded as ADRs (item map in `docs/decisions/README.md`). Replaced on 10-28: item 40 (ADR-027), item 55 (ADR-013, no "lent" concept), item 23's CEO approval (ADR-013, dropped), the laptop Beta server (ADR-007).
> - Open questions answered 10-28: Q1 commi access (ADR-017), Q4 budget per meal (ADR-027).
> - Architect queue: A1, A3, A4 and A7 done 10-28; see the latest handoff for the rest.

# Architecture Handoff - 2026-10-25

**Lead, not source.** Checked against `origin/main` at `40e982d` (499/499, audit clean). Supersedes the
2026-10-22 handoff (its decisions are carried below). Session-status still wins.
Keep the 10-20, 10-21 and 10-22 handoffs in the project files until A1 copies
them word for word into `docs/archive/handoffs/`; then remove them.

## State

- Merged 10-22 by `/naoki-qm 39 40` (closed in `4859652`): #39 loyverse-preview-iii,
  #40 autopilot-hardening. `/naoki-qm` works.
- #31 count-drafts, #33 stub-login, #37 Kitchen Sales: fixed and merged 10-24
  (closed in `537572e`, `a5cd505`, `fe4bb60`).
- #35 (user-sites) is BasedMaple's draft: Naoki's runs never touch it. 3j, 3m and
  3u wait on it, and roster work (A6) waits on 3j. Marble is not back: ask him
  to close #35 so Naoki's runs can rebuild it.
- SPOS mail password: **rotated** (confirmed by Prince). Code removal still rides
  `spos-import`.
- No `beta-1` tag yet.
- `docs/areas/` is on main (`2dd5d53`, round 2 in `40e982d`). Private companion:
  `AREAS-PRIVATE-NOTES-2026-10-24.md` (project files only).
- Slow page loads on the restaurant Wi-Fi: `style.css` imports Google Fonts, so
  every page waits on the internet. Fix = a small code step `self-host-font`
  (Archivo is OFL). Not yet in the queue.
- `Default_Prices_by_Station.xlsx`: Naoki is collecting real prices. Never in the repo.

## Beta, as changed on 10-24

- Server = Naoki's laptop (the restaurant PC is in maintenance). Data lives in
  `beta.db` on disk and survives restarts.
- Weekdays: Naoki tests alone on his phone and tablet. Weekends: the laptop stays
  at the restaurant for staff sessions (staff input = UX feedback).
- Tag before each weekend session (`beta-1` first), so staff test a version Naoki
  already went through.
- Runbook still to write: separate clone pinned to the tag with its own
  `beta.db` (never reseed or pull in that folder); Loyverse tokens in that
  clone's `.env`; plugged in, lid closing does nothing, no sleep; check the Wi-Fi
  IPv4 each session; copy `beta.db` to a dated backup after each session; short
  per-role scripts for the weekend staff.

## Demos

- **Sun 10-25:** what the chef CEO gets. (1) roster -> who may work on which
  inventory; (2) staff meals -> management sees total expenses; (3) PO -> arrival
  -> bill -> expenses. Shown on the 10-21 prototype as it is, with the newer
  decisions said out loud (no tokens to rebuild it).
- **Sun 11-01:** inventory demo.

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

From 10-24:
16. **Veggies and Pantry are separate sheets**, separately assignable (one person
    may hold both tonight).
17. **Flexible units on side and station sheets.** Each item has a main unit plus
    optional conversions (1 sack = 25 kg); a count may be entered in any unit,
    fractions allowed ("1 1/2"); a row mixing units with no conversion shows what
    was entered and "add a conversion", never a guessed usage. Meat on the
    landing keeps one unit per meat (counting one meat by pcs AND kg is open).
18. **In-house = staff meals + staff orders.** Staff orders are rung up in
    Loyverse (sales already remove the stock); the landing shows an in-house
    summary for management.
19. **Docs for people: `docs/areas/`.** README = the map (every area with an IRL
    status: Unknown / Told / Written / Confirmed, and an APP status: None /
    Decided / Specced / Built / Tested / Live). One file per area: status line,
    IRL (with sources), APP (links to ADRs and specs), open questions. Public,
    written with roles and sheet structure. Private things (photos, prices,
    nicknames, owners' figures, money flows) go in a gitignored `docs/private/`
    and the Claude project files; photos as a PDF (project files read images
    only inside PDFs). Claude writes and updates these files and checks what
    Naoki says against the docs, the ADRs and past chats, flagging conflicts.
    Habits: IRL before APP; every architect chat ends by updating the map.
20. **Third part per area: FLOW** (Naoki's): how each role will use the app in
    real life, step by step. Each area file = IRL / FLOW / APP / open questions;
    the map gets a FLOW status (None / Drafted / Walked through with staff /
    Matches the app). Naoki writes IRL and FLOW notes (Taglish fine, nicknames
    and prices fine in notes); Claude writes APP and keeps sensitive details
    out of public files.
21. **Photos:** Naoki sends each paper-sheet photo once, in the chat that works
    on that area; Claude transcribes its structure into the area's IRL section,
    which then stands in for the photo. No PDFs needed.
22. **Architect work runs as a queue** (below), like `/naoki-qs` steps: each
    chat picks a batch, finishes it, and ends with a drop-in plus a new handoff
    marking items DONE.

From 10-24 (non-inventory Q&A):
23. **Roster:** role tied to station; "off, covered by X" is a daily change.
    Weekly roster made by supervisors on the weekend; the CEO approves it
    (management is read-only except this). Any supervisor makes daily changes;
    a specific supervisor can be blocked. No shift times or time-in/out.
24. **Assignments can be set in advance** (at closing the night before). The
    landing person does not count; no feature for it.
25. **The landing is a kitchen job** (one of the two head-chef-level chefs),
    assignable to anyone, a supervisor included, as a fallback.
26. **Sheets per station confirmed**; Podium keeps a logbook and gets a "Misc"
    area that inventory holders later move onto the right item. The kitchen only
    confirms veggies on arrival (the buyer weighed them).
27. **New role: buyer.** ~70% of buying is shop runs (buyer + floor supervisor),
    ~30% supplier delivery (PO by Messenger after closing). Items tagged by how
    they are bought; the buyer sees one list (items, quantities, no prices).
28. **Unplanned buys** are recorded against items (receipt to the cashier, who
    bought it); shortfalls go onto the buyer's list.
29. **Receivers are assigned**, the roster covers their days off.
30. **Commi meat requests** are internal requests (matches the paper form).
31. **Prices** come from receipts in a pinned chat until ~75% coverage.
32. **Staff meals:** Silingan eats twice (afternoon, evening); official staff
    only in the budget; OJT logged separately; cook logs right after cooking;
    meat entered in grams.
33. **In-house and cash-advance slips** go to the weekly payroll (money, A13).
34. **Management view:** spent per day / week / month, checked at night;
    supervisors see it too.
35. **Two flows:** money and stock differ. Show **Spent** (purchases paid) and
    **Used** (stock consumed or lost) separately, clearly labeled.

From 10-25 (photo review):
36. **Bar sales check:** drinks sold as-is and dessert slices get expected vs
    counted from Loyverse sales, like meat. Raw bar items stay side-sheet style.
37. **Dough** is counted in balls and made in containers of 12; new dough is
    entered in steps of 12.
38. **Waste is its own entry** (written on a separate paper today). COOKED,
    INHOUSE and WASTE columns are shown on the sheets, computed from their own
    entries, never typed at count time.
39. **"12+6" endings** on paper are later additions (paper cannot be erased);
    in the app they are edits with history. No special input.
40. **Staff-meal budget:** keep the paper's figure as the maximum reference
    until the rule (per meal or whole day) is confirmed.

From 10-25 (round 2):
41. **Commi shipments** are written twice per destination, as kg and as
    portions; the app's commi flow already matches. Old "pieces AND weight"
    question closed.
42. **Bar is not blind.** Bottles, cans and desserts get an exact sales check;
    desserts are a priority. Raw bar items stay as they are for now.
43. **Likod gets Veggies and Pantry sheets**, copied from Silingan's lists, for
    its coming kitchen.
44. **The app guides against human error** (one row per item, unit picker,
    warnings), because that is the problem it exists to fix.
45. **Admins can close a sheet ("under maintenance")**: super-admin and admin
    only; a closed sheet cannot be assigned, is not counted, never shows as
    missing, and keeps its history. Likod's new sheets start closed.
46. **Likod's kitchen** opens roughly before the new year (not certain).
47. **Skewering / portioning (tuhog) happens at the commi**, which prepares the
    final products for kitchens and grill.
48. **Likod mapping confirmed:** commi "Likod out" -> grill raw arrivals;
    specials -> grill items; coffee and cakes -> Likod bar; drinks -> bottles &
    cans; pizza -> shared station; Silingan dishes sold at Likod -> Silingan.
49. **Skewer dishes have 6 sticks:** Cue Medley = 2 porkito + 2 yaki to eh +
    2 tuna skewers; Squeal and Cheep = 3 porkito + 3 yaki to eh.
50. **Waste:** meat waste already uses the daily-audit adjustments (Wastage,
    Spoilage, Damaged). Side items extend the same idea. Naoki enters most test
    data himself.
51. **Pizza:** rung on both accounts; dough matters most. Two bases (mozzarella,
    cream cheese); mozzarella standard per pizza type and per station
    (shared station vs FC). Dough made in containers of 12 with a set flour
    amount; old dough and boxes to FC are adjustments; shared pantry items are
    counted on both sheets and summed. Pizza is the last side sheet; first a
    skeleton that shows the pizzaman the pizzas sold.
52. **Cooking gas** stays out of staff-meal cost (operating expense, A13).
53. **Staff orders** are recognised in Loyverse by the staff member's name.
54. **Absent counter:** the landing person or a supervisor reassigns, any time
    before the count closes.
55. **Lent staff** (any of the three restaurants) appear on both rosters and
    count in the head count where they work.
56. **"How it's bought" tags:** set by an admin in Settings; the landing person
    can suggest changes.
57. **Buyer receipts:** one bill per receipt, grouped under the day's run.
58. **`self-host-font`:** yes, the next small code step.
59. **11-01 demo:** Naoki told management to expect big progress.

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

From the 10-24 paper sheets:
- **Commi sheet:** begin, stock in, backed up, out per destination (FC, Silingan,
  Likod), ending; a portion block per destination. Likod is a third destination.
- **Likod landing (grill):** top block of grill items (begin, new, POS, in-house,
  over/short, end); a raw-meats block (begin, new, tuhog/portion, end); PO
  blocks for grill, bar and others.
- **Pizza sheet (shared Silingan/Likod station, one pizzaman from each):** most
  rows begin/new/end like a side sheet; the dough row works like meat
  (begin + made - cooked - in-house = end); old dough is turned into French loaf
  or pita; pizza boxes also go to FC.

## Open questions (new chat)

1. **Commi access vs sub-commi** (proposed): give the person who takes meat out
   of the commi for their station (e.g. the griller) commi access to yield and
   ship to their own site, instead of creating a second commi. Confirm.
2. **Pizza:** whose stock is the shared station's (Silingan's, with Likod's pizza
   sales counted against it)? Which pantry does it draw from?
3. **Staff orders:** which Loyverse field carries the staff name (customer or
   note)?
4. **Staff-meal budget** (Naoki asking): per meal or whole day?
5. **Likod bottles & cans:** what the OUT column records (low priority).
6. Photos still to come: the waste paper, the podium logbook.
7. Still open from before: operating expenses (A13, its own conversation); who
   maintains the app after the school project.

## Architect queue

Pick a batch per chat: one L, or two or three S/M. Start the chat with
"Batch: A1, A3" (this handoff is in the project files). End it with the drop-in
and a new handoff that marks items DONE. Size = rough token cost of the chat.

| ID | Item | Needs from Naoki | Produces | Size |
|---|---|---|---|---|
| A0 | Decision triage (recurring) | `/naoki-qpr` + `/naoki-qi` reports | Answers + spec drop-in | S |
| A1 | Decisions drop-in: ADRs for items 1-59 and the 10-20/21 list; archive the 10-20, 10-21 and 10-22 handoffs | nothing | Drop-in + push commands | L |
| A2 | ~~`docs/areas/` map + area files~~ **DONE 10-25** (on main: `2dd5d53`, round 2 `40e982d`) | - | - | - |
| A3 | Laptop Beta runbook + testing-plan Beta entry (before the first weekend session, Sat 10-31) | laptop on Wi-Fi only? session hours | Runbook + drop-in | S |
| A4 | Small docs + queue entries: `self-host-font` (code step), `sheet-close` (admins close a sheet), `click-through.md`, counted-meat costing line, Edge-states template line, #40 follow-ups, queue entries (`spos-import`, grouped nav, table-scroll) | nothing | Drop-in | S |
| A5 | `scope.md` rewrite (sides, supply, roster, meals now in scope) - before the first sides or supply step | nothing (after A2) | Drop-in | M |
| A6 | Who-does-what + roster -> step specs (staff table, roster, tonight's assignments, supervisor role, login list from roster) | notes: areas 1 and 6 | Specs + queue | L |
| A7 | Meat landing: blind count + quiet recount -> step spec | notes: area 2 | Spec | M |
| A8 | Veggies, pantry, bar sheets (flexible units) -> step specs | notes + photos: areas 3-5 | Specs | L |
| A9 | Supplier orders + arrivals + bills + prices -> step specs | notes: areas 7, 8, 10 | Specs | L |
| A10 | Staff meals + in-house + management expenses view -> step specs | notes: areas 9, 16 | Specs | L |
| A11 | Pizza station design | notes + photos: area 12 | ADR + area file | M |
| A12 | Likod as a site: grill landing, commi third destination, menu -> stock | notes + photos: areas 13, 15; table corrections | ADRs + specs | L |
| A13 | Money and operating expenses | Naoki's money-flow explanation | Area file | M |

Suggested order for the 11-01 demo ("big progress"):
1. **Next chat: A4 + A7** - queue `self-host-font` and table-scroll, and spec
   blind count + quiet recount, so `/naoki-qs` can build them Tue-Fri.
2. **Before Sat 10-31: A1 + A3** - decision records and the laptop runbook.
3. Then A6 (roster, once #35 is released) and A8 (side sheets; pizza last).

The reasoning is in the 10-21/22/24 architect chat in this project (search
"blind counting", "naoki-qm", "docs/areas", "pizza dough").
