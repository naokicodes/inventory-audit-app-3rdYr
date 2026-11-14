> **ARCHIVED 2026-11-12 - history, not current.** Kept word for word for the
> reasoning and the record of what changed. Current state:
> `docs/session-status.md`. Current decisions: `docs/decisions/` (the item map in its
> README shows where each numbered decision went). Timeline:
> `docs/archive/handoffs/README.md`.
>
> **Changed after this file:**
> - 11-12: its drop-in landed (A10 + triage): ADR-043 to ADR-046; steps 3zv to 3zz and table-scroll; role-assignments gained ensureRoleDefaults (beta.db is never reseeded). Grillers are cooks for the "log staff meals" switch; non-meat lines are typed (name + estimated pesos) at every site until A8.

# Architecture Handoff - 2026-11-11 (A10 + triage decided, drop-in NOT built yet)

**Lead, not source.** Checked against `origin/main` at `2812ffc` (550/550, AUDIT CLEAN).
Adds to `ARCHITECTURE-HANDOFF-2026-11-02.md` (keep both until the drop-in archives 11-02).
Next chat: "Batch: A10 drop-in" - build and dry-run ONE guarded drop-in from the decisions below.
Explain owner view first, then technical (Naoki's standing preference).

## State
- Merged since 11-02: PR #56 (3q autopilot-preview), PR #52 (3u sheets-tier1). Runnable now: 3zt, 3j.
- Restaurant PC (C:\Users\kkeex\InventoryApp) was installed 10-28 from old main (before beta-1
  existed), so it has the old Kitchen Sales dropdown. Plan: move it to `beta-1` (has the date
  bar and 3zh; no blind-count). `beta-2` waits for 3zt so the smoke list can run.
- Loyverse tokens were missing on the PC; Naoki adds the two token lines to its .env.

## Decided this chat (write as ADRs / step text in the drop-in)
Triage (#60, #62, #30, #61, #47):
1. #60 Q1 Reading A: GETs with commissary_meat_id map the meat to its commissary and check it.
2. #60 Q2 Reading A: the guard checks every rows[].commissary_meat_id; one foreign row -> 403.
3. #60 Q3 Reading B for 3m. Add to 3zs: with no site id, GET /stock-receipts, /daily-audit,
   /commissary/yield-log, /commissary/adjustments narrow to the user's sites; /commissary/meats
   stays open (stock-receipts.html, terminal.html, settings.html list every commissary's meats).
   3zs Touches gains server/routes/stockReceipts.js.
4. #60 Q4: /stock-receipts/meats leaves 3m's guard and stays open for good. ADR-043: catalog
   reads (id, code, name, unit; no stock, no money) stay open.
5. #62 Reading B: PR #61 complete as built. Add to 3zs: SAVING shipment presets and conversion
   standards needs an admin; loading them and changing numbers on the day stays open (preset =
   a default). Same pattern for conversion standards.
6. cubic P1 on #61 (unsigned user_id cookie): no change; stub-login is identity, not security.
   Queue a small "sign-the-cookie" step (HMAC, secret in .env, no dependency) after 3zr.
7. #30: spec the EXISTING dispatch-queue entry `table-scroll` (no new id): wrap the 21 unwrapped
   tables on 9 pages in `.table-scroll`; daily-audit sheet excluded (cards); markup only;
   click-through.
8. #47 (Naoki's PR) fixes, all recs accepted: validate DB_PATH in an existing .env (stop, never
   rewrite); check the port before the start backup ("already running"); errorlevel after each
   copy (update refuses without a backup); PREV = git rev-parse HEAD + check the rollback
   checkout; Private only on the connected profile; drop the program-wide node rule, keep the
   port rule with remoteip=localsubnet; don't hard-code beta-1; fill the template; keep newest 14
   backups. Walk Naoki through it after the drop-in.
9. review.md trim (subagent cost): grep "## Step <name>", read only that section + "Things NOT
   to re-litigate"; keep only verify's summary lines.

A10 staff meals (amends ADR-027; ADR-013 "no approvals" kept):
- Rice: budget never includes rice. Estimate line per day = head count (staff + OJT) x 2 served
  cups x grams per cup x rice price per kg (all settings; grams per cup is a guess for now).
  Shown beside the budget as "Staff rice (estimated)". An estimate, not a stock deduction; cooks
  type nothing. Later report (no new sheet): rice bought (bills) - rice sold (Loyverse) - staff
  estimate.
- Slots: one record per site, business day, slot; saving again updates it.
- Extra meals: the head chef adds any number (birthdays, events), named; NO budget; recorded
  for reports; any cook can fill one.
- Logging: any cook logs ("log staff meals" switch). The meal counts at once. The head chef
  CHECKS (marks checked or fixes), never approves; head chef's own logs are checked
  automatically. Management sees unchecked meals.
- Copy a past meal: lines scaled by new/old head count; editable; "copied from" link; each meal
  has a short dish name.
- Late logs: cooks log the current business day; the head chef adds or fixes up to 3 days
  back, marked "logged late".
- Silingan cooking for Likod: logged at the cooking site with the combined head count.
- Likod non-meat ingredients: name + estimate lines until its sheets open.

## Still open
- The real Loyverse port (nightly sync into sales) is not specced; head chefs only need the
  sales reading for now, so it is not urgent.
- Restaurant PC checks 4-7 (phones on staff Wi-Fi + reserved IP, auto-start via shell:startup,
  firewall rule LocalPort, disk space).
- Earlier open questions in the 11-02 handoff carry over.
