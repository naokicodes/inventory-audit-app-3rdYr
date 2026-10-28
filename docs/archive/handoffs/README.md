# Archived architecture handoffs

Each architect conversation used to end with a dated handoff that carried state,
decisions and their reasons into the next conversation. They were kept outside
the repo, so they drifted. Since 2026-10-20, decisions live in `docs/decisions/`
(ADR-001), state lives in `docs/session-status.md`, and a handoff is one page.

These files are kept **word for word** because the reasoning, and especially the
reversals, is where most of the learning is. Each one starts with a banner
listing what changed after it.

**Rules**
- Read these as history. Never build from them without checking
  session-status and `docs/decisions/`.
- Never edit a file here, except its banner.
- When the current handoff is replaced, it moves here with a banner.

## The files

| File | Main at | Tests | What it handed over |
|---|---|---|---|
| `architecture-decisions-DRAFT-2026-09-24` | `c8fb7e0` | - | First full architect capture: roles, sheets, receipts, PO, UI. Nothing dispatched. |
| `ARCHITECTURE-HANDOFF-2026-09-24` | `769a110` | 396 | 26a / 26a-ii / 26a-iii decisions; the `/start` + `/review` routine. |
| `ARCHITECTURE-HANDOFF-2026-09-26` | `85ac0e8` | 402 | Closed the draft's open questions; the Beta lane; the richer yield model (reversed two days later). |
| `ARCHITECTURE-HANDOFF-2026-09-28` | `7d7e14e` | 443 | Path 1 yield, three-stage staging, the identity chain, the slicing order. |
| `ARCHITECTURE-HANDOFF-2026-10-05` | `1f62de5` | 443 | Core-app line, hybrid A, the autopilot plan, the Loyverse preview. |
| `ARCHITECTURE-HANDOFF-2026-10-20` | `213b9a1` | - | Transitional: introduced `docs/decisions/` (ADR-001 to ADR-004) and this archive; planned the harvest. |
| `ARCHITECTURE-HANDOFF-2026-10-21` | `144c33d` | 483 | SPOS into the repo, the `/naoki-qs` merge policy, Beta on the restaurant PC, roster storage. |
| `ARCHITECTURE-HANDOFF-2026-10-22` | `1517380` | 483 | Decisions 1-15: prices, blind counting, roles, stations, Likod, POs, roster. |
| `ARCHITECTURE-HANDOFF-2026-10-25` | `40e982d` | 499 | Decisions 16-59: area docs, side units, buying, staff meals, bar, waste, pizza; the architect queue. |

Not here: the 2026-09-15 handoff and the dispatcher handoff (never committed),
and `architect-notes-PRIVATE.md` (stays private). Decisions 1-94 from the 10-22 to
10-28 handoffs are recorded as ADR-005 to ADR-032.

## How the decisions changed

**Yield** - the biggest swing. Problem: miscut was hidden in the
raw - backed gap, mixing true loss with reusable trim.
- 09-24 draft: the intake weigh-in was cancelled (reversing 09-03); kg is
  measured at production (`raw_weight_in`).
- 09-26: a richer model with counted outputs (`output_quantity`), miscut
  first-class, 24b-v redefined as "the weight flow must close".
- 09-28: **reversed** to Path 1: output always kg, no `output_quantity`,
  `miscut_weight` as analytics, coherence guard (backed + miscut <= raw). The
  09-26 model broke a settled rule (#16). Built as 24d-i / ii / iii.

**Staging** - where commi meat becomes restaurant meat, and whose ratio applies.
- 09-24 to 09-26: the commi is the source of truth; the restaurant only
  acknowledges.
- 09-28: **corrected** to three stages: commi processing (kg out), commi
  staging through `commissary_meat_map` (a map, no ratio), restaurant
  conversion (optional, ratio standard). The ratio is the restaurant's.

**Receipts and POs** - no record of what arrived; orders on paper.
- 09-24 draft: the commi weighs and photographs; the restaurant acknowledges;
  PO Option B (internal request vs supplier order); 25a becomes quantity-only.
- 09-26: par levels with PERCENT and ABSOLUTE modes feed the shorts.
- 09-28: internal requests get their own record, `request_id` on the shipment,
  and a status flow.
- 10-19 (session-status): supplier orders are ours (PNG + text), arrival
  against the order with a receipt photo, and a Bills page. **Replaced** the
  10-03 lean that SPOS owns supplier POs.

**Roles and identity** - authorship was free text ("Unknown").
- 09-24 draft: four axes (role, position, rota, official vs witness), five
  roles pending, stub login, forward-clean `user_id`.
- 09-26: five roles confirmed; commi-weigh needs no separate capability.
- 09-28: a six-step identity chain; roles table seeded from the settings
  workbook.
- 10-13: users-roles merged (PR #24). 10-19: a bills-only role, the first
  exception to "cashier is not an app user".

**Finalization and sheets** - who closes a day; who owns a sheet.
- 09-24 draft: open questions.
- 09-26: two-step Done -> Close (soft), lazy tier-2 instances, overlay over
  the engine tables.
- 09-28: Done is mark-and-warn; the head-chef acknowledges flags at Close.
  Never reversed, only sharpened.

**Sides**
- 09-24 draft: not built.
- 09-26: minimal usage engine, never through `auditEngine`.
- 09-28: one catalog plus per-site availability, one SIDE sheet per category.
- 10-20: staff-meal estimate on sides (ADR-003).

**The app's direction** - where sales and money come from.
- 09-28: eventual merge into SPOS; the DB target becomes MySQL.
- 10-05: **reversed** to hybrid A (SQLite here, MySQL in SPOS, an API between,
  only quantities cross). This app is the core app.
- 10-19: separate apps (D3); a column-limited read-only MySQL user; SPOS frozen
  at `5950238`.
- 10-20: Naoki owns SPOS (ADR-004).

**Definition of done**
- 09-24: the biggest carried risk, Naoki to draft.
- 09-28: directional through alpha, firmed at Beta (decision B).
- 10-20: firmed (ADR-002).

**Process**
- 09-24: the silent queue runner was dropped for `/start` and `/review`;
  `Touches:` lines; no stacked PRs; one migration in flight at a time.
- 09-26: reconcile drift between parallel chats before dispatching.
- 10-05: the autopilot runner replaces the dispatcher role (not active until
  the server install).
- 10-20: decision records (ADR-001).

**Beta server**
- 10-21: the old restaurant PC, wired; its own clone on `beta-1`.
- 10-24: Naoki's laptop (the PC was in maintenance).
- 10-28: back to the restaurant PC, pinned to tags by `restaurant-pc.bat` (ADR-007).

**Who counts the kitchen**
- 10-22 / 10-25: "counters" picked by the landing person, a head-chef-level chef.
- 10-28: one Kitchen Window dispatcher counts all three kitchen sheets; the FOH counter (head
  chef + cold station) is the landing (ADR-014). The architect first read the roster's "Head
  Chef/Dispatch" row as the counter; Naoki corrected it, and "ask before assuming" became part
  of ADR-008.

**Roster approvals and lent staff**
- 10-24 / 10-25: supervisors make it and the CEO approves; lent staff appear on both rosters.
- 10-28: no approvals in the app; the head chef enters the kitchen rows; a day at another
  restaurant is a placement there (ADR-013).

**Commi access**
- 10-25: proposed - station cooks get commi access instead of a sub-commi.
- 10-28: a standing membership, narrowed the same day: rostered on Commissary or a head-chef
  pick at Silingan; all grillers at Likod (ADR-017).

## Three kinds of change

- **Narrowing** (finalization, sheets, roles): old versions are less detailed
  but not wrong. Harmless to read.
- **Reversal** (yield, staging, intake weigh-in, MySQL target, supplier POs):
  old versions are wrong. Dangerous if read as current. Each gets a
  superseded + new ADR pair.
- **Drift**: a reversal landed in one document but not another (the 09-02
  "count and weight" intake rule; session-status's MySQL line). Fixed when
  found.

## Lessons the handoffs recorded

- Split big steps (26a ran at about 3x the usual tokens).
- Context lives in the repo, not the chat.
- Read a spec against the code, not just the question asked.
- Verify every new spec against the settled decisions (#16, twice).
- Regenerate drop-ins on the current HEAD before pushing (the 3n-3q queue-id
  collision).
- PowerShell 5.1: one command per line.
