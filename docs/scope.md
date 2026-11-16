# Scope - what this app is and is not

Rewritten 2026-11-16 (A5). The decisions themselves live in `docs/decisions/` (one ADR each); this
file is the short version to read before building anything. If a feature is not under "In scope",
check before building it - even when it looks like an obvious, helpful addition. Small, working and
boring beats large and half-finished.

## Governing principle (Naoki, 2026-09-23)

The app replaces the paper sheets and does the same job, but it **assists the workflow - it is not
the workflow.** Tags and labels that help people read a number are welcome; enforcing process is
not. The deliberate exception is the month-start recount block (step 26a-ii), which the restaurant
asked for. Warnings, never blocks: a rule the restaurant keeps by habit (who opens after closing,
what a PO should hold) shows as a warning the person can save past.

If a step would make the app dictate how staff work - a new block, a required field, a forced order
of steps - that is a restaurant question, not a code question: open a `needs-architect` issue
instead of deciding it.

## Who it is for

- One restaurant group: Silingan; Likod, the backyard restaurant at the same place (its own site
  from A12); FC; and the commissary at Silingan that supplies them. A later branch is set up like
  Silingan, with its own commissary (ADR-085).
- Staff on their phones: counters and cooks, the landing (the head-chef role at a site, ADR-035),
  the commissary person, buyers, the podium, the bar. Supervisors and the main supervisor on a phone
  or a computer. Admins. Management (the owners) read only (ADR-084).
- Looked after by an admin who does not code (ADR-097): what a restaurant changes is data in
  Settings, the Roles and Staff pages or the people workbook; install, update and backups run from
  the restaurant PC's launcher.

## In scope

- **Every inventory sheet a site keeps in the app (ADR-069):** the meat landing (counted blind,
  ADR-015), the commissary (yield, shipments, meat requests and staging, ADR-092), kitchen veggies,
  pantry and the bar (sellables checked against Loyverse, ADR-087). FC keeps some sheets on paper
  (ADR-065); pizza joins with A11.
- **The numbers around a count:** beginning carried from yesterday, new stock, sales read from
  Loyverse, prep, adjustments (waste, transfers, conversions, staff meals), expected and variance.
  Stock is in quantities; the app prices stock and losses itself (D3), behind see_costs (ADR-060).
- **Supply (A9):** POs from the counts; supplier orders sent as a picture; buyer runs with ticks and
  receipt photos (ADR-068); arrivals and bills.
- **People:** the roster with Fill (ADR-013, ADR-096); who counts tonight (ADR-011, ADR-035); staff
  meals and in-house (ADR-027, ADR-044); charges and a weekly export for the payroll (ADR-088).
- **Reading the day:** Kitchen Sales (ADR-066, ADR-094); views as cards for supervisors and
  management (ADR-089); the roster board (ADR-090).
- **Roles as switches per site** (ADR-034, ADR-082): who may do what is data, Discord-style, never
  a hard-coded role check. Changes to stock and settings are kept in an activity log.
- **Where it runs:** the restaurant PC on the restaurant network, phones over Wi-Fi, Tailscale for
  remote checks (ADR-070); a hosted server later, behind real logins before Live.
- **Code in a public repo:** no prices, costs, budgets, credentials or staff details are ever
  committed. Staff are named by role in the repo; names and the owners' figures live in private
  notes.

## Not in scope

- **Money in:** sales, revenue, payments and the POS stay in Loyverse (later SPOS, a separate app;
  D3, ADR-057). Kitchen Sales only reads.
- **Payroll itself:** it stays in the main supervisor's Excel; the app gives her days and charges
  (ADR-088).
- **Approvals, clock-in, hours:** none (ADR-013). Shift rows carry times only as text (ADR-096).
- **Recipe costing, food-cost percentages, menu engineering.**
- **Native phone apps:** the web app runs on phones; an Android app comes only after the SPOS work.
- **Process enforcement** beyond the month-start recount (see the governing principle).

## Parked (valid, not now)

- Pizza station (A11), Likod as a site (A12), operating expenses (A13), a dashboard builder (A15).
- Per-person permission overrides; the real Loyverse port (nightly sync); the Loyverse name map in
  Settings (name-map-settings, ADR-097); receipt OCR; AI summaries.
- The commissary's jowl reconciled against FC's portion lines; burger-patty blends.
- An activity log on every table (today: stock receipts, yield, settings, roles, roster and the
  other tables their steps name).

## The worker-facing surface stays small

Staff type counts and tick lines on short phone screens: no recipes, configuration or arithmetic on
the daily screens. Settings, recipes, roles, stations and the roster's Fill are admin and supervisor
screens.

## When in doubt

If a Claude Code suggestion or an implementation detail would grow the scope beyond this file, stop
and ask before building it.
