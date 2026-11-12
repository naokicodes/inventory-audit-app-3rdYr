# Click-through checks for `public/` steps

Any step that touches `public/` needs a click-through before merge (ADR-002, `/naoki-qs` merge
policy).

Since 2026-11-02 (ADR-039) it has two halves: Claude checks the logic, a person checks the looks.

1. **Claude checks (logic).** Claude in Chrome opens the PR's preview (the link in the "Preview of
   PR #n is up" comment; label the PR `preview` to get one) at 390px wide (a same-origin iframe
   works well) and at desktop width. It logs in as the test accounts the step names and walks the
   step's "Claude checks" list (or its whole "Click-through" line when the spec has one list),
   plus its Edge states.
2. **You check (looks).** Naoki or a tester opens the same build on a real phone, on the
   restaurant or home Wi-Fi: colors, spacing, readability.
3. **Record it.** Put the commit hash that was checked, the date, and what was checked in the PR
   (a comment or the description). A later commit on the branch needs a new check.

Blind-count steps add one check: as a counter, the numbers must not appear in View Source or the
network response, not only on screen.

## Writing the list in a spec

A public step's spec splits its click-through into **Claude checks:** (what saves, what shows,
what is hidden, what is refused, what survives a refresh, and which test account to log in as)
and **You check:** (looks). A step that adds a role, a switch or an access rule also adds the
test account that shows it.

## The prompt for Claude in Chrome

```
Click-through for PR #<n> (Step <step name>). Open <preview link> in a same-origin iframe at
390px wide, then at desktop width. The data is reseeded sample data; the test accounts are on
the login page (their names start with "Test"). Follow the "Claude checks" list in
docs/session-status.md -> "Step <step name>" (or its whole "Click-through" line), plus its Edge
states. For each check give: what you did, as which account, what you expected, what happened.
Check the network responses as well as the screen. Report only; change nothing. End with one
line to paste as a PR comment:
Click-through: <head commit shown on the PR> - <passed | N problems> - <one-line summary>
```

## Test accounts

Made by `npm run seed:test` (step test-accounts), never on `beta.db` or `inventory.db` (the
script refuses both). Previews get them after every reseed. On a laptop, use a throwaway database
such as `server/db/dev.db`: point DB_PATH at it, run `npm run reseed`, then `npm run seed:test`,
then start the app on it. Real people reach the restaurant PC only through the people workbook
(import-identity).

| Account | Role | Sites | Shows |
|---|---|---|---|
| Test Admin | admin | (bypass) | Settings, every site |
| Test Management | management | (bypass) | the read-only view |
| Test Head Chef RA / FC | head-chef | RA / FC | expected and variance, recount orders |
| Test Counter RA / FC | checker | RA / FC | the blind count |
| Test Commi | checker | COM-A | the commissary (never blind) |
| Test Floater | checker | RA, FC | two sites |
| Test No Sites | checker | none | the site refusal |

## Beta smoke list

Before tagging a new `beta-N`, Claude in Chrome runs this on the commit to be tagged, on a
throwaway database with the test accounts. Skip a line whose step is not merged yet.

1. Test Counter RA, Daily Audit, RA, today: enter an ending and a remark, Save Day, refresh. The
   values stay. Beginning, new stock, sales, expected and variance never show, on screen or in
   the network response.
2. Type a count without saving and refresh: "Restored N unsaved entries" shows; Discard brings
   back the saved values.
3. Test Head Chef RA, same day: expected and variance show. Order a recount of one item for Test
   Counter RA; as Test Counter RA, the recount shows and saves.
4. Test Commi: enter a yield, then a shipment to RA. RA's Stock Receipts shows the shipment for
   that date.
5. Kitchen Sales: the date bar moves between days. With no Loyverse tokens an account shows "-",
   never 0.
6. Site access (after site-filter and site-filter-ii): Test Floater sees RA and FC in the picker,
   Test Counter RA only RA; Test No Sites is refused on a site page.
7. Settings (after settings-guard): Test Counter RA saving a change sees "Only an admin can change
   settings"; Test Admin saves.
8. Logged out (until write-permission): a counting page still works and stays blind.
