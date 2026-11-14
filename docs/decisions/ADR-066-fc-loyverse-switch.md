# ADR-066 FC on Loyverse; Kitchen Sales switches between POS groups

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

The docs knew two Loyverse accounts (Silingan, Likod). FC has a third; its token is not set yet.
FC's dishes and recipes are in the app, but its menu has changed since that list was made.

## Decision

- FC's Loyverse account joins as `LOYVERSE_FC_TOKEN` in `.env`; the restaurant PC script asks for
  it.
- Kitchen Sales gets a switch above the date: Silingan + Likod on the left, FC on the right.
- FC's side lists items sold, grouped by FC's own Loyverse categories, so the pizzaman finds Pizza
  there.
- Matching FC's items to FC's dishes (for the landing's expected values) is a later step.
- Each bar's items are checked against its own restaurant's account.

## Why

Naoki asked for a light-switch view per POS, and FC's pizza stays on paper (ADR-065).

## Consequences

Step loyverse-fc; fc-dish-map planned. Kitchen Sales stays open: no money, no stock (ADR-041).

## Reopen only if

A site's sales move to SPOS.

## Sources

Architect chat 2026-11-14 (FC token, switch, A8 Q7).
