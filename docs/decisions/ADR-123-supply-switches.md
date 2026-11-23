# ADR-123 Four supply switches: edit_suppliers, purchase, check_runs, receive

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: none

## Context

Roles are per site and a new power is a switch, never a role column (ADR-034); the six built-in roles
keep their names (ADR-083). The A9 steps need four new powers.

## Decision

- `edit_suppliers`: edits the supplier list and sorts items (step suppliers). Default: supervisor and
  head-chef.
- `purchase`: has a run of their own (step purchaser-run). No default: an admin makes a "Purchaser"
  role with it on the Roles page and gives it to the purchasers.
- `check_runs`: sees every run and marks it checked (step purchaser-run). Default: supervisor.
- `receive`: the receive screen at a site (step receive). Default: supervisor and head-chef; the
  podium gets it through a role an admin gives.
- The supplier list and the runs belong to no one site: edit_suppliers, purchase or check_runs held at
  any site is enough. receive is checked at the site received for.
- Each step adds its own switch, its default set (applied once per database) and its line on the Roles
  page. Admin implies all; read-only roles are refused every write (ADR-084).

## Why

The people who do the work get the power by default; the purchasers' role is the only new one, and it
is an ordinary role, not a built-in.

## Consequences

Steps suppliers, purchaser-run, receive. The people import before the purchasers' and the podium's
logins reach the PC.

## Reopen only if

The supplier list or the runs need a switch per site.

## Sources

Architect chat 2026-11-23 (A9 round 2, question 12: "recs").
