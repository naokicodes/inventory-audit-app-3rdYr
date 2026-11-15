> **ARCHIVED 2026-11-15 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-14 23:16: PR #76 (user-id-authorship) merged (`2e52542`), its CLOSED line fixed (main
>   `66cae9b`, 675 tests). role-assignments became PR #78; it did not merge overnight, so Marble's
>   three did not run. #78 merged the morning of 11-15 (`a9117fa`, main `edd5243`, 695 tests).
> - 11-15 (A0): ADR-081 to ADR-084 - the settings import reads `.env` and names its file (step
>   import-settings-env); the Roles page owns roles and built-in roles keep their names (in
>   roles-page); a read-only login is refused every write (in write-permission); step preview-pid;
>   beta-2 on main after #78.

# Architecture Handoff - 2026-11-14 (end of day: A0, A8 + A9 part 1, five A0 follow-ups)

**Lead, not source.** Checked against `origin/main` at `af78da3` (618/618, AUDIT CLEAN). Session-status
still wins. Replaces `ARCHITECTURE-HANDOFF-2026-11-12b.md` (archived in the repo 11-14). The next
architect chat's first drop-in archives THIS file word for word (with its banner and timeline row).

## State

- Merged today: #47 restaurant-pc (`310e033`), #61 settings-guard (`a7a420f`), #65 import-identity
  (`19e285e`), #59 site-filter (`8f0fd61`). All closed in the queue.
- Docs on main today: ADR-060 to ADR-074 (`f90d574`, `f903e2c`, `b6432fd`, `cf43b24`, `5bf7229`).
- ADR-075 pushed (`a493c17`); #63 self-host-font merged (`8ed243e`, main `d94e07d`, 620 tests).
- **Later 11-14 (21:20):** issues #70 and #73 answered (ADR-076 FC refunds subtract / deleted items keep
  their category, PR #71 as built; ADR-077 PR #69 as built + new step settings-tabs), drop-in
  `dropin-issues-70-73.py` dry-run on `d94e07d`. Then: close #70 #73; `/naoki-qs 69` and `71`
  (phone checks); `/naoki-qm 72` (busy-timeout ready; cubic's two Contradicts are correct per spec);
  then `/naoki-qs settings-tabs`.
- **21:52:** #69 table-scroll, #71 loyverse-fc, #72 busy-timeout merged (main `619e314`, 635 tests); #70
  and #73 closed. Marble built side-items (PR #74) ahead of user-id-authorship; its review questions are
  answered by ADR-078 (`dropin-pr74.py`, dry-run on `619e314`). settings-tabs waits behind #74
  (settings.html). Marble's next should be user-id-authorship (the critical path).
- **21:58:** the PR #74 drop-in was committed onto the PR branch (`a3736a7`, marble/side-items), not
  main. Fix given: stop the run, cherry-pick `a3736a7` onto main, add `dropin-pr74-b.py` (ADR-079: a
  conversion is removed only in Settings), push, rerun `/naoki-qs 74`. Marble is idle until #74 merges
  (every step left touches schema.sql or settings.html). After #74: Naoki settings-tabs, Marble
  user-id-authorship, in parallel.
- **22:47:** #74 side-items and #75 settings-tabs merged (main `c38d29e`, 663 tests). PR #76
  user-id-authorship parked on issue #77; ADR-080 answers it as built (`dropin-issue77.py`). Next:
  `/naoki-qs 76` (History click-through), then role-assignments.
- **23:10 (last update in this chat):** ADR-080 on main (`1df6a57`). PR #76 head `480fd5a`: current
  with main, 675 tests, merges cleanly; Naoki finishes it (History phone check), then runs
  role-assignments and merges it before sleeping. Marble's overnight list, all three free of shared
  files once role-assignments is merged: staff-meal-settings, roles-page, site-filter-ii; each stops
  at "Ready" for Naoki's `/naoki-qm` in the morning. Then cost-guard, staff-meal-log, side-sheets,
  sheet-close, allocation-requests, roster chain.
- **For the new chat:** the 21:16 qpr lists ~30 late cubic findings (PRs #47, #52, #56, #59, #61, #64)
  never sorted. Triage them into fix steps or nothing. Worth a look first: site check bypass keyed on
  `read_only` (#59, siteAccess.js:46); preview.ps1 PID reuse could kill another node process (#56);
  dev.db symlink passes testAccounts' guard (#64). #61's unsigned cookie is sign-the-cookie (3zv).
- Subagent cost after ADR-072: 10-35k tokens per review (was 50-100k on general-purpose). Builder
  stays on Opus (Naoki's call: Sonnet builds missed things); markup-only steps could go to Sonnet if
  tokens get tight.
- Restaurant PC: still on `beta-1` (`e2ffc17`, 11-01, before blind-count). The 11-14 bat (Tailscale
  rule, FC token) was sent over Discord; whether it ran is not reported yet.

## Runnable now (in order; schema steps one at a time)

1. busy-timeout (server, tiny; shares connection.js with 3l, so first).
2. 3l user-id-authorship (schema) - the critical path: it unblocks 3zj role-assignments, 3zc, 3zs.
3. 3zj role-assignments (schema) - unblocks cost-guard, 3zx staff-meal-log, 3zk roles-page, 3zl
   roster chain.
4. With Naoki at a phone: loyverse-fc, #63 self-host-font, table-scroll.
5. 3zw staff-meal-settings (schema); side-items (schema); 3zd sheet-close (settings.js: not beside
   3zw or side-items).
Then: cost-guard, 3zx, side-sheets, 3zs site-filter-ii, 3zk, roster chain 3zl -> 3zr, 3zv.

## beta-2 (due: #61, #65, #59 are in)

Rec given 11-14: run busy-timeout and loyverse-fc first (one attended PC update for both), then:
1. Smoke list (`docs/click-through.md` -> "Beta smoke list") by Claude in Chrome on a throwaway
   `server/db/dev.db` (reseed, `npm run seed:test`, `npm run dev`); skip lines whose steps are not in.
2. `git tag beta-2 <main hash>`, `git push origin beta-2`.
3. At the PC: close the app window; `restaurant-pc.bat update beta-2`; start; the DB upgrades itself.
4. People: the PC's login list has only `superadmin` until the people workbook is imported. The
   importer reads DB_PATH from the environment only, NOT from `.env`: on the PC set
   `$env:DB_PATH="server/db/beta.db"` (PowerShell) before `npm run import:settings -- <folder>`,
   or it writes the live `inventory.db`. Close the app first (no busy_timeout until beta-3).
   Rec for the next chat: a small step making import-settings load `.env` and print the database
   file before writing.

## Decided 11-14 (all recorded)

- A0: see_costs (ADR-060); named steps (ADR-061); cubic sorted by the builder (ADR-071, made
  optional by ADR-075); reviews read main's spec, always pr-reviewer (ADR-072); role names unique by
  key (ADR-073, #67); site guard refuses malformed ids, a no-restaurant receipt is its commissary's
  (ADR-074, #68).
- A8: side-item catalog (ADR-062); usage while counting (ADR-063); side waste after endings
  (ADR-064); FC sheets (ADR-065). FC on Loyverse, Kitchen Sales switch (ADR-066).
- A9: from-the-commi tag, FC's direct meats (ADR-067); buyer ticks and receipt photos (ADR-068).
- Scope every sheet (ADR-069); Tailscale (ADR-070). 3ze closed; naoki-qi looks up queue steps.

## Read as "recs" or assumed (Naoki: say if not)

- FC's Kitchen Sales side by FC's Loyverse categories; fc-dish-map waits for FC's current dish list.
- The Side items tab is a full list per sheet; ADR-047's rules apply; a blank cost keeps the cost.
- Past side-sheet dates may be edited, every change logged.

## Still open from Naoki

1. Wi-Fi the counting phones use (Deco main / guest / C64).
2. Restaurant PC: did the new bat run; any [X] messages.
3. Photos: prices workbook progress (none yet).
4. bar-check: which bottle the boodle's four free drinks and UPGRADE PANALO pour.
5. When to tag beta-2 (rec above).

## Open questions (carried)

From 11-12: Q2 (#47 items f, h and the "no sleep" part of g), Q4 (miscut staff meals), Q5 (rice
grams per cup placeholder); a membership-editing screen must say how it shares truth with the people
workbook (ADR-047). roles-page renames: ensureRoleDefaults looks roles up by name, so renaming a
seeded role before its default set applies would skip it (check in roles-page's spec).

From 11-02: Q3 (pizza stock), Q4 (staff-order Loyverse field), Q5 (Likod bottles), Q7 (#40 labels),
Q9 (operating expenses; who maintains the app), Q10 (Likod's kitchen around the new year), Q11
(per-person overrides), Q13 (people workbook: import onto beta.db after beta-2), Q15 (does history
show blind numbers?). Q14: Marble's Tailscale part open.

From 11-11: the real Loyverse port (nightly sync); restaurant PC checks 4-7.

## Architect queue

| ID | Item | Status |
|---|---|---|
| A0 | Decision triage (recurring) | **Last: 11-14** (#67, #68, cubic, review fix) |
| A5 | `scope.md` rewrite | Not started (M); the meat-only line fixed (ADR-069) |
| A8 | Veggies, pantry, bar sheets | Part 1 DONE 11-14; next: side-waste and bar-check specs as side-sheets lands |
| A9 | Orders, arrivals, bills, prices | Decided 11-14 (ADR-067, ADR-068); specs as A8's steps land |
| A11 | Pizza station | Not started (M); FC's pizza on paper |
| A12 | Likod as a site | Not started (L) |
| A13 | Money and operating expenses | Not started (M); money.md IRL Told |
| A14b | Harvest: topic ADRs + slim session-status | Queued (L) - a quiet day |
| (done) | A1-A4, A6, A7, A10, A14a | DONE |

Suggested next architect batch: the import-settings `.env` step and beta-2 support; then A14b on a
quiet day, or side-waste's spec once side-sheets is near.

## Project files after this

Keep: this handoff, `architect-notes-PRIVATE.md` (refreshed 11-14), the AREAS-PRIVATE-NOTES files
(10-24, 10-28, 11-01, 11-12) and the Excel workbooks. The FC item export has prices: keep it out.

The reasoning is in the 11-14 chat (search "see costs", "FC token", "Waste today", "Tailscale",
"general-purpose", "issue #68", "cubic optional").
