# ADR-116 A replaced meat is hidden, never deleted: Forequarter replaces Shortplate

- Status: Accepted 2026-11-23
- Decided by: Naoki
- Supersedes: none

## Context

Silingan's new Kare-Kare (D044) had a placeholder meat (fc-landing-lines). Naoki: its meat is
Forequarter, which replaces Shortplate, so Braised Beef Short Plate, Beef Short Plate Nilaga and
Kare-Kare all use it. The commissary's meats change over time too, so the core must handle new and
changed meats.

## Decision

- A meat is never deleted. When one replaces another, the admin adds (or renames) the new meat in
  Settings, moves each dish's recipe line to it, and hides the old one (active off).
- Settings already does this. A recipe change closes the old line and opens a new one from that day,
  so past days keep the old recipe. A hidden meat leaves the count sheets, the month opening and the
  pickers; past counts keep its name. The commissary's meats work the same way.
- Forequarter: Silingan's "Kare-Kare meat" (M12) is renamed Forequarter; the three dishes' recipe
  lines use it, 0.2 kg per serving each until the real grams; Shortplate (M05) is hidden. The
  commissary adds Forequarter and hides its Shortplate. Forequarter is on trial now: these changes
  are made at the official switch (Naoki).
- The seed has no history, so it simply carries Forequarter and no Shortplate (step forequarter).

## Why

Old counts and sales keep their meaning, and a meat that comes back is switched on again.

## Consequences

Step forequarter (seed data only), after the official switch. The admin guide (A16) gets "When a
meat changes". The restaurant PC's and the laptop's databases change in Settings, not by the step.

## Reopen only if

A meat changes while stock of the old one is still on hand and must be carried over (a conversion).

## Sources

Architect chat 2026-11-23 (answer 7, the Shortplate question, and the later grams answer).
