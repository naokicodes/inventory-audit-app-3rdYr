# ADR-127 Windows Update stays off on the restaurant PC; a monthly update by hand

- Status: Accepted 2026-11-26
- Decided by: Naoki
- Supersedes: none

## Context

The 11-23 handoff asked Windows Update's active hours, because a restart stops the app and can miss
the 3 PM and 3 AM backups. Naoki: Windows Update is turned off on the restaurant PC.

## Decision

- It stays off: no surprise restart stops the app or a backup.
- Once a month, at closing: `restaurant-pc.bat backup`, then Windows Update by hand and a restart (the
  app comes back by itself after restaurant-pc-ii's auto-start).
- A16's PC guide (docs/official/running-the-app.md) gets a "Once a month" part.

## Why

The PC is on the cashier network and reachable by FC's phone through Tailscale: months with no
security fixes are a risk. A planned update at closing keeps it, without the restarts.

## Consequences

A16: the "Once a month" part of the PC guide.

## Reopen only if

The app moves to a host, or Windows forces updates back on.

## Sources

Architect chat 2026-11-26 (question 14; Naoki: "Turned Off", then "OK" to the monthly update).
