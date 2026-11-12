> **ARCHIVED 2026-10-28 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/`. Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - Session A landed: `docs/decisions/` (ADR-001 to ADR-004) and this archive (09-24 to 10-05).
> - Q1 answered 10-22: the side sheet's inhouse column is unused; staff meals have their own page (ADR-027). Q2 answered 10-21: SPOS is unfrozen and moves into the repo after Beta (ADR-005). Q3 (operating expenses) is still open (A13).
> - The roster question is answered: a separate staff table with an optional link to a sign-in account (ADR-013).
> - Beta week: the SPOS mail password was rotated (confirmed 10-25); the prototype was built 10-21; the Beta setup is ADR-007 and testing-plan "Beta setup (2026-10-28)"; the counted-meat costing gap is ADR-018. The scope.md drift is still open (A5).
> - Session B, the harvest (reversal ADR pairs, one ADR per "Things NOT to re-litigate" line, a slimmer session-status), was **not done** as of 2026-10-28. A1 recorded the newer decisions (ADR-005 to ADR-032) only.

# Architecture Handoff - 2026-10-20 (transitional)

**Lead, not source.** Checked against `origin/main` at `213b9a1` by clone plus
doc inspection (no suite run). This is the last handoff in the old style. From
here, decisions go to `docs/decisions/` (ADR-001) and a handoff stays one page.
Where this disagrees with older handoffs, this wins; session-status wins over
all of them.

## 1. What this conversation produced

- A consultation on the long-run risks of AI-assisted development (§5).
- Drop-in files for a new `docs/decisions/` folder: `README.md` plus ADR-001 to
  ADR-004 (decision records, definition of done, staff meals as quantities,
  SPOS ownership).
- Archive-ready copies of the old handoffs and the 09-24 draft (word for word,
  each with a "history, not current" banner) plus the archive README, which
  holds the timeline of how decisions changed.
- Nothing dispatched, no code.

## 2. Corrections - read before planning

- **The A/B/C question from this chat is already settled.** "Where does
  management's money view live" was answered on 2026-10-19 by D3 (Separate
  apps), "Pesos are computed here" and the Bills page. Only operating expenses
  (gas, electricity, water) are unplaced.
- **users-roles is CLOSED** (PR #24, 2026-10-13). The roster question is now:
  no-login rows in `users`, or a separate staff table (ADR-002).
- **session-status ~line 177** ("migrate to MySQL and merge onto a separate
  app") is stale against hybrid A and the core-app line. ADR-002 supersedes its
  definition-of-done half; the rest goes in the harvest.

## 3. Questions for Naoki

- **Q1.** Is the side staff-meal estimate the paper's "inhouse" column (the
  deferred waste / inhouse / cooked layer)? (ADR-003)
- **Q2.** Does SPOS control lift the "frozen at `5950238`" assumption, so we
  may patch SPOS? (ADR-004)
- **Q3.** Operating expenses: entered where? (Final scope, not this week.)

None of these blocks pushing the records; each record names its open check.

## 4. Plan

Beta week comes first (demo Sunday 10-25, Beta Monday 10-26). The restructure
must not compete with it.

**Beta week - carried over unfinished from the 10-19 chat** ("SPOS integration
and inventory app architecture"; its two drop-ins are pushed as `1662e53` and
`213b9a1`). Do these in a fresh architect chat, in this order:
1. **The exposed mail password in the public SPOS repo.** Change the password
   first (deleting it from the repo isn't enough; it stays in git history),
   then remove it from the code. With SPOS now under Naoki's control
   (ADR-004), this may be ours to do directly instead of a message to Prince.
2. **The Sunday prototype:** one clickable, published prototype of the planned
   pages on sample data (app shell with grouped sidebar, checker and
   management views, Landing, Commissary, the 10pm dashboard, supplier order
   with its picture, arrival, bills, a sides sheet, login). Architect-built,
   outside the repo. Input needed: a photo of one paper PO they crop and send.
3. **The Beta runbook for Monday:** which PC runs the server and how it starts
   on `beta.db`; the address testers type on the Wi-Fi; who resets the
   database and when; a short test script per role; how testers report bugs.
4. **This week's click-throughs:** 3x, 3v, 3y, possibly 3k, plus PR #28 (3r)
   rework. Plan which evenings.

After Beta, also from that chat: the costing gap for counted meats (paid by kg,
received as a count, so the cost must be spread over raw kg at the yield; put
it in the valuation spec) and `scope.md` drift (still says local-only and
meat-only). Its "firm the definition of done" item is done (ADR-002).

**Session A - about 20 minutes, any time.**
1. Clone or pull, then read ADR-001 to ADR-004. Edit anything wrong.
2. Push `docs/decisions/` (commands in §6).
3. Push `docs/archive/handoffs/` (same section).
4. Add one line under session-status "Things NOT to re-litigate" pointing to
   `docs/decisions/`. Generate that guarded drop-in on that day's HEAD.
5. In the Claude project files: remove the old handoffs and the 09-24 draft;
   add this handoff. Keep architect-notes and the Excel workbooks.

**Session B - after Beta starts: the harvest.**
1. **Reversals first**, each as a superseded + new ADR pair:
   - the intake weigh-in (09-03, reversed 09-24; the 09-02 "count and weight"
     rule is still unmarked, so confirm it);
   - yield `output_quantity` replaced by Path 1 (09-26 to 09-28, #16);
   - two-stage replaced by three-stage staging;
   - the MySQL target replaced by hybrid A and the core app (09-28 to
     10-03/10-05);
   - "all money in SPOS" rejected (10-19);
   - the 10-03 leans on supplier POs and the cost owner, resolved 10-19.
2. **"Things NOT to re-litigate"**, one ADR per line.
3. **Slim session-status** into state plus the ADR index.
4. **Strip "Where things stand" from architect-notes.** State lives in the repo.

The reasoning the handoffs compressed away is still in session-history and the
past architect chats in this Claude project. Search them while writing each
record.

## 5. Consultation - proposed work, not decided

- **Golden-data replay:** run a real month from the Excel workbooks (Commi,
  Restaurant A, FC) through the engines and compare the numbers. Parallel-run
  paper and app in early Beta.
- **Before Live data:** backups (Planned: snapshot-then-sync), one real restore
  drill, and `busy_timeout` (still a TODO in `connection.js`; WAL is on).
- **Executable decisions:** prefer a guard plus a test for settled rules
  (ADR-001).
- **Review for understanding:** don't merge a PR you couldn't explain.
- **Handover:** `docs/official` covers outsiders. Still decide who maintains
  the app after the school project.
- The owners' figures (per-head allowance, observed staff-meal spend) are in
  the 2026-10-20 chat only. Keep them out of the repo.

## 6. Commands for Session A (PowerShell 5.1, one per line)

The files land in Downloads. If `New-Item` says the folder already exists,
stop: main moved, so check before going on.

```
git checkout main
git pull
New-Item -ItemType Directory -Path docs\decisions
Move-Item "$env:USERPROFILE\Downloads\decisions-README.md" docs\decisions\README.md
Move-Item "$env:USERPROFILE\Downloads\ADR-001-record-decisions.md" docs\decisions\
Move-Item "$env:USERPROFILE\Downloads\ADR-002-definition-of-done.md" docs\decisions\
Move-Item "$env:USERPROFILE\Downloads\ADR-003-staff-meals-as-quantities.md" docs\decisions\
Move-Item "$env:USERPROFILE\Downloads\ADR-004-spos-ownership.md" docs\decisions\
git add docs/decisions
git status -sb
git commit -m "docs: add docs/decisions - ADR-001 to ADR-004" -m "Decision records, definition of done, staff meals as quantities, SPOS ownership. From the 2026-10-20 architect conversation."
git push
git fetch --quiet origin
git log --oneline -1 origin/main
```

Then the archive:

```
New-Item -ItemType Directory -Path docs\archive\handoffs
Move-Item "$env:USERPROFILE\Downloads\archive-handoffs-README.md" docs\archive\handoffs\README.md
Move-Item "$env:USERPROFILE\Downloads\archived-architecture-decisions-DRAFT-2026-09-24.md" docs\archive\handoffs\architecture-decisions-DRAFT-2026-09-24.md
Move-Item "$env:USERPROFILE\Downloads\archived-ARCHITECTURE-HANDOFF-2026-09-24.md" docs\archive\handoffs\ARCHITECTURE-HANDOFF-2026-09-24.md
Move-Item "$env:USERPROFILE\Downloads\archived-ARCHITECTURE-HANDOFF-2026-09-26.md" docs\archive\handoffs\ARCHITECTURE-HANDOFF-2026-09-26.md
Move-Item "$env:USERPROFILE\Downloads\archived-ARCHITECTURE-HANDOFF-2026-09-28.md" docs\archive\handoffs\ARCHITECTURE-HANDOFF-2026-09-28.md
Move-Item "$env:USERPROFILE\Downloads\archived-ARCHITECTURE-HANDOFF-2026-10-05.md" docs\archive\handoffs\ARCHITECTURE-HANDOFF-2026-10-05.md
git add docs/archive
git status -sb
git commit -m "docs: archive architecture handoffs 2026-09-24 to 2026-10-05" -m "Word for word with a history banner; the README holds the timeline."
git push
git fetch --quiet origin
git log --oneline -1 origin/main
```

Never `git add .` here: `graphify-out/` would ride along.
