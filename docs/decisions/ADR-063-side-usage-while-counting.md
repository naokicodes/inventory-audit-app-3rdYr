# ADR-063 Side sheets show usage while counting

- Status: Accepted 2026-11-14
- Decided by: Naoki
- Supersedes: -

## Context

Paper sheets have COOKED, INHOUSE and WASTE columns that nobody fills. Side sheets are not blind
and have no expected value (blind-count spec). Usage = yesterday's ending + received - today's
ending (2026-09-28, B3 and Q3).

## Decision

- The counter enters the ending per item in any unit (fractions, and several parts such as "1 sack
  + 3 kg"), a one-tap out of stock, an optional remark and a PO quantity.
- As the ending is typed, the row shows Used = yesterday's ending + received - today's ending.
- The paper's COOKED is that usage less waste and staff meals or in-house, which come from their
  own entries (ADR-026) and show once those entries exist.
- Received is typed by the counter until arrivals (A9) fill it.

## Why

Naoki: COOKED was for usage. Kitchen cooks never see their own meat usage, but on veggies and
pantry an approximate usage while counting is fine and useful.

## Consequences

Step side-sheets.

## Reopen only if

Side sheets get an expected value.

## Sources

Architect chat 2026-11-14 (A8 Q5, R2).
