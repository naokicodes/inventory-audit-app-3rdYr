# ADR-098 Sign the cookie now; one shared password for admin accounts

- Status: Accepted 2026-11-17
- Decided by: Naoki
- Supersedes: none (moves sign-the-cookie ahead of write-permission, against the 2026-11-12 order)

## Context

Fable run 1 (PERM-07): the login cookie is the plain user id. Typing `user_id=1`, or picking the
super-admin on the login page, passes every admin gate: Settings, the Roles page, the admin
commands. sign-the-cookie was queued after write-permission because "until then nothing depends on
who you are"; since settings-guard, role-assignments and roles-page that is no longer true.

## Decision

- The cookie is signed now: step sign-the-cookie runs before beta-3, not after write-permission.
- Picking an account whose base role has admin (admin, super-admin) asks for one shared admin
  password. It lives in the restaurant PC's `.env`, never in the repo; the launcher's setup asks
  for it.
- Every other account keeps pick-your-name (ADR-040's Beta trade-off) until real logins before Live
  (ADR-011).
- The login reads a user id the way the site guard reads ids (ADR-074): whole numbers only.

## Why

The admin pages change costs, recipes, roles and sites. On the Wi-Fi and over Tailscale, a typed
number must not be enough to do that.

## Consequences

sign-the-cookie gains a 2026-11-17 decision block (the password, where it lives, what the login
page shows); restaurant-pc-ii's setup asks for the password. ADR-103 depends on this landing.

## Reopen only if

Real per-person logins land (the shared password then goes).

## Sources

docs/reviews/fable-2026-11-17-1-permissions.md (PERM-07); architect chat 2026-11-17 (answer 12).
