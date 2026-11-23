> **ARCHIVED 2026-11-23 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-22 (late): drop-in 08 pushed (`9375606`); PR #92 (sales-cache) and PR #93 (ui-shell) merged;
>   beta-3.1 tagged on `ac5b388` (834 tests) and on the restaurant PC. "Still open" answered on
>   11-23: 2. the Tailscale share works, FC's head chef on his own phone; the people import is not
>   done; 3. Windows signs in by itself; 4. Kare-Kare's meat is Forequarter, which replaces
>   Shortplate (ADR-116; on trial, 200 g per serving for now); 6. "ponytail" is a Claude Code skill (not now). The
>   PC now updates only for staff tests (ADR-114). See session-status' 2026-11-23 block.

# Architecture Handoff - 2026-11-22b (evening and late: beta-3 at the PC, beta-3.1 specced)

**Lead, not source.** Checked against `origin/main` at `11ae4da` (drop-in 07, tagged **beta-3**; 814 tests,
SUITE GREEN, AUDIT CLEAN), plus drop-in 08, applied in Naoki's repo for him to commit (dry-run on fresh
clones of `11ae4da` with LF and with CRLF files: identical, 814 green, audit clean; every changed file on
the laptop matches). Session-status wins. Replaces `ARCHITECTURE-HANDOFF-2026-11-22.md` (archived word
for word by drop-in 07). The next architect chat's first drop-in archives THIS file word for word
(banner + timeline row). Its opening prompt: project doc `claude/NEXT-CHAT-PROMPT-AFTER-2026-11-22b.md`.

## State

- Merged 11-22: #88 stale-saves, #90 landing-sales, #91 fc-landing-lines. Drop-in 07 pushed
  (`11ae4da`: the install guide `docs/official/running-the-app.md`, ADR-110, the PC corrections,
  the 11-22 handoff archived). **beta-3 tagged on `11ae4da`.**
- **beta-3 is on the restaurant PC** (21:15 to 21:30): `update beta-3` (814 green), the old
  `beta.db*` moved together into `InventoryApp\old-beta-db-2026-11-22`, the setup run again (a
  fresh beta.db). Kitchen Sales syncs all three Loyverse accounts (checked on an 11.5-inch tablet).
  The PC was first set up on 10-28 (beta.db dated 10-28 10:34), re-run on 11-13. **Not reported
  yet:** the people import (`AuditApp-Assets\people\Users.csv`) and Tailscale (the share for FC's
  head chef).
- **Drop-in 08** (applied, not committed; `AuditApp-Assets\dropins\2026-11-22-08-commit-message.txt`):
  session-status' 2026-11-22 late block; the specs **sales-cache** (ADR-112) and **ui-shell**
  (ADR-111); sign-the-cookie's 2026-11-22 block (ADR-113: a login lasts one business day);
  dispatch-queue's late note and the two step entries; ui-conventions' shell and widths; the areas
  map rows 1 and 16; the evening block's 10-28 correction. Check `origin/main` for it first.
- The icon files for ui-shell: `AuditApp-Assets\photos\brand\icons\` (five PNGs from the Silingan
  logo, `photos\brand\silingan-logo-round_2026-11-22.png`).

## Queue

- **beta-3.1 (Naoki's lane):** commit and push drop-in 08 -> `/naoki-qs` sales-cache ->
  `/naoki-qs` ui-shell (copies the five icons into public/icons/) -> smoke list lines 1-8, 10, 11
  plus ui-shell's click-through (390px and 1366px) -> tag beta-3.1 -> at the PC `update beta-3.1`
  and the setup once.
- **beta-4 (by update), unchanged:** sign-the-cookie (now with ADR-113, on ui-shell's login page) ->
  backup-restore -> restaurant-pc-ii -> roles-guard -> save-safety -> cost-guard -> preview-pid.
  After `update beta-4`, the setup once.
- **After:** Marble's roster chain, stock-math, settings-safety, blind-reads, write-switches; the P2
  Fable steps between roster steps.

## Decided 11-22 evening and late (all recorded)

- ADR-110 (a Tailscale share, not an invite). ADR-111 (one shell: top bar, grouped menu, Home of big
  buttons, the icon; everyone sees every link for now). ADR-112 (Kitchen Sales keeps results in
  memory: today 2 minutes, the 7 days before 30 minutes, older until restart; Sync always fresh).
  ADR-113 (a login lasts until the next 8 AM).
- The rest (beta-3 by update with a fresh beta.db; testing on the PC only with real staff; the
  two-row people import; backups on C: only; beta-3.1 before beta-4; Typed sales under Admin; no
  tab-free window until HTTPS with hosting): session-status' 2026-11-22 evening and late blocks.

## Still open from Naoki

1. The Silingan logo in the public repo: taken as yes (he sent it for the icon); confirm.
2. The PC: the people import and the Tailscale share done? FC's head chef's device (own phone or an
   FC phone).
3. AnyDesk: active hours 8 AM-2 AM; auto sign-in after a restart (beta-4's auto-start needs it).
4. Kare-Kare's real meat and grams per serving.
5. Rice: raw rice per tray, the sack's price and weight.
6. "ponytail": which tool he meant.
7. Money (A13): the logbook's "cash out" lines; who covers a purchaser's short; the tally's "AMD",
   "P.O" line and "comp".
8. Photos and workbooks: podium logbook, waste paper, two unreadable Drive photos; the prices
   workbook.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Next: the beta-3.1 PRs (sales-cache, ui-shell)**, then beta-4's |
| A16 | Official docs | Install part DONE (`running-the-app.md`). Next: Add to Home screen once ui-shell is built; rewrite with beta-4's messages after backup-restore and restaurant-pc-ii; then the admin guide (C-19's rest) |
| A17 | Claude Code token diet | after beta-3.1: one step's session log (JSONL into AuditApp-Assets\exports); graphify on or off; a slimmer dispatch-queue.md; effort levels |
| A6 | Roster | specs complete (ADR-096, ADR-107) |
| A8 | Veggies, pantry, bar sheets | side-sheets parked until roster-fill |
| A9 | Orders, arrivals, bills, prices | receipts by kind answered 11-17 |
| A11 / A12 | Pizza / Likod as a site | parked |
| A13 | Money | payroll timing answered 11-22; the export after the roster |
| A14b | Harvest: topic ADRs + slim session-status | C-10, C-22, C-23, C-24, run 4's D2-D7; refresh architect-notes-PRIVATE.md (its drop-in delivery lines are from 11-16) |
| A15 | Dashboards | after about five cards |
| Later | The full visual pass (mockups) | after the roster and login steps (ADR-111) |
| Later | HTTPS and a tab-free app window | with hosting (ADR-111) |
| Later | Floorplan (haydenschmitty/floorplan, chat 11-20) | after beta-4 |

## Working notes (11-22 evening and late)

- Device shell: read-only git with `--no-optional-locks`, never `git fetch`. Drop-ins run from the
  dropins folder with the repo root as the working directory; then compare each changed file's md5
  (CRLF folded to LF) with the container's dry run.
- **Dry-run every drop-in twice: on LF files and on a copy with CRLF files.** Naoki's checkout mixes
  both (docs/decisions/README.md, docs/official/README.md are CRLF). On 11-22 drop-in 08's first
  build copied the template's source text instead of its value, so its CRLF fold was a literal
  `\\r\\n`; the LF dry run passed and the laptop refused (nothing written). Build drop-ins from the
  evaluated template (ast.literal_eval or an import), never from its source text.
- New file versions go to a new outputs path (v1, v2 ...); check the md5 on the laptop. PNGs sent
  with device_commit_files arrive with an extra `caBX` chunk (content credentials, about 5.8 KB):
  their md5 differs from the container copy; the image is the same.
- The smoke list needs the app running on the laptop (Windows); the device shell is a Linux VM and
  cannot reach the laptop's localhost; the laptop's built-in browser can.
- At the PC, an `npm install` typed after an update is not needed (the update runs `npm ci`); check
  `git status --short` in the app folder: empty means nothing changed.

## Project files after this

Keep: this handoff, the next-chat prompt, `architect-notes-PRIVATE.md`, the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01, 11-12, `claude/` 11-15, 11-16, 11-17, 11-22 with its evening section), the Excel
workbooks. Can be deleted: `claude/ARCHITECTURE-HANDOFF-2026-11-22.md` (archived in the repo, pushed),
`claude/NEXT-CHAT-PROMPT-AFTER-2026-11-22.md` (used), and, if still there,
`claude/ARCHITECTURE-HANDOFF-2026-11-16.md`, `claude/NEXT-CHAT-PROMPT-2026-11-17.md`,
`claude/NEXT-CHAT-PROMPT-2026-11-22.md`, `claude/FABLE-PROMPTS-2026-11-17.md`,
`claude/FABLE-REVIEW-PLAN-2026-11-15.md`.
