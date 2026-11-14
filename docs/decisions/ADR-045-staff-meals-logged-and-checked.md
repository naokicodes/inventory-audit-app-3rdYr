# ADR-045 Staff meals: any cook logs, the head chef checks

- Status: Accepted 2026-11-11 (the grillers line 2026-11-12)
- Decided by: Naoki
- Supersedes: ADR-027's "one cook per meal logs" line only

## Context

ADR-027 had one chosen cook log each meal. Picking that cook is hard on busy nights, and
ADR-013 says the app supports people and never approves.

## Decision

- **One record per site, business day and slot.** Saving again updates it; history keeps who
  changed what. A second cook who opens a logged slot adds to that log.
- **Logging:** the "log staff meals" switch (ADR-034). Cooks hold it; at Likod the grillers do,
  because grillers are cooks - stations are titles that open sheets and grant no powers
  (ADR-037). The meal counts the moment it is saved.
- **Checking, never approving:** the "check staff meals" switch (the head chef). They mark a meal
  checked or fix it. A head chef's own save is checked automatically. An unchecked meal counts in
  every total; management sees which meals are unchecked.
- **Extra meals:** the head chef adds any number in a day (birthdays, events), each named. No
  budget; recorded for reports; anyone who logs can fill one in.
- **Copy a past meal:** its lines scaled by the new / old head count, editable, with a "copied
  from" link. Every meal has a short dish name.
- **Late logs:** logging covers the current business day. The head chef adds or fixes up to 3
  business days back, marked "logged late".
- **Cooking for another site:** logged at the site that cooked, with the combined head count.
- Meat lines leave stock through the existing allocation path ('Staff Meal / In-House', ADR-003);
  a fix writes a correcting row and never edits the old one.

## Why

Any cook can log fast; a check instead of an approval means nothing piles up when the head chef
is busy, and the totals are right at once.

## Consequences

staff-meal-log (the switches, the one-record rule) and staff-meal-check (checking, extra meals,
late logs, copying). Both switches go on the existing roles, so the existing test accounts cover
them (ADR-039).

## Reopen only if

Management needs meals held back until accepted, or a per-meal cook pick returns.

## Sources

Architect chat 2026-11-11 (items 16-20, Naoki's answers 17-20 and option A); architect chat
2026-11-12 (grillers are cooks).
