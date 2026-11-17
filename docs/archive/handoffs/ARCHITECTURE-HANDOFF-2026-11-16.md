> **ARCHIVED 2026-11-17 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-17 (Fable): five read-only reviews of `2cb16ee`, reports in `docs/reviews/` (91 findings, two
>   at P0). Main did not move during the runs. The 11-17 architect chat sorts them into fix steps and
>   ADRs (session-status, 2026-11-17 block).
> - "Marble may build overnight": nothing was built. business-day had closed on 11-02 (PR #55,
>   `cd50d51`; run 3's C-02), and roster-stations was not started.
> - "Still open" (11-17 opening prompt): answered - 1 (the roster goes out as a daily text message),
>   2 in part (free disk space), 3, 4 in part (a default budget per meal that an admin can change; two
>   meals a day at every site), 5 in part (Likod uses the same payroll template), 6 and 7. Still open:
>   the check of the stations draft, cable or Wi-Fi and the network names, meal names, rice and sack,
>   how long the payroll takes, the photos and the prices workbook. Recorded in `docs/areas` by the
>   11-17 chat.

# Architecture Handoff - 2026-11-16 (#84, FC map, roster Fill, A5, Fable prep)

**Lead, not source.** Checked against `origin/main` at `2cb16ee` (748 tests, AUDIT CLEAN on `aa7e332`; docs only
since). Session-status still wins. Replaces `ARCHITECTURE-HANDOFF-2026-11-15.md` (archived in the repo by the 11-15
drop-in, `32b6747`). The next architect chat's first drop-in archives THIS file word for word (banner + timeline row).
The next chat's opening prompt: project doc `claude/NEXT-CHAT-PROMPT-2026-11-17.md` (also in
`Desktop\Naoki\AuditApp-Assets\exports`), with Naoki's answers filled in.

## State

- Landed 11-16: the 11-15 drop-in (`32b6747`: ADR-094 FC sales follow the landing, ADR-095 #84, landing-sales
  specced, beta-3 plan, roster IRL); **#83 roles-page merged** (`26b0522`, ADR-095 applied in `2a10ad4`);
  **#82 staff-meal-settings merged** (`f49e5f4`); **drop-in 2 pushed as `2cb16ee`** (ADR-096 roster Fill, ADR-097
  runs without a coder, A5 scope.md rewritten, roster holds lifted + decision blocks, roster-fill spec,
  restaurant-pc-ii auto-start, receipts and in-house slip IRL). No PR open at 21:20.
- Marble may build overnight (business-day, then roster-stations), each stopping at Ready: **no merges before the
  Fable runs.** Merge them after the fix steps from the reports are placed.
- Restaurant PC: nothing installed; installs fresh at **beta-3** (#83, landing-sales, restaurant-pc-ii merged,
  smoke list passed). Newest tag beta-2.
- Fable runs Tue 17 Nov morning (ends 3:59 PM Manila): prompts in project doc `claude/FABLE-PROMPTS-2026-11-17.md`
  (and `AuditApp-Assets\exports`); plan `claude/FABLE-REVIEW-PLAN-2026-11-15.md`. Each report states the hash it
  cloned. Reports -> `docs/reviews/fable-2026-11-17-<run>.md`, pushed by Naoki.
- **The architect chat can be linked to Naoki's laptop** (Claude desktop app). Folder granted per chat:
  `Desktop\Naoki` (the repo is under `Coding Files\VScode\3rd Year\inventory-audit-app-3rdYr`). Assets:
  `Desktop\Naoki\AuditApp-Assets\{dropins,photos,exports}`. Drop-ins: write to `dropins`, apply in the repo from the
  device shell (a Linux VM): run git there only with `--no-optional-locks` (a git command that writes would leave
  .lock files: deleting is off), and diff with `-c core.autocrlf=true` (some docs are CRLF on the laptop; the VM
  does not read Naoki's Windows git config). Naoki commits and pushes from his own terminal (the VM has no GitHub
  login). `graphify-out/` is always dirty on the laptop: stage `docs` only.

## First drop-in of the next chat (besides archiving this file)

- Sort the Fable reports into steps and ADRs (A0 + A14b groundwork).
- Record Naoki's answers from the opening prompt (areas; figures and names in the private notes).

## Queue

- **Naoki:** landing-sales (runnable) -> restaurant-pc-ii (incl. auto-start) -> preview-pid -> beta-3 (smoke list,
  tag, PC install with the 11-15 steps; people import; the staff-meal values in Settings).
- **Builders, roster first (ADR-096):** 3zi business-day (any time) -> 3zl roster-stations -> 3zm roster-staff ->
  3zn roster-week -> 3zo roster-day-status -> roster-fill -> 3zp tonight-picks. One schema step at a time.
  Then cost-guard -> side-sheets -> supply-tags. Fable fix steps (P0/P1) go ahead of the roster.
- Planned: fc-dish-map, side-waste, bar-links/check/shorts, supplier-orders, buyer-list, arrivals, bills,
  meat-request, sides-valuation, site-picker, blind-history, no-popups, roster-board, name-map-settings (ADR-097).

## Decided 11-15 / 11-16 (all recorded)

- ADR-094 FC's sales follow its landing (landing-sales; the map and takes in meat-landing.md).
- ADR-095 Roles page details (#84).
- ADR-096 Roster: shift rows, day offs first, Fill; ADR-097 runs without a coder; A5 scope.md.
- Recs accepted for the whole 11-16 list (41 items): see session-status 2026-11-16 block.

## Still open from Naoki (all in the next chat's opening prompt)

1. Roster: how Sir Ralph shares the roster; his check of the private stations draft.
2. Restaurant PC: cable or Wi-Fi; the network names; free disk space at install.
3. FC: Silingan's and Likod's pizza category names (default PIZZA); is "PORK 150grms (Add ons)" the pork pancit.
4. Staff meals for beta-3's Settings: budget per meal, meal names per site, rice cup weight and sack price.
5. Money (A13): where Likod's staff are paid; how long the payroll takes.
6. A9 receipts: which receipts go through the main supervisor.
7. In-house orders in Loyverse, and where the name goes.
8. Photos: podium logbook, waste paper; the two unreadable Drive photos (PicturesForWork …204147, …204221).
9. Prices workbook progress.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Next: the Fable reports** |
| A5 | `scope.md` rewrite | DONE 11-16 (`2cb16ee`) |
| A6 | Roster | Fill decided 11-16 (ADR-096); specs on main |
| A8 | Veggies, pantry, bar sheets | specs once side-sheets lands |
| A9 | Orders, arrivals, bills, prices | receipts flow told 11-16; questions open |
| A11 | Pizza station | Parked (Naoki interviewing) |
| A12 | Likod as a site | Parked (Naoki interviewing) |
| A13 | Money and operating expenses | payroll template recorded; export after the roster |
| A14b | Harvest: topic ADRs + slim session-status | after the Fable reports (run 3 is the groundwork) |
| A15 | Dashboards: cards and a builder | after about five cards |

## Project files after this

Keep: this handoff, the next-chat prompt, `architect-notes-PRIVATE.md`, the AREAS-PRIVATE-NOTES files (10-24, 10-28,
11-01, 11-12, `claude/` 11-15, `claude/` 11-16), the Fable plan and prompts (delete after the runs), the Excel
workbooks.
