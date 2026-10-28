# ADR-015 Blind counting and the quiet recount

- Status: Accepted 2026-10-28
- Decided by: Naoki
- Supersedes: none

## Context

On paper the kitchen counter already never sees an expected number. Seeing it anchors a count.

## Decision

- **Blind applies to the restaurant meat landing only.** Counters enter endings and remarks;
  they never see beginning, new stock, sales, in-house, allocations, expected or variance. The
  server strips them, not just the page.
- Blindness is derived from role flags (checker is blind; head-chef, admin, super-admin and
  management see) until the supervisor role adds an explicit flag. No user = blind.
- **Not blind**: the commissary (never: trusted, batched freezer counts), the Likod grill
  landing (until it has a head), the bar (ADR-025). Side sheets have no expected value.
- **Every save is kept.** A later change is an edit with history (the paper's "12+6").
- **Recount**: the head chef (or an admin) ticks items and picks a person, told in person. Only
  those items are recounted; the recount is blind and becomes the count; the first stays in
  history. The first counter may be picked, with a warning. Orders only before finalization.
- **Two devices**: last save wins, both are kept, "changed by" shows.
- Before the roster exists, anyone with count permission at the site may count.

## Why

Paper is already blind; a recount finds errors without blame.

## Consequences

Step `blind-count` (queue 3za).

## Reopen only if

Counters routinely need the expected figure to count at all.

## Sources

ARCHITECTURE-HANDOFF-2026-10-22 (archived) items 2-3; ARCHITECTURE-HANDOFF-2026-10-25 (archived) items 39 and 42; the 2026-10-28 architect conversation (handoff 2026-10-28 and its roster addendum), items 67-71, 75, 77, 78.
