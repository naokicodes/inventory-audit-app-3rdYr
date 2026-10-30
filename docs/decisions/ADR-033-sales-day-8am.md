# ADR-033 The sales day turns at 8am

- Status: Accepted 2026-10-30
- Decided by: Naoki
- Supersedes: none

## Context

Likod sells past midnight, so a calendar-date cut splits one night's sales across two days. The
old Google Sheet script cut Likod at 7am and Silingan at midnight. The app's Loyverse engine
(loyverse-preview-i) cut both at midnight. The Kitchen Sales page now replaces the Sheet.

## Decision

For sales only, a business day runs from 8:00am to 7:59:59am the next morning (Manila), the same
for every account and site. A receipt belongs to the Manila date of its receipt_date minus 8
hours. The default "today" is that business date.

## Why

One rule for everyone is simpler than per-site cuts, and nothing is sold between closing and 8am,
so 8am never splits a night.

## Consequences

- The Kitchen Sales page, the loyverse:matches report and the planned dashboard sneak peek share
  the engine, so all use 8am.
- Numbers for receipts between midnight and 8am differ from the old Sheet (Likod cut at 7am,
  Silingan at midnight) - expected.
- Sales area only. The roster/login business-date rollover (A6) is a separate, open question.

## Reopen only if

A site starts selling between midnight and 8am as a new day (breakfast service, 24 hours), or
the roster's rollover should match this one.

## Sources

Architect chat 2026-10-30 (Kitchen Sales finish); Step loyverse-preview-iv in session-status.
