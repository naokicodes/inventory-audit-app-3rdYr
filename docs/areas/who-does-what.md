# Who does what tonight

Status: IRL Written - FLOW Drafted - APP Decided (pick-your-name login Built, PR #33)

## IRL - how it works today
- Every station counts its own sheet every night and writes a PO for its items.
  Silingan counts about 9:30-10:30pm; FC and Likod about 11:30pm-1:00am.
- Kitchen has many people: the landing person or head chef picks who counts the
  kitchen sheets. Bar, pizza and FC scullery: whoever the roster puts on that
  station counts (if two are on, either one; the paper has a name and date box).
- Silingan and Likod scullery have no inventory (their items sit with podium/bar).
- The landing is done by one of two chefs at head-chef level (the head chef or
  the cold-station lead). Both are never off on the same day. The landing person
  does not count, except in rare emergencies.
- Supervisors check POs, counts and arrivals; they do not do the work.
- Sources: chat 2026-10-22 and 2026-10-24.

## FLOW - how they will use the app (drafted from chat; Naoki to confirm)
1. At closing the night before (or earlier), the landing person / head chef
   assigns tomorrow night's kitchen sheets. Bar, pizza and FC scullery are
   assigned automatically from the roster.
2. At count time, staff pick their name on a phone or the shared tablet.
3. A person with an assignment lands on their sheet(s). Anyone else sees
   "No work for you tonight".
4. Anyone may look at a sheet; only the assigned person (or someone rostered on
   that station) may type. Kitchen is strict: only the confirmed people.

## APP
- Decisions (handoff 10-24): write permission enforced, process not (4); new
  supervisor role (5); stations first-class for who-does-what only (6); login
  list = tonight's roster (12); assignments set in advance (24); landing is a
  kitchen job, assignable to a supervisor as a fallback (25).
- Built: pick-your-name login and current user (stub-login, PR #33).
- Not specced: staff table, tonight's assignments (sheet owner, sheets tier 2),
  supervisor role, login list from roster. Queue item A6.

- Decided (handoff 45, 54): an admin can close a sheet ("under maintenance"):
  it cannot be assigned, nobody counts it, it never shows as missing, and its
  history stays. If an assigned counter is absent, the landing person or a
  supervisor reassigns, any time before the count closes.

## Open questions
- PINs for staff before Live (decide later).
