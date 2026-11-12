# Roster

Status: IRL Confirmed (Silingan), Written (Likod, FC) - FLOW Drafted - APP Specced

## IRL - how it works today

**Silingan's paper roster** (source: two photos, the week of Oct 12-18 and a later week, sent in
the 2026-10-28 architect chat; transcribed here so the photos are not needed again):
- One sheet per week, Monday to Sunday. Rows are stations, columns are days.
- Rows: Supervisor, Jr. Supervisor, Cashier, Head Chef/Dispatch, Cold Station, Kitchen, Kitchen
  Scullery, Pizza/Bread, Bar, Dining (opener / mid-shifter / closer / break-time rows), Function,
  Podium, Food Server, Commissary, Bus, Scullery.
- Bottom rows: the day-off list, Floater, Present, Day-offs, Leave, Head count. A signature block
  (the owners, the store supervisor, the jr. supervisors).
- Each cell holds a person, sometimes with a time ("10AM~", "12-9"). Colour legend: rest day, rest
  day but filled, sick leave, filled a station. Notes: leave with a reason, absent, working at FC or
  Likod that day.
- The sheet is built from each person's usual place: a temporary move shows in the person's usual
  slot. (A "COMMI" tag in the Kitchen block = that cook working the commissary that week while the
  regular commi person was on leave.)
- Meal head counts are written by hand (e.g. Lunch 20, Dinner 22 while Present says 21): people
  arrive late, so the cooks check the head count just before cooking.

**The workbook's roster tabs** (private templates workbook):
- Silingan's tab is an older week (September) with slightly different rows (Asst. Supervisor,
  Dispatch, Expo/Cold): station lists change over time.
- Likod: Pizza Chef, Griller, Cook, Bartender/Cashier, Barista/Waiter, Waiter, Scullery, Day off,
  totals. Likod has no cooks yet, only grillers; its podium job (receiving) is done by the cashier
  for now.
- FC: Cashier, Kitchen, Pizza, Bar, Dining, Alfresco, Scullery, Day off, totals. Shift times and
  breaks are written in the row labels. No supervisor or head-chef row.

**Who makes it** (chats 2026-10-28 and 2026-11-01):
- Silingan is the headquarters: a supervisor based there makes the roster for all three
  restaurants. Supervisors work from Silingan and Likod and visit FC (the smallest) for meetings.
- The head chef lists her kitchen people's days (who works, rest days) on a paper note. Every
  person has a main station and the stations they cover, so the rest follows. The supervisor puts
  it on the roster and edits it when problems come up.
- Weekly edits (swapping rest days, cancelling one for lack of people) are ordinary daily changes.
  FC changes least; Silingan and Likod change often (absences, sudden quits, medical).
- Sunday evening is weekly reports and the weekly wage.
- OJT are not on the roster.

## FLOW - how they will use the app (drafted)

1. On the weekend, a supervisor opens next week and taps "Copy last week": rest days and stations
   carry over; last week's one-offs (leave, sick, covers, days at another restaurant) go back to
   normal.
2. The head chef sets her kitchen people's days; the supervisor edits everything else.
3. Each day, changes as they happen: a rest day swapped, absent (the supervisor's arrival check),
   sick, leave with a reason, someone covering a station, someone working at another restaurant.
4. Any time before closing (preferably in the morning), the head chef or a supervisor picks
   tonight's kitchen counter and anyone doing commi work (see who-does-what.md).
5. At count time, people pick their name; tonight's people are listed first.
6. The day's Present count prefills the staff-meal head count.

## APP

- Decided: ADR-013 (the roster), ADR-034 (roles per site), ADR-035 (the landing is the head-chef
  role), ADR-036 (the 8am business day), ADR-037 (placements, copying, picks, access).
- Specced 2026-11-01 (queue 3zi to 3zr): business-day, role-assignments, roles-page,
  roster-stations, roster-staff, roster-week, roster-day-status, tonight-picks, login-tonight,
  write-permission.
- Stations and staff are data (the workbook import and the Staff page); nothing about real people
  is in the repo.
- Likod's roster starts when Likod becomes a site (A12); the same features apply.

## Open questions

- None from A6.
