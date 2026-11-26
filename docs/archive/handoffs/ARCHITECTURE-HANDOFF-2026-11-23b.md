> **ARCHIVED 2026-11-26 - history, not current.** Kept word for word for the
> reasoning and the record of what changed (no staff names to replace: the repo is public, ADR-009).
> Current state: `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline: `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-25: issue #98 answered as built (`b7bfbc7`); PR #97 (backup-restore) merged (`bf69c71`, closed
>   `23b6ae4`; 865 tests, SUITE GREEN, AUDIT CLEAN).
> - 11-26: `/naoki-qs restaurant-pc-ii` stopped before claiming: the spec had no "Edge states:" line
>   (dispatch-queue's 2026-10-22 rule). Drop-in 2026-11-26-01 adds it, with the laptop test install's
>   firewall-and-sleep question.

# Architecture Handoff - 2026-11-23b (evening: A0 #96, A9 round 2, beta-3.2 on the PC, PR #97 recovered)

**Lead, not source.** Checked against `origin/main` at `9d0d9b6` (drop-in 2026-11-23-03 pushed on top
of `16a524e`; 846 tests, SUITE GREEN, AUDIT CLEAN; the dry runs on LF and CRLF clones were identical and
the pushed files match their md5s) and `origin/naoki/backup-restore` at `c3095f2`. Session-status wins.
Replaces `ARCHITECTURE-HANDOFF-2026-11-23.md` (archived by drop-in 03, with one staff name replaced by
its role). The next architect chat's first drop-in archives THIS file word for word (banner + timeline
row; replace any staff name by its role). Its opening prompt: project doc
`claude/NEXT-CHAT-PROMPT-AFTER-2026-11-23b.md`.

## State

- `origin/main` = `9d0d9b6`: drop-in 03 (A9 round 2) on drop-in 02 (`f0b1a3b`), PR #94 sign-the-cookie
  (`ffb6b74`, closed `c5a6eb5`), PR #96 token-diet (`12b5e65`, closed `16a524e`).
- **beta-3.2 tagged on `9d0d9b6`** (GitHub and the laptop agree) and **on the restaurant PC since
  23:07** (`update beta-3.2`: backup `beta_2026-11-23_2307.db` first, self-test 846 passed, AUDIT
  CLEAN; starts as "Version: beta-3.2"; no COOKIE_SECRET or ADMIN_PASSWORD warning, so both are in the
  PC's `.env`). The setup was not re-run: the launcher files did not change from beta-3.1 to beta-3.2.
  Not reported yet: the tablet check (Kitchen Sales logged out; an admin login asks the password).
- **PR #97 backup-restore: open, `c3095f2`.** `/naoki-qs backup-restore` built `b80f717` (863 tests,
  green; the six files of its spec's Touches; checked against the spec: VACUUM INTO with
  busy_timeout, integrity_check before the rename, 14 days + the first of each month, `.env` beside the
  backups only, `replaced_<stamp>\`, the `backup` and `restore` words, restore refused while the app
  runs, the two schtasks, `before-update-from-<PREVNAME>`, exit 2 = copy failed). A power cut at about
  18:40 stopped its review round with five files edited and not committed; the architect checked them
  (no damage, 865 tests green: a backup's name claimed by an exclusive `.part`, tidying and the
  `.env` copy only add notes, BACKUP_COPY_DIR resolved from the repo root, restore's no-database
  message) and Naoki committed them as `c3095f2` (copy of the diff:
  `AuditApp-Assets\exports\backup-restore-uncommitted-2026-11-23.diff`). Next: `/clear`,
  `/naoki-qs 97` (it reviews again and merges).
- Drop-in 2026-11-23-03 (`9d0d9b6`): ADR-119 to ADR-123; four specs (suppliers, purchaser-run,
  po-lines, receive); session-status' 2026-11-23 evening block; backup-restore's "Not in scope" names
  purchaser-run for photos; ADR-022, 059, 068 and 117 Status lines and README rows; the areas
  (supplier-orders, arrivals-and-bills, podium, money, veggies; map rows 7, 8, 11, 18); the 11-23
  handoff archived.
- **Smoke list on `9d0d9b6` (18:05-18:16, the architect in the laptop's built-in browser at 390px):**
  lines 1-5 and 7-11 pass (9 included; 11 with the real tokens). **Line 6:** the server is right, the
  page is not: Test Counter RA's Landing picker lists FC, opens on it and hangs on "Loading..." (again
  after every refresh); Test No Sites sees "Loading..." with no message - the planned site-picker
  step (ADR-091), not a regression. **Noted:** with FC's account failing,
  `/api/loyverse/preview?pos=fc` sends the landing lines with `sold: 0` instead of null; the page hides
  that table, so nobody sees a 0.

## Queue

- **Naoki's lane now:** the tablet check at the PC -> `/clear`, `/naoki-qs 97` (merge backup-restore)
  -> restaurant-pc-ii -> roles-guard -> save-safety -> cost-guard -> preview-pid; tag beta-4 on the
  laptop (ADR-114: the PC takes it only for a staff test). backup-restore's "You check" (Windows) runs
  on the laptop first.
- **Then:** the roster chain (roster-stations -> roster-staff -> roster-week -> roster-day-status ->
  roster-fill; the first staff test).
- **Then A9 (specced 11-23b):** suppliers -> purchaser-run (needs backup-restore) -> po-lines -> receive
  (needs cost-guard). Each touches `public/`: click-checker + ADR-115's pass. The tests need the PC on
  that tag and the people import (purchasers, podium).
- **site-picker** (planned, ADR-091; not specced): before the meat-count staff test (smoke line 6).
- **forequarter** after the official switch. **After:** stock-math, settings-safety, blind-reads,
  write-switches; the P2 Fable steps.

## Decided 11-23 evening

- A0: #96 matches its spec (cubic's fix inside the spec's own "what it gets"); #94's last commits test
  only; #97's built commit matches its spec (its final review is `/naoki-qs 97`'s).
- **Naoki: never give the purchasers more work** (buried with early-morning work). They never sort;
  their run replaces the logbook page, never both; on a test day Naoki types the run (ADR-122).
- ADR-119: one supplier list; main + optional backup per item; the sort screen; the cold-station head
  chef, the supervisors or the podium sort (Naoki collects the data); the main supplier sets
  how_bought; step order suppliers -> purchaser-run -> po-lines -> receive after the roster chain.
- ADR-120: "required numbers" = the amount to buy, typed; on hand (REM) optional; par later; catalog
  item or typed name; admin types for the tests.
- ADR-121: the receive screen; "All here", not "Approve" (ADR-045); Kitchen | Podium by category
  (Settings); weights ticked with a 0.5 kg leeway; Waiting rolls to the next day at 8 AM; + Extra; the
  run's receipt on its group (total only with see_costs).
- ADR-122: fares, tips, other as lines; short = cash left - counted, shown only (A13 for charges); the
  run's own list Silingan / Likod / FC until Likod is a site; photos optional, files beside the DB,
  mirrored once by the backup (D6), kept for now; a checked run is locked for its purchaser.
- ADR-123: switches edit_suppliers (supervisor, head-chef), purchase (a Purchaser role made on the
  Roles page), check_runs (supervisor), receive (supervisor, head-chef; the podium by a role).
- Chosen by the architect inside "recs" (say if wrong): money in centavos; a purchaser may change
  today's and yesterday's run; the photo backup sits in purchaser-run (backup-restore's spec already
  left photos to the step that builds them), not added to backup-restore; po-lines writes are
  admin-only until supplier-orders; the PO page's day starts on the next business day.

## Still open from Naoki

1. The answers that came through as "...": Forequarter's real grams and the official switch date; the
   commi's October "fore quarter" line; Windows Update's active hours; rice per tray, the sack's price
   and weight.
2. Money (A13): who covers a purchaser's short; the logbook's "cash out" lines; the tally's "AMD",
   "P.O" line and "comp"; one receipt for two restaurants.
3. Did PR #96 carry the click-checker's practice reply (Home at 390px)? (Not visible from the chat.)
4. A17: after two builds with the click-checker, compare their logs with the 11-22 report; `/context`
   optional.
5. Photos and workbooks: podium logbook, waste paper, two unreadable Drive photos; the prices workbook.
6. The people import at the PC (before blind-reads, and before the podium and purchaser tests).
7. site-picker's place in the queue (rec: spec it now, build it before the meat-count staff test).
8. The tablet check of beta-3.2 at the PC.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | #96 checked; beta-3.2 smoke list run and on the PC; #97 checked at `b80f717` + the recovered fixes. Next: #97 after `/naoki-qs 97`, then restaurant-pc-ii's PR |
| A9 | Orders, arrivals, bills, prices | **Round 2 DONE**: ADR-119 to ADR-123, four specs. Later: supplier-orders (counters' lines, the landing's cut, the picture), buyer-list, arrivals (move to the other restaurant, FC's direct meats), bills; the par |
| A13 | Money | ADR-117, ADR-122. Next: who covers a short, "cash out", the tally's lines; the payroll export after the roster |
| A17 | Claude Code token diet | token-diet merged. Next: compare two click-checker builds' logs |
| A18 | Staff-friendly pass (ADR-115) | the roster's pages first, picking the four colours; then the A9 pages; site-picker with the meat-count pages |
| A16 | Official docs | Next: rewrite with beta-4's messages (backup, restore); the admin guide ("When a meat changes", ADR-116; the Purchaser role, ADR-123) |
| A6 | Roster | specs complete; build after beta-4; the first staff test |
| A8 | Veggies, pantry, bar sheets | side-sheets parked until roster-fill |
| A11 / A12 | Pizza / Likod as a site | parked (A12 moves the run's "LIKOD" lines to Likod's code) |
| A14b | Harvest + refresh architect-notes-PRIVATE.md | its delivery lines are from 11-16: add the laptop apply, LF + CRLF dry runs, md5 check, staff names out of archived handoffs; the smoke-list method and the power-cut recovery below |
| A15 | Dashboards | after about five cards |
| Later | Full visual pass; HTTPS and a tab-free window; Floorplan | as before |

## Working notes (11-23 evening and night)

- The 11-23 handoff had a staff name in its working notes; the archive replaced it by its role (the
  repo is public). Keep names out of handoffs' text so the archive stays word for word.
- GitHub PR pages are refused from the sandbox; `git ls-remote origin 'refs/pull/*/head'` lists every
  PR's head (open or merged), which with `git log` on main is enough to tell open from merged.
- Drop-in 03 needed 38 anchors; all matched the first time on `16a524e`. Builder: `t03*.py` template
  modules evaluated, `repr()` into the script; LF and CRLF dry runs; md5 folded on the laptop.
- Naoki pasted the next-chat prompt with its "..." unfilled: treat them as "not known yet" and say so.
- **Smoke list method that worked:** Naoki starts the server in a separate VS Code terminal tab
  (`$env:DB_PATH = "server/db/dev.db"`, `$env:PORT = "3005"`, `npm run reseed`, `npm run seed:test`,
  `$env:COOKIE_SECRET`, `$env:ADMIN_PASSWORD` a throwaway word, `npm run dev`); the shell's values win
  over `.env` (`process.loadEnvFile` keeps existing variables). PowerShell deletes a variable set to
  "", so "no tokens" = the word "none" (each account fails: "-"); line 11 then needs a restart after
  `Remove-Item Env:LOYVERSE_*_TOKEN`. The architect drives the built-in browser
  (`mcp__remote-devices__Claude_Browser__*`): the pane is often hidden (viewport 0x0), so
  `resize_window` 390x844 first; one cookie jar for all tabs, so two-tab checks swap logins with
  `/api/auth/login`; month opening for a fresh dev.db by POSTing each meat's opening as Test Admin.
  Never click a Settings button that can `alert()`.
- **Power-cut recovery that worked:** `git status -sb` and lock files first (none were left); each
  modified file checked for NUL bytes and `node --check`; the diff saved to `AuditApp-Assets\exports`,
  staged into the sandbox, applied on a clone of the PR head and the suite run there; only then
  committed by Naoki with exact paths.
- At the PC, `update` refuses while the app runs ("[X] The app is running"); close the window first.

## Project files after this

Keep: this handoff, `claude/NEXT-CHAT-PROMPT-AFTER-2026-11-23b.md`, `architect-notes-PRIVATE.md`, the
AREAS-PRIVATE-NOTES files (10-24, 10-28, 11-01, 11-12, `claude/` 11-15, 11-16, 11-17, 11-22, 11-23,
11-23b), the Excel workbooks. Can be deleted now (drop-in 03 is pushed):
`claude/ARCHITECTURE-HANDOFF-2026-11-23.md`, `claude/NEXT-CHAT-PROMPT-AFTER-2026-11-23.md`, and the
older ones the 11-23 handoff listed, if still there.
