# ADR-110 A device away from the restaurant gets the restaurant PC as a Tailscale share

- Status: Accepted 2026-11-22
- Decided by: Naoki
- Supersedes: ADR-103 in part (how a device joins: a machine share, not an invite)

## Context

FC first (beta-3): FC's head chef counts FC's landing and checks FC's sales at FC, so a device at
FC must reach the restaurant PC (ADR-070). ADR-103 says devices on the restaurant's tailnet are
invited one by one. But a user invited into a tailnet reaches every machine on it by default, and
the tailnet also holds the builders' laptops and their previews.

## Decision

- The restaurant PC joins the tailnet of the person in charge of the app, with Tailscale set to
  run unattended and the PC's key expiry off.
- A device away from the restaurant gets the restaurant PC as a shared machine (Tailscale's machine
  sharing), one person at a time. A share reaches only that machine, and the shared machine cannot
  reach back.
- Staff are never invited into the tailnet as users.
- A device with the share counts as inside the restaurant for ADR-040, as ADR-103 says of an
  invited one. ADR-103's condition (ADR-098 before a device outside the restaurant) is unchanged.
- Its link is the PC's Tailscale address on the app's port.

## Why

The person reaches the app and nothing else, and revoking one share removes one person.

## Consequences

docs/official/running-the-app.md describes it. The setup's firewall rule needs Tailscale's range
(the launcher since 2026-11-14), so a PC set up before that runs the setup again (the restaurant
PC does so at beta-3).

## Reopen only if

The app moves to hosting, or Tailscale changes what a share allows.

## Sources

Architect chat 2026-11-22 (evening: the Tailscale answer); Tailscale's documentation, "Share your
machines with other users" and "Inviting users vs sharing a device".
