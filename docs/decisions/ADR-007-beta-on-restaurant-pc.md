# ADR-007 Beta runs on the restaurant PC, pinned to tags

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: the unrecorded 2026-10-24 laptop-server plan

## Context

On 10-21 Beta was planned on the old restaurant PC. On 10-24 it moved to Naoki's laptop while
the PC was in maintenance. On 10-28 the PC was set up with `restaurant-pc.bat`.

## Decision

- **The restaurant PC is the Beta server**: its own clone in `%USERPROFILE%\InventoryApp`,
  pinned to a tag (`beta-1`, `beta-2`, ...), never pulled or reseeded, data in `beta.db` through
  `.env`, Loyverse tokens only in that `.env`. It moves with `restaurant-pc.bat update <tag>`.
- **The laptop** is for dev and weekday testing on `main`.
- A tag is only ever a `main` Naoki already phone-checked.
- **Paper stays the record of truth during Beta.** Naoki tests alongside the staff he works with
  that day; staff input is UX feedback.
- **Backups**: a dated copy at every start, plus a private copy (e.g. Drive) after each session;
  never the repo.
- Pages must load with no internet: the font is self-hosted (step `self-host-font`).

## Why

Staff test a version that was already checked; the server folder never changes under a live
count; the restaurant's internet is unreliable.

## Consequences

testing-plan "Beta setup (2026-10-28)"; steps `restaurant-pc` and `self-host-font`.

## Reopen only if

The restaurant PC is unavailable for a session, or the app moves to online hosting.

## Sources

ARCHITECTURE-HANDOFF-2026-10-21 (archived) item 3; ARCHITECTURE-HANDOFF-2026-10-25 (archived) "Beta, as changed on 10-24" and item 58; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 80-82.
