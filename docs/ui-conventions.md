# UI conventions

**Seed, not the full doc.** Written 2026-09-27 to settle the daily-audit-mobile
questions from issue #11 so that step is no longer Class B on them (see
`docs/decision-authority.md` -> "UI work is Class B by default - with one escape";
anything this file settles is out of Class B). The broader token set and the
card/list patterns get written once the new pages (login, roles admin, PO-request,
acknowledgment, sides) are known. Add to it; don't wait for it to be complete.

## Breakpoints

- **Phone vs desktop cutover: 768px.** This is the first `@media` in
  `public/style.css`. Below it, a page may show phone-specific views; at/above it,
  the page keeps its desktop layout. Working value - revisit if a real device
  proves it wrong, but keep one number across pages.

## Navigation

- **Below 768px the shared top nav must not widen the page.** It stays a single
  non-wrapping row contained to the viewport (`overflow-x: auto`), so the page body
  never scrolls sideways - only the nav strip scrolls. (Issue #13: 11 flex links
  with no wrap made every page ~866px wide at a 390px viewport.)
- **`#command-panel-toggle` stays `position: fixed` bottom-right.** It only appeared
  to overflow because the nav widened the page; a contained nav fixes it with no JS
  change.
- **A fuller mobile nav** (grouping or a collapse/menu) is deferred until the new
  pages (login, roles admin, PO-request, acknowledgment, sides) land and the
  top-level set is known.

## Daily audit (and any Review/Enter sheet)

- **Two views over one fetch.** Review (read the state) and Enter (type counts)
  render from the same data with no second fetch and no new save contract.
- **View on open:** remember the last-used view per device (`localStorage`).
  First-ever load defaults to **Review**, because it shows the blocked "needs month
  opening" state and the carry tags an auditor needs to see before entering.
- **One accented input.** In Review, ending-actual is the only accented input and
  variance the only colored chip; everything else is muted/display.
- **Remarks lives in Review only,** un-accented, and is absent from Enter (Enter is
  one count input per row). The remarks value is always posted on save from either
  view, so switching views never blanks it.
- **Desktop keeps its table.** Above the breakpoint there is no Review/Enter toggle;
  the phone views and the toggle exist below the breakpoint only.

## Tables

- **Wide tables scroll, they don't reflow.** A table too wide for the phone (the yield log,
  and any dense grid that isn't the daily-audit sheet) sits in a horizontal-scroll container
  (overflow-x:auto) below 768px so the page body never scrolls sideways. Do not card-ify it -
  the Review/Enter card treatment is the daily-audit sheet's only.

