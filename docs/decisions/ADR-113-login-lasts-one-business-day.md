# ADR-113 A login lasts one business day

- Status: Accepted 2026-11-22
- Decided by: Naoki
- Supersedes: -

## Context

The login cookie has no expiry, so a login ends whenever the browser happens to drop it, and a
shared tablet can keep yesterday's person.

## Decision

- A login lasts until the next 8 AM business-day turn (ADR-036) or until Log out.
- The signed cookie carries its business date; the server reads an older one as logged out.

## Why

Staff log in once per shift, and a shared device never writes under yesterday's name.

## Consequences

sign-the-cookie gains a 2026-11-22 block (it changes the same file); its "cookie expiry" line was
not in scope before.

## Reopen only if

Real logins with passwords arrive before Live (ADR-011), or a site works across 8 AM.

## Sources

Architect chat 2026-11-22 (late: answer 4).
