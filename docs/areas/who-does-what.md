# Who does what tonight

Status: IRL Confirmed - FLOW Drafted - APP Specced (pick-your-name login Built, PR #33)

## IRL - how it works today

- Every inventory station counts its own sheet every night and writes the first PO for its items.
  Silingan counts about 9:30-10:30pm; FC and Likod about 11:30pm-1:00am.
- **Two dispatches in the kitchen** (the head chef, 2026-10-28): cooks -> **Kitchen Window
  dispatch** (a cook; plating) -> **FOH Counter dispatch** (the head chef, helped by the cold
  station) -> the open counter (Expo, no person) -> servers.
  - The Kitchen Window dispatcher does all three kitchen inventories (meat, veggies, pantry) and
    their first PO lines while the other cooks clean. The head chef picks them daily, preferably in
    the morning, any time before closing.
  - The FOH counter does the landing, PO checks, shortages and allocation asks.
- **The landing is the head chef's.** A cook never does it. Silingan has two head-chef-level chefs
  (the head chef and the cold-station chef) and a house rule that one is always on duty, unless both
  are out for medical reasons; then someone is appointed (a supervisor, Naoki, very rarely a cook).
  FC and Likod have no head-chef row: Naoki appoints a trusted person at each, with a backup.
- Bar, pizza and FC scullery: whoever the roster puts on that station counts (if two are on, either
  one; the paper has a name and date box).
- Silingan and Likod scullery have no inventory (their items sit with the podium or the bar).
- Commissary: whoever is on the Commissary row; at Silingan the head chef also picks cooks for commi
  work on the day (e.g. backing up shortplate); at Likod all grillers (they all prep).
- Likod's podium (receiving) is done by its cashier for now.
- Supervisors check POs, counts and arrivals; they do not count.
- Sources: chats 2026-10-22, 2026-10-24, 2026-10-28 and 2026-11-01.

## FLOW - how they will use the app (drafted)

1. Any time before closing, the head chef (or a supervisor) picks tonight's kitchen counter in the
   Roster's "Tonight" panel; one pick covers all the kitchen sheets. Picks can be made the night
   before.
2. The same panel adds the day's commi picks.
3. At count time, staff pick their name (tonight's people first) on a phone or the shared tablet.
4. Home shows "your work tonight": the picked counter gets the kitchen sheets; someone on a
   non-kitchen station with a sheet gets it; standing access (Likod grillers -> commi, Likod's
   cashier -> podium) applies on days they work. Everyone else sees "No work for you tonight" and
   can still read every page.
5. Only those people may save. If the counter leaves early, the head chef picks another: the new
   person writes from then on, and saves already made keep their author.
6. The head chef (or the appointed person) does the landing: expected vs counted, allocations,
   quiet recounts.

## APP

- Decided: ADR-011 (write permission), ADR-012 (stations), ADR-014 (kitchen dispatch), ADR-017
  (commi access), ADR-034 (roles per site), ADR-035 (the landing is the head-chef role at the
  site), ADR-037 (picks, standing access, the login list), ADR-038 (blind by site role).
- Built: pick-your-name login and current user (stub-login, PR #33).
- Specced 2026-11-01: role-assignments (3zj), roles-page (3zk), tonight-picks (3zp), login-tonight
  (3zq), write-permission (3zr).
- Decided (ADR-012): an admin can close a sheet ("under maintenance"): it cannot be assigned, is not
  counted, never shows as missing, and keeps its history.

## Open questions

- PINs for staff before Live (decide later).
