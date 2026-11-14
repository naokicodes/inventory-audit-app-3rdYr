# ADR-080 Authorship: the last saver is stamped; the old field gets the name

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: user-id-authorship's "leave the old created_by TEXT as-is", for new writes on the
  restaurant count tables only

## Context

Issue #77 (PR #76, user-id-authorship). New writes stamp `created_by_user_id`. The spec did not say
who is credited when a count is saved again, and it said both "leave the old created_by alone" and
"remove the two allowlist entries" that only go away once that field is written. It also did not
say whether a person correcting a sync-filled prep number is credited.

## Decision

- A row saved again is credited to the last person who saved it: its number is theirs. Every save
  stays in count_entries (user and name), so the first counter is never lost.
- The restaurant count tables (ending_actual, portion_ending_actual) also get the saver's name in
  their old `created_by`, as the commissary side already does; the two "UNVERIFIED" allowlist
  entries are deleted. Old rows are not backfilled.
- A person correcting a prep number the sync filled in is credited in `created_by_user_id`;
  `prepped.created_by` keeps working as provenance exactly as today (NULL = typed by a person).
- History hides `created_by_user_id` like `created_by` (one line in public/history.html).

## Why

The stamp answers "whose number is this"; the history answers "who touched it". The write-path
audit's rule is to delete an entry once its write path lands.

## Consequences

PR #76 is complete as built; history.html joins its Touches (phone check of History still owed).

## Reopen only if

Management needs the first counter on the row itself.

## Sources

Issue #77, PR #76 (2026-11-14); architect chat 2026-11-14.
