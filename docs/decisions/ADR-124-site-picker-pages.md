# ADR-124 The pages list only your restaurants; a refusal shows its message

- Status: Accepted 2026-11-26
- Decided by: Naoki
- Supersedes: none (widens ADR-091's "the count pages' pickers" to the pages that enter data, their
  filters and Dashboard)

## Context

The smoke list on 2026-11-23 (line 6): Test Counter RA's Landing listed FC, opened on it and hung on
"Loading..." - the page read the 403's error body as rows. Test No Sites saw "Loading..." and no
message. GET /restaurants has carried `can_use` per row since ADR-091, but no page reads it yet
(Fable U-02). The same run noted that with FC's account failing, Kitchen Sales' FC landing lines come
back with `sold: 0` instead of no number.

## Decision

- The Landing, Typed sales, Stock Receipts and Allocations list only the restaurants you can use: in
  their restaurant pickers, their "Restaurant" filters ("All" means all of yours) and Stock Receipts'
  assign box. Dashboard's restaurant checkboxes too (its server already drops the others for staff).
- One restaurant: no picker; the page opens on it and shows its name. Several: the phone remembers the
  last one picked, for all four pages; one you can no longer use is skipped.
- None: one line in place of the page: "You're not set up for a restaurant yet. Ask a supervisor to add
  you."
- A refusal while loading shows "This restaurant isn't one of yours. Pick another."; any other failure
  "Could not load: <the server's message>. Try again." A page never stays on "Loading..." after an
  answer.
- Admins, management (read-only) and logged-out pages see every restaurant, as today (ADR-040,
  ADR-091). Shipments, the Terminal and Settings keep the full list. Allocations' transfers are
  between locations, not restaurants, so nothing there keeps the full list.
- Kitchen Sales: when FC's account fails, FC's landing lines carry no number (null), never 0.
- Step site-picker, last in beta-4's lane (after preview-pid).

## Why

Staff see only what they can act on: a restaurant they cannot open is a dead end, and a page stuck on
"Loading..." looks broken (ADR-115: pages simple enough for anyone). A 0 that means "unknown" reads as
"nothing sold".

## Consequences

Step site-picker (five pages, shell.js, FC's landing nulls). Its build is a click-checker build for
A17's comparison.

## Reopen only if

Staff need to read other restaurants' pages.

## Sources

Architect chat 2026-11-26 (questions 5 to 8; Naoki: "Acknowledged", "Rec").
