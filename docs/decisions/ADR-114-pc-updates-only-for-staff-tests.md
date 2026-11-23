# ADR-114 The restaurant PC takes a new tag only for a staff test

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: none (replaces the counting part of session-status' 2026-11-22 "FC first" plan)

## Context

beta-3.1 is on the restaurant PC. The 11-22 plan had FC's head chef counting FC's landing in the
app at FC. Naoki: the staff find the pages confusing, and counting in the app now would mean more
work, confusion and going home late. He tests with staff only when he is with them, taking their
feedback to make each page as simple as possible.

## Decision

- Naoki tests every tag on his laptop. The restaurant PC updates to a newer tag only for a staff
  test with Naoki there, or when a recorded condition needs it.
- The one such condition now is ADR-103's order (the signed cookie before a device outside the
  restaurant). FC's head chef's phone already reaches the PC, so beta-3.2 (beta-3.1 plus
  sign-the-cookie) goes to the PC once it merges.
- Until a staff test, the PC serves Kitchen Sales: each landing (the head-chef role at a site) reads
  the day's sales to fill the paper landing's POS column. Counting stays on paper, and the counters
  stay blind (ADR-101). FC's head chef reads FC's side on his own phone through the Tailscale share
  (ADR-110).
- Staff tests, in order: Silingan's roster with its supervisor; the podium's check of a delivery
  against the PO with the purchaser's receipt totals (specced together, A9); more later. The meat
  inventory goes to staff last, once its pages pass ADR-115.

## Why

A confusing first try costs the staff time and trust; with Naoki there, each test turns into simpler
pages. The landings already copy the POS numbers by hand, so Kitchen Sales helps them without
changing their work.

## Consequences

- beta-4 is tagged on the laptop and stays off the PC until a staff test needs it.
- meat-landing.md's FLOW for FC changes: FC's head chef reads Kitchen Sales and counts on paper.
- If blind-reads hides sales from a logged-out reader (ADR-040 keeps logged-out blind), the landings
  need their logins (the people import) before the PC takes blind-reads.
- At beta-3.2 the PC's `.env` gets COOKIE_SECRET and ADMIN_PASSWORD by hand: the setup asks for them
  only from restaurant-pc-ii.

## Reopen only if

A staff test must run without Naoki there, or the landings need more than Kitchen Sales before the
pages are ready.

## Sources

Architect chat 2026-11-23 (answers 1 to 4; the sales-count and PC-security questions).
