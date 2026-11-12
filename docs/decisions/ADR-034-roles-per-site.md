# ADR-034 Roles per site and role switches

- Status: Accepted 2026-11-01
- Decided by: Naoki
- Supersedes: the stub-login decision "per-site / per-shift roles are not modelled" (issue #34,
  Q2, 2026-10-22); refines ADR-010

## Context

Each user had one default role, valid at every site they belong to. That cannot express an
appointed head chef at FC or Likod, a cashier who also has podium access, or supervisors based at
Silingan who work every site. Naoki wants permissions flexible and customizable, like Discord
roles, not rigid.

## Decision

- **Login is unchanged.** The account says who you are (pick-your-name now, passwords before Live
  on the same accounts). Roles say what you may do where.
- A person has a **base role** (their default role, at every site they can use) plus any number of
  **role assignments**, each at one site or at all their sites, with an optional end date. What
  they may do at a site = everything their live roles there allow.
- What a role allows is a set of **switches**, stored as rows, so adding one later needs no
  migration. The four existing flags stay; the first new switches are sees expected, edit roster
  (kitchen / all), pick tonight's people, and manage staff. A role with admin has everything; an
  inactive role grants nothing.
- An assignment at a site also gives access to that site. Memberships still decide where a person
  belongs (ADR-010).
- **Supervisor** is a sixth role: never counts; sees expected and variance; edits the whole roster;
  picks tonight's people; manages staff. All supervisors have the same access. Blocking one
  supervisor (ADR-013) = giving them a copy of the role without the roster switch.
- Later, on the same shape: turning one switch on or off for one person (Discord's per-member
  override), in Settings.

## Why

Real jobs differ by site and change often; switches and assignments let admins change access
without code.

## Consequences

Steps role-assignments (3zj) and roles-page (3zk). The blind rule follows the site's roles
(ADR-038).

## Reopen only if

Admins find the switches too hard to manage, or a role must differ per station rather than per
site.

## Sources

Architect chat 2026-11-01 (A6), answers B, 2, 12 and confirmation 1.
