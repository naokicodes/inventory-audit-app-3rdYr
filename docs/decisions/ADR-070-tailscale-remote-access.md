# ADR-070 Remote access through Tailscale

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

The app runs on the restaurant PC (no cloud hosting). Some people need it away from the
restaurant's Wi-Fi.

## Decision

- Phones away from the restaurant reach the restaurant PC through Tailscale: same server, same
  port.
- The PC's firewall rule lets in the local network and Tailscale's range (100.64.0.0/10), on the
  private and public profiles (Windows may class the Tailscale adapter as public).

## Why

No hosting bill and no port forwarding; Tailscale already carries the autopilot previews.

## Consequences

restaurant-pc (PR #47) changes its firewall rule. Tailscale can give the PC an HTTPS name later
(Tailscale Serve), which phone notifications need (ADR-068). Answers the Tailscale part of the
open question on Marble and Tailscale.

## Reopen only if

The app moves to cloud hosting.

## Sources

Architect chat 2026-11-14 (PC as server, five people, Tailscale).
