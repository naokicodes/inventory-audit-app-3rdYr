# ADR-115 A page goes to staff only after a staff-friendly pass

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: none (adds to ADR-111: the full visual pass stays later)

## Context

Naoki: the staff find today's pages confusing - too many words, and the arrangement is odd. The full
visual pass from the mockups waits for the roster and login steps (ADR-111), but staff tests come
before it (ADR-114).

## Decision

- Before a staff test, each page that test uses gets a staff-friendly pass, checked by Naoki on his
  laptop at phone width, used as that staff member would.
- The pass keeps Naoki's flow (what is done, in which order) and changes how the page reads:
  - few words: a label, not a sentence; help text only where a mistake costs something;
  - laid out top to bottom in the order the person works, one main action per part of the screen;
  - colors that guide, the same on every page: the next thing to do, done, needs attention, error;
  - room: space between parts, and big tap targets.
- Design for someone who has never seen the app and reads little (Naoki: as if for children).

## Why

Staff learn by doing, on a phone, at the end of a shift. Colors and spacing guide them where words
are not read.

## Consequences

ui-conventions.md gains "Staff-friendly pages". Each staff test's steps start with the pass for its
pages (the roster's first), specced with that test. The first pass picks the four colors; later pages
reuse them.

## Reopen only if

Staff still find a passed page confusing in the test: then the principles change, not just the page.

## Sources

Architect chat 2026-11-23 (answer 5).
