# ADR-084 A read-only login is refused every write, from write-permission

- Status: Accepted 2026-11-15; superseded in part by ADR-102 (the refusal lands with write-switches,
  before write-permission)
- Decided by: Naoki
- Supersedes: none (it places ADR-010's "management: read-only, with no exception")

## Context

cubic, on PR #59 (site-filter) after the merge: canUseSite lets a read_only login reach every site
(siteAccess.js), and no route refuses a read_only login's writes, so a management login can save
counts, stock receipts and sales edits at any site. ADR-010 says management is read-only with no
exception. Until write-permission (3zr) a logged-out request may also write anywhere (ADR-040), so a
guard on read-only logins alone would stand beside an open door.

## Decision

- write-permission (3zr) refuses every write from a login whose base role is read-only and that is
  not an admin: any /api request other than GET or HEAD, except logging in and out, gets 403 before
  the route runs.
- Reading every site stays (ADR-010's management bypass in canUseSite).
- No step before write-permission.

## Why

It closes the gap in the same step that closes the logged-out pass, at the cost of one middleware.

## Consequences

write-permission's spec gains the refusal and its tests. Its line "review-page actions stay
role-based" is corrected: recount orders check a role (canOrderRecount); allocations and finalize
check none today.

## Reopen only if

Management is given a job that writes (then it is a role with that switch, not read-only).

## Sources

PR #59 late cubic finding (siteAccess.js:46), listed in ARCHITECTURE-HANDOFF-2026-11-14 (archived);
ADR-010; architect chat 2026-11-15 (A0, "recs").
