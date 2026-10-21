# ADR-003 Staff meals recorded as quantities, not prices

- Status: Accepted 2026-10-20 (one check before building, below)
- Decided by: Naoki
- Supersedes: none

## Context

The kitchen started logging staff meals on paper in pesos, using prices worked
out in advance. Prices change and the cashier confirms the real ones, so
pre-priced logs drift. Since 2026-10-19, valuation uses the item's last billed
arrival unit cost, with the settings cost as the fallback.

## Decision

- Record staff-meal use as **quantities, never prices**.
- **Meats (core inventory):** exact grams or units, through the existing
  allocation path.
- **Sides (veggies):** an approximate kg per item. The side sheet's usage
  (beginning + received - ending) minus the staff-meal estimate is
  **"other usage"** (dishes, waste and counting error). Never label it dish
  usage.
- **Pantry:** excluded. It stays a basic expense with its variance.
- Pesos are computed by the engine at valuation time from the 2026-10-19 cost
  rule, so a price change never rewrites history.
- The app guides entry (kg on meats, one quick approximate field on sides). It
  assists; it does not enforce.

## Why

The quantity is the stable truth and the price is a moving valuation. This
matches the 2026-10-19 cost amendment and "pesos are computed here".

## Consequences / fits with

- **2026-09-15 sahog rule:** the no-standard residual stays one bucket labeled
  "unstandardized", never "staff meals". Explicit staff-meal entries are
  recorded entries, not the residual. Keep the two separate in every report.
- **Sides (2026-09-26/28):** simple counting, never through `auditEngine`. The
  paper's waste / inhouse / cooked columns were deferred as an optional richer
  layer.
- **Check before building:** is the side staff-meal estimate the paper's
  "inhouse" column? If yes, this activates part of that deferred layer rather
  than adding a new concept.

## Reopen only if

Approximate side figures prove too noisy for the staff-meal budget comparison.

## Sources

Architect conversation 2026-10-20; session-status 2026-09-15 (sahog), the
side-inventory entries, and 2026-10-19 "Supply, cost and SPOS integration".
