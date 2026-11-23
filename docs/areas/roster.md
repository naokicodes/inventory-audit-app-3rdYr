# Roster

Status: IRL Confirmed (Silingan, the Nov 16-22 sheet and the 11-17 message), Written (Likod, FC) - FLOW Drafted (Fill, 2026-11-16) - APP Specced (ADR-096, roster-fill)

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
- 2026-11-15 (Naoki): a Silingan supervisor makes Silingan's roster; the main supervisor (the
  highest) runs FC's and Likod's schedules and lends Silingan people to them, and makes the
  payroll (money.md). Confirmed 2026-11-15: two people; this replaces the 10-28 note above
  that one supervisor makes all three.
- OJT are not on the roster.

**Silingan's sheet now** (source: Silingan's supervisor's Excel roster, four weekly tabs from Oct 19
to Nov 22, sent in the 2026-11-15 architect chat; the week of Nov 16-22 transcribed here, people by
role only):
- One tab per week, Monday to Sunday; tabs are reused, so a tab's name can be an older week.
- Rows, with times in some labels: Jr. Supervisor; App. Supervisor; Cashier; Head Chef/Disp
  9AM-10PM; Cold Station 12-11PM; Kitchen, split into shift rows - Opener 9AM-8PM, Mid-shift
  11AM-10PM, Mid-shift 1PM-11PM, Closer 2PM-12MN (three closers, the commissary person one of them);
  Kitchen Scullery 12NN; Pizza/Bread; Bar; Dining - Opener 9AM-8PM, Mid 12NN-9PM, Closer 3PM-10PM;
  Function; Podium; Food Server; Commissary 9AM-3PM; Bus - Opener 10AM-8PM, Mid-shift 12NN-9PM,
  Closer 3PM-11PM; Scullery 10AM, 11AM and 1PM.
- Each cell: a person and their break ("BRK 1-2PM"), mostly the same all week; Break Time rows sit
  between the stations.
- Day offs fall only Monday to Thursday (5 to 9 people a day, in a Day Off block at the bottom).
  Friday to Sunday everyone works, so those rows hold more people, and the three days are the same.
- A cover shows in the person's own slot with the station ("(BAR)", "(PODIUM)"), or in red at the
  station covered. On the head chef's day off the cold-station head chef works "opener-closer", and
  the other way round.
- The commissary person works the commissary and is also a kitchen closer the same day; whoever
  covers his day off does both.
- Bottom rows: Day Off, Leave ("LEAVE: <name>"), Floater (a part day, "9-12NN"; someone at Likod
  that day), then Present, Day-offs, Leave and Head count, typed by hand.
- The October tabs had no kitchen shift rows (one kitchen person per row); the shift rows are new in
  the latest week.

**How he builds it** (Naoki, 2026-11-15): day offs first - who is off each day of the week - then the
leave slips already handed in, then placing everyone by their main station and the stations they
cover. Shifts are opener, mid or closer; nobody opens the day after closing: a closer keeps closing
until a day off, then can open. It takes him a long time; the app should place people for him.
People without a login (waiters, for now) still go on the roster.

**The daily roster message** (source: Silingan's message for 2026-11-17, sent by Naoki on 11-17;
a private copy is in his assets folder, staff names only there). The supervisor shares the roster as
a text message to the staff every day:
- The date and day; then each station with its people, the shift times (opener, mid-shift, closer,
  with the hours) and each person's break; a take-over during a break is written with it (someone
  takes the cashier or the bar during that person's break).
- The function jobs are written like stations: Podium, Food Server, Purchaser (8am-2pm),
  Commissary (9am-3pm). Function (the separate function building) can be empty.
- The uniform for the day; the rest days; then Total Present, Total Day-off, Leave and Head Count
  (Present + Day-off + Leave; that day 21 + 8 = 29, every person on the roster).
- That day: the person covering the commissary person's day off did both his jobs (the commissary
  in the morning and a kitchen closer later, with shorter hours); the cold-station head chef worked
  opener-closer on the head chef's day off; one person held three jobs (assistant supervisor,
  purchaser in the morning, food server in the evening); a waiter opened Dining and also held the
  Podium.
- The names and times differ a little from the Excel sheet: "Expo / Cold" and "Head Chef /
  Dispatch"; Dining 9am-8:30pm, 12-9:30pm and 3pm-11pm; the Bus closer 2pm-11pm. Breaks change from
  day to day.
- 2026-11-17 (Naoki): Silingan's supervisor sets everything on Silingan's roster, the kitchen's day
  offs included; the head chef's list (10-28) is a recommendation. Function normally has one
  person for prep, backed by the waiters during service when it is full; there is no official
  person for it.

## FLOW - how they will use the app (drafted)

Redrafted 2026-11-16 (ADR-096); it replaces the 11-01 draft.

1. Before Monday, the supervisor opens next week: "Start the week" copies last week's day offs.
2. Day offs: he changes who is off each day (usually Monday to Thursday).
3. Leave: from the slips already handed in - person, from and to, leave or sick.
4. Fill: the app places everyone else by main station and shift (never an opener the day after a
   closer), covers short rows with people who cover those stations, and shows what is still short
   in red.
5. He fixes the rest by hand (a person can hold any number of jobs that day); a head chef given the
   kitchen switch can edit her kitchen people's days. A note for the day (the uniform) goes at the
   top. On a computer the week looks like his sheet, and it prints.
6. Each day, changes as they happen: a day off swapped, absent (the supervisor's arrival check),
   sick, leave, a cover, a day at another restaurant, a part day.
7. Any time before closing (preferably in the morning), the head chef or a supervisor picks
   tonight's kitchen counter and anyone doing commi work (see who-does-what.md).
8. At count time, people pick their name; tonight's people are listed first.
9. The day's Present count prefills the staff-meal head count.

## APP

- Decided: ADR-013 (the roster), ADR-034 (roles per site), ADR-035 (the landing is the head-chef
  role), ADR-036 (the 8am business day), ADR-037 (placements, copying, picks, access).
- Specced 2026-11-01 (queue 3zi to 3zr): business-day, role-assignments, roles-page,
  roster-stations, roster-staff, roster-week, roster-day-status, tonight-picks, login-tonight,
  write-permission. Built since: business-day (PR #55), role-assignments (#78), roles-page (#83).
- Decided 2026-11-17 (ADR-107): any number of jobs a day; Purchaser is a station; Function's minimum
  0; a cover also gets the covered person's "also works" job; the supervisor sets all day offs and
  the kitchen switch stays an option; a note per day; take-overs written in the break. Each roster
  spec has a 2026-11-17 block.
- Stations and staff are data (the workbook import and the Staff page); nothing about real people
  is in the repo.
- Likod's roster starts when Likod becomes a site (A12); the same features apply.
- 2026-11-15 (ADR-090): a read-only roster board across sites (Mon-Sun, who is off or away) for
  supervisors and management. Planned: roster-board, after roster-day-status.
- Specced 2026-11-16 (ADR-096): shift rows and minimums per station, usual break and "also works",
  two placements a day, Start the week (day offs only), leave as from-to dates, the paper-like week
  view, and Fill (step roster-fill). FC gets the same; Likod waits for A12.

## Open questions

- 2026-11-23 (ADR-114): the roster is the first staff test at the restaurant PC, with Naoki and the
  supervisor; its pages get the staff-friendly pass first (ADR-115).
- How the supervisor shares the roster: answered 2026-11-17 (a daily text message, above).
- Silingan's stations, rows, minimums and people are drafted in the private notes (2026-11-16). Naoki
  (2026-11-22): build with the draft; the supervisor corrects names, times and minimums on the Staff
  page after the update.
