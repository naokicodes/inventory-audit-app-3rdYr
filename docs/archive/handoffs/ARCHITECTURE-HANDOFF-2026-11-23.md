> **ARCHIVED 2026-11-23 - history, not current.** Kept word for word for the
> reasoning and the record of what changed, except one staff name in the working notes, replaced by
> its role (the repo is public, ADR-009). Current state: `docs/session-status.md`. Current decisions:
> `docs/decisions/` (the item map in its README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-23: drop-in 02 pushed (`f0b1a3b`); PR #94 (sign-the-cookie) merged (`ffb6b74`, closed
>   `c5a6eb5`); PR #96 (token-diet) merged (`12b5e65`, closed `16a524e`; 846 tests). A9's questions 5
>   and 6 answered that evening: the amount to buy, typed (ADR-120); the supervisors or the podium
>   sort, never the purchasers, who get no new work (ADR-119, ADR-122). A9's four steps specced
>   (ADR-119 to ADR-123). See session-status' 2026-11-23 evening block.

# Architecture Handoff - 2026-11-23 (beta-3.1 at the PC, the PC's rule, #95, A9 round 1, A17)

**Lead, not source.** Checked against `origin/main` at `cde088b` (drop-in 2026-11-23-01 on top of
**beta-3.1** `ac5b388`; 834 tests, SUITE GREEN, AUDIT CLEAN; all 22 changed files on `origin/main` match the
architect's LF and CRLF dry runs). Session-status wins. Replaces `ARCHITECTURE-HANDOFF-2026-11-22b.md`
(archived word for word in `cde088b`). The next architect chat's first drop-in archives THIS file word for
word (banner + timeline row). Its opening prompt: project doc `claude/NEXT-CHAT-PROMPT-AFTER-2026-11-23.md`.

## State

- **beta-3.1** = `ac5b388` (PR #92 sales-cache, PR #93 ui-shell, merged 11-22; both match their
  specs), on the restaurant PC. The Silingan icon shows after Add to Home screen.
- **Drop-in 2026-11-23-01 pushed** (`cde088b`): ADR-114 to ADR-117; session-status' 2026-11-23 block;
  sign-the-cookie's 2026-11-23 block (issue #95 allowed); step forequarter (spec + queue entry);
  dispatch-queue's 11-23 note and 3zv line; the areas (meat-landing, sales, commissary, podium,
  roster, arrivals-and-bills, veggies, supplier-orders, money; map rows 1, 2, 11, 15, 16);
  ui-conventions' "Staff-friendly pages"; running-the-app's Add to Home screen;
  `docs/reviews/token-use-2026-11-22.md`; the 11-22b handoff archived.
- **Drop-in 2026-11-23-02 (token diet) is in the dropins inbox, NOT applied yet** (`/naoki-qs 94` was
  running in Naoki's repo at 16:50): ADR-118 (the click-checker subagent on Sonnet; the rules
  Digest), step token-diet (spec + queue entry), the Digest at the top of
  `docs/rules-for-claude-code.md`, ADR-072's Status line and README row, docs/click-through.md, the
  token report's `/usage` section, the 11-23 block's A17 line. Built on `cde088b`; dry runs on LF and
  CRLF identical, 834 green. The 8 expected md5s (CRLF folded): click-through.md 46c75397,
  ADR-072 95a18ad2, decisions/README 908f4403, dispatch-queue 0dc4e7a5, token-use d6c6bfd1,
  rules-for-claude-code 3a1429c6, session-status a31f0ba0, ADR-118 a13328ee (before `/naoki-qs 94`'s
  close commit; after it, re-run the dry run on the new HEAD - the anchors avoid the CLOSED lines).
- **PR #94 sign-the-cookie**: built (846 tests), issue #95 allowed (each of the ten test files only
  swaps a typed `user_id=<id>` cookie for `cookieFor(id)`); `/naoki-qs 94` was reviewing it at 16:50.
- From the #94 build report: an old server holds port 3000 (beta.db) on the laptop and something
  holds 3001.

## Queue

- **Naoki's lane now:** `/naoki-qs 94` (review, merge) -> apply and push drop-in 02 -> smoke list lines
  1-8, 10, 11 + the login page at phone width -> tag **beta-3.2** -> at the PC:
  `exports\beta-3.2-pc-steps-2026-11-23.md` (update, setup once, COOKIE_SECRET and ADMIN_PASSWORD into
  `.env` by hand).
- **token-diet** (ADR-118, .claude/ files only): runnable any time once drop-in 02 is on main.
- **Then (laptop only, ADR-114):** backup-restore -> restaurant-pc-ii -> roles-guard -> save-safety ->
  cost-guard -> preview-pid; tag beta-4 on the laptop. Then the roster chain (the first staff test).
- **forequarter** (data only): after the official switch.
- **After:** stock-math, settings-safety, blind-reads (check: Kitchen Sales logged out, and the
  landings' logins via the people import, ADR-114), write-switches; the P2 Fable steps.

## Decided 11-23

- ADR-114: the PC takes a new tag only for a staff test with Naoki there, or a recorded condition
  (beta-3.2 for ADR-103). Until then it serves Kitchen Sales to the landings (head-chef role) for the
  paper POS column; counting on paper; counters blind (ADR-101). FC's head chef: own phone, Tailscale
  share, reads only.
- ADR-115: a staff-friendly pass (few words, work order, four guiding colours, room) before any staff
  test; the full visual pass stays later.
- ADR-116: a replaced meat is hidden, never deleted; Forequarter replaces Shortplate (on trial; 200 g
  per serving for all three until real grams; changes at the official switch).
- ADR-117: the purchaser's run records expenses (each receipt's grand total, cash given, cash
  counted, the short); sales money never enters.
- ADR-118 (drop-in 02): the click-through's "Claude checks" in a click-checker subagent on Sonnet
  (PASS/FAIL lines only); builds and `/naoki-qs` stay on Opus; `/usage`'s fix key not used; builders
  read the rules Digest.
- Also: build order sign-the-cookie first (beta-4 order kept), roster next; Kitchen Sales for the
  landings only; Shortplate hidden; ponytail not now; Windows autologon yes; people import not done.

## A9: the receive screen (brainstorm, 11-23)

Sketched for Naoki: group buttons with counts (by supplier; plus Waiting and + Extra); kg lines ticked
by default (untick what did not come; tap the number only if clearly off), piece lines pre-filled with
the ordered count (- / + to change); one big Approve per group; an unticked line goes to Waiting; a
receipt per group (photo + grand total); the supplier sort screen (cards with names and icons, a main
and an optional backup supplier).

**Answered 11-23 (Naoki: "recs") - not yet in the repo, goes into A9's spec:**
1. Who sees which groups: by the item's kind - the kitchen its veggie groups, the podium the piece
   items.
2. An unticked line waits in Waiting today and rolls onto tomorrow's list at 8 AM (ADR-068's "not
   found").
3. The 0.5 kg leeway: one default in Settings; a per-item override later.
4. The sort screen on a phone: tap a card, then tap a supplier box (drag too on the PC and tablet);
   icons per category, not per item.

**Still open:** 5. "Required numbers" on the proper screen: the stock level each item is topped up to
(a par)? 6. Who sorts the half the cold-station head chef does not know - the purchasers?
Later: one receipt for two restaurants (Silingan + Likod)?; fares and tips in the run (ADR-117); the
demo's PO list typed by Naoki as admin (needs the supplier catalog + PO lines + the receive screen).

## A17: `/usage` (Naoki, 11-23 16:39; this machine, last 24 h)

Skills: `/naoki-qs` 86%, `/naoki-qpr` 1%. Subagents: 2%. MCP servers: claude-in-chrome 13%. Its
suggestions (shares overlap): give simple subagents a cheaper model (97%), run `/naoki-qs` on a
cheaper model (86%), `/clear` when switching tasks (48%), `/context` (33%), turn off claude-in-chrome
when not needed (13%); "f to fix 3 of 5". Plan: 42% of the 5-hour window used at 16:39 (resets 17:10),
7% of the week. Answered "recs" -> ADR-118 (drop-in 02). `/context` (the split of the 55k start)
stays optional.

## Still open from Naoki

1. A17: `/context` if he wants the 55k split; after two builds with the click-checker, compare their
   logs with the 11-22 report.
2. A9: questions 5 and 6 above.
3. Forequarter's real grams, the official switch date; what the commi's October "fore quarter" line
   was for.
4. Windows Update's active hours (8 AM-2 AM?).
5. Rice: raw rice per tray, the sack's price and weight.
6. Money (A13): the logbook's "cash out" lines; who covers a purchaser's short; the tally's "AMD",
   "P.O" line and "comp".
7. Photos and workbooks: podium logbook, waste paper, two unreadable Drive photos; the prices
   workbook.
8. The people import at the PC (needed before blind-reads reaches it).

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | #92 #93 checked; #95 allowed. Next: #94's merge if anything turns up, then beta-4's and token-diet's PRs |
| A9 | Orders, arrivals, bills, prices | Round 1 answered 11-23 (flow notes in the areas, ADR-117); brainstorm 1-4 answered (above). **Next: 5 and 6, then specs for the podium test and the purchaser test** (supplier catalog with main/backup, the sort screen, PO lines, the receive screen, the run's page) |
| A17 | Claude Code token diet | Measured + `/usage`; ADR-118 and step token-diet in drop-in 02. Next: after two click-checker builds, compare logs; `/context` optional |
| A18 | Staff-friendly pass (ADR-115) | With each staff test, its pages first (the roster's); pick the four colours |
| A16 | Official docs | Add to Home screen DONE. Next: rewrite with beta-4's messages after backup-restore and restaurant-pc-ii; the admin guide with "When a meat changes" (ADR-116) |
| A6 | Roster | specs complete (ADR-096, ADR-107); build after beta-4; the first staff test |
| A8 | Veggies, pantry, bar sheets | side-sheets parked until roster-fill |
| A11 / A12 | Pizza / Likod as a site | parked |
| A13 | Money | ADR-117 (the run); the payroll export after the roster |
| A14b | Harvest: topic ADRs + slim session-status | C-10, C-22, C-23, C-24, run 4's D2-D7; refresh architect-notes-PRIVATE.md (its delivery lines are from 11-16; add: drop-ins are applied by the chat on the laptop, LF + CRLF dry runs, md5 check) |
| A15 | Dashboards | after about five cards |
| Later | The full visual pass (mockups) | after the roster and login steps (ADR-111) |
| Later | HTTPS and a tab-free app window | with hosting (ADR-111) |
| Later | Floorplan (haydenschmitty/floorplan) | after beta-4 |

## Working notes (11-23)

- The drop-in builder: a template module evaluated and written out with `repr()` (never its source
  text); dry runs on an LF clone and a CRLF copy; md5 of every changed file (CRLF folded) on the
  laptop, then again on `origin/main` after the push. Worked first time on 11-23.
- `/naoki-qs` runs in Naoki's main repo folder and switches branches there: check `git status -sb`
  before applying (11-23 both applies had to wait for a `/naoki-qs` run).
- PowerShell 5.1 and `gh ... --comment "..."`: no inner double quotes or apostrophes; or use
  `--body-file`.
- A17 method: the Claude Code JSONL logs, deduplicated by message id, summing input, cache write,
  cache read and output per call; first-call size = the fixed start. The logs live in
  `exports\session-logs` (private: may hold `.env` tokens). `~/.claude` itself is not reachable from
  the device tools (protected): Naoki copies logs out. The logs give sizes per call, not what the
  start is made of (that is `/context`).
- The podium person (name in the private notes) is "she".

## Project files after this

Keep: this handoff, the next-chat prompt, `architect-notes-PRIVATE.md`, the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01, 11-12, `claude/` 11-15, 11-16, 11-17, 11-22, 11-23), the Excel workbooks. Can be
deleted now (archived in `cde088b` or used): `claude/ARCHITECTURE-HANDOFF-2026-11-22b.md`,
`claude/NEXT-CHAT-PROMPT-AFTER-2026-11-22b.md`, and, if still there,
`claude/ARCHITECTURE-HANDOFF-2026-11-22.md`, `claude/NEXT-CHAT-PROMPT-AFTER-2026-11-22.md`,
`claude/ARCHITECTURE-HANDOFF-2026-11-16.md`, `claude/NEXT-CHAT-PROMPT-2026-11-17.md`,
`claude/NEXT-CHAT-PROMPT-2026-11-22.md`, `claude/FABLE-PROMPTS-2026-11-17.md`,
`claude/FABLE-REVIEW-PLAN-2026-11-15.md`.
