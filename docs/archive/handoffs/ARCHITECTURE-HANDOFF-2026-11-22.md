> **ARCHIVED 2026-11-22 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-22 (evening): #88, #90 and #91 merged (stale-saves, landing-sales, fc-landing-lines; main at
>   `55423ca`, 814 tests). "Restaurant PC: nothing installed" was wrong: Naoki installed beta-1 there
>   on 11-13. beta-3 reaches it by update with a fresh beta.db, the old one kept aside; the install
>   guide is `docs/official/running-the-app.md` (A16's install part). FC's device gets the PC as a
>   Tailscale share, not an invite (ADR-110). Answers to "Still open": 1. a share either way (the
>   device is still to say); 2. Git 2.56.0 and Node 24.22.1 (the rest still to check); backups stay
>   on C: only for now. See session-status' 2026-11-22 evening block.

# Architecture Handoff - 2026-11-22 (A0 #85-#87, the beta-3 specs, the 11-17 answers, FC first)

**Lead, not source.** Checked against `origin/main` at `934f170` (780 tests, SUITE GREEN, AUDIT CLEAN),
plus drop-in 06 (FC first), applied in Naoki's repo for him to commit. Session-status wins. Replaces
`ARCHITECTURE-HANDOFF-2026-11-16.md` (archived in the repo on 11-17, `4a25ce9`). The next architect
chat's first drop-in archives THIS file word for word (banner + timeline row). Its opening prompt:
project doc `claude/NEXT-CHAT-PROMPT-AFTER-2026-11-22.md`.

## State

- Landed 11-22 (drop-ins 01 to 05, on main as `74340fd`, `8cdf5d3`, `934f170`): ADR-106 to ADR-109;
  specs for backup-restore, the restaurant-pc-ii respec, fc-landing-lines, roles-guard, save-safety
  and cost-guard's 2026-11-17 block; the roster specs' 2026-11-17 blocks; Fable run 3's docs fixes
  and run 2's notes; the areas (roster message, purchaser's logbook, cashier's tally, receipts by
  kind, payroll, rice, two meals a day); session-status' 2026-11-22 block; smoke list lines 9-14.
- Drop-in 06 (FC first) is applied in Naoki's folder, not yet committed:
  `2026-11-22-06-commit-message.txt`. Check `origin/main` for it first.
- Merged 11-22: **#87 db-start** (`8a74e8a`, with a cubic fix), **#85 npm-audit** (`cd7054c`, the
  second pass, ADR-106). Issue #86 closed.
- **PR #88 stale-saves**: built, 793 tests green on my run. Issue #89 answered (authorship.test.js
  joins its Touches on main); Naoki closes #89 with gh if not done. Waiting: his phone check of the
  commissary Notes box, then `/naoki-qs 88`.
- Marble was offline on 11-22; Naoki builds the lane himself.
- Restaurant PC: nothing installed. Installs fresh at beta-3 (FC first). Not checked yet: auto
  sign-in after a restart, E: on a separate disk, git and node, Windows Update active hours.
- Claude Code usage: one `/naoki-qs` session reached 268k of context (228k of it messages) on the 1M
  window and Naoki hit 100% of his limit. One step per session, `/clear` right after, medium effort
  for routine builds.

## Queue (FC first: dispatch-queue's later 2026-11-22 note)

- **beta-3:** #88 stale-saves (merge) -> landing-sales -> fc-landing-lines -> smoke list lines 1-8,
  10, 11 -> tag beta-3 -> install with today's launcher (the three Loyverse tokens; the 11-15 steps;
  the 11-22 checklist where it applies) -> Tailscale for FC's device, so FC's counter can test FC's
  sales at FC.
- **beta-4 (by update):** sign-the-cookie -> backup-restore -> restaurant-pc-ii -> roles-guard ->
  save-safety -> cost-guard -> preview-pid. After `update beta-4`, run the repo's
  `scripts\restaurant-pc.bat` once with no word (the stub launcher arrives with restaurant-pc-ii).
- **After:** Marble's roster chain (each spec's 2026-11-17 block first), stock-math,
  settings-safety, blind-reads, write-switches; the P2 Fable steps between roster steps.

## Decided 11-22 (all recorded)

- ADR-106 an audit fix may move a patch version inside package.json's range. ADR-107 any number of
  jobs a day; Purchaser a station. ADR-108 sheet finalization not planned. ADR-109 staff-meal lines
  may name a side item.
- Everything else (the recs for roles-guard, save-safety, cost-guard and backups; Kare-Kare D044
  and its placeholder meat; FC's 27 lines and two meals; the restaurant PC hosts only the app; FC
  first): session-status' 2026-11-22 block.

## Still open from Naoki

1. FC's counter's device (his own phone or an FC phone), and whether Tailscale is on the restaurant
   PC.
2. The AnyDesk checks before the install (auto sign-in, E:, git and node, active hours 8 AM-2 AM).
3. Kare-Kare's real meat and grams per serving (the placeholder "Kare-Kare meat" gets renamed in
   Settings).
4. Rice: raw rice per tray, the sack's price and weight (blocks nothing before staff-meal-log).
5. "ponytail": which tool he meant (he mentioned it beside graphify's auto-updates).
6. Money (A13): the logbook's "cash out" lines; who covers a purchaser's short; the tally's "AMD",
   "P.O" line and "comp".
7. Photos and workbooks: podium logbook, waste paper, two unreadable Drive photos; the prices
   workbook.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Next: the beta-3 PRs as they come**, then beta-4's |
| A16 | Official docs: the admin guide and "running the app" (C-19) | **The install part now** (today's launcher, for beta-3); the rest after backup-restore and restaurant-pc-ii are built, so it quotes their messages |
| A17 | Claude Code token diet | after beta-3: one step's session log (`%USERPROFILE%\.claude\projects\...` JSONL, copied into AuditApp-Assets\exports); graphify on or off; a slimmer dispatch-queue.md (15k tokens, read every pick); effort levels |
| A6 | Roster | specs complete (ADR-096, ADR-107) |
| A8 | Veggies, pantry, bar sheets | side-sheets parked until roster-fill; run 2's notes in its block |
| A9 | Orders, arrivals, bills, prices | receipts by kind answered 11-17 |
| A11 / A12 | Pizza / Likod as a site | parked |
| A13 | Money | payroll timing answered 11-22; the export after the roster |
| A14b | Harvest: topic ADRs + slim session-status | C-10, C-22, C-23, C-24, run 4's D2-D7; refresh architect-notes-PRIVATE.md |
| A15 | Dashboards | after about five cards |
| Later | Floorplan (haydenschmitty/floorplan, chat 11-20) | after beta-3 or beta-4 |

## Working notes (11-22)

- From the device shell, only read-only git (status, log, diff, show) with `--no-optional-locks`.
  **Never `git fetch`**: on 11-22 it wrote FETCH_HEAD and started auto-maintenance, which left
  `.git/objects/maintenance.lock` (moved to `Desktop\Naoki\_to_delete`; Naoki can delete that
  folder). Compare with origin from the container's fresh clone.
- `device_commit_files` once delivered an older copy when a file was re-sent from the same staged
  path. Stage each new version under a new path (outputs/v2, v3 ...) and check its md5 on the device
  before running it.
- Apply drop-ins only when Naoki's repo is on main and Claude Code is idle (`git status -sb` on the
  device first). Several drop-ins applied together get one combined commit-message file; Naoki
  commits with `git commit -F "<AuditApp-Assets\dropins\...-commit-message.txt>"`.
- The overnight runner (`Desktop\Naoki\autopilot-run`, scripts/run-queue.ps1) builds only steps a
  queue note opens to it; its JSON logs in `.run-queue-logs` carry each run's cost.

## Project files after this

Keep: this handoff, the next-chat prompt, `architect-notes-PRIVATE.md`, the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01, 11-12, `claude/` 11-15, 11-16, 11-17, 11-22), the Excel workbooks. Can be
deleted: `claude/ARCHITECTURE-HANDOFF-2026-11-16.md` (archived in the repo), `claude/NEXT-CHAT-PROMPT-2026-11-17.md`
and `claude/NEXT-CHAT-PROMPT-2026-11-22.md` (used), `claude/FABLE-PROMPTS-2026-11-17.md` and
`claude/FABLE-REVIEW-PLAN-2026-11-15.md` (the runs are done; the reports are in docs/reviews).
