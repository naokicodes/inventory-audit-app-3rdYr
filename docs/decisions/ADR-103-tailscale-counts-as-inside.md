# ADR-103 Tailscale counts as inside the restaurant for ADR-040

- Status: Accepted 2026-11-17; superseded in part by ADR-110 (a device away from the restaurant
  gets a machine share, not an invite)
- Decided by: Naoki
- Supersedes: none (answers ADR-040's "Reopen only if")

## Context

ADR-040 keeps the logged-out pass "while the app is only on the restaurant's Wi-Fi" and says to
reopen if it becomes reachable beyond it. ADR-070 then made it reachable through Tailscale, and
nothing recorded whether that met the condition (Fable PERM-13, C-18).

## Decision

- Devices on the restaurant's tailnet are invited one by one and count as inside the restaurant for
  ADR-040: the logged-out pass stays until write-permission.
- Condition: ADR-098 (the signed cookie and the admin password) lands before any device outside the
  restaurant joins the tailnet (the second builder's, after the beta-3 install).

## Why

An invited device is as trusted as a phone on the restaurant Wi-Fi; the admin password covers what
a typed id could do.

## Consequences

None beyond the order: sign-the-cookie before the second builder gets Tailscale.

## Reopen only if

The tailnet admits a device nobody vouches for, or the app gets a public address (then real logins
and write-permission come first).

## Sources

docs/reviews/fable-2026-11-17-1-permissions.md (PERM-13); -3-consistency.md (C-18); architect chat
2026-11-17 (answer 3).
