<!--
This repo is PUBLIC. No supplier names, staff names, live yield figures,
or photos in the description or the diff.

"I didn't check this" is a useful and welcome answer anywhere below.
A guess presented as a check is not.
-->

## Which lane
<!-- DISPATCH (running an architect's prompt — link or paste it) or
     ENGINEER (your own initiative — say what you spotted). -->


## What changed and why


## `npm run verify`
<!-- Paste the real output — the suite plus the write-path audit.
     Not a summary, not a retyped total. CI runs the same command, so a
     mismatch between this and the check on the PR is itself a finding. -->

```

```

- [ ] SUITE GREEN
- [ ] AUDIT CLEAN
<!-- If you added an allowlist entry to make the audit pass, say so under
     "Anything I wasn't sure about" — that is an architect decision. -->

## Did this touch `public/`?
<!-- If yes, a green suite is NOT sufficient evidence. Several real bugs
     have shipped past a fully green suite. Open the app, click the thing,
     and describe what you actually saw. If no, write "no". -->


## Scope
<!-- Did anything outside the task change? If yes, say what and why —
     don't quietly include it. -->

- [ ] Nothing outside this task's stated scope changed

## Settled-decision check
<!-- Required for the ENGINEER lane. Which "Things NOT to re-litigate"
     entries in session-status.md did you check this against?
     For the DISPATCH lane, write "n/a — dispatched". -->


## Decisions I made myself
<!-- Class A only — see docs/decision-authority.md. Reversible and
     invisible to an operator: naming, file placement, test shape, refactor
     shape, migration mechanics. One line each. This is a record, not a
     request for approval; you do not need permission for anything here.

     "None" is a normal answer on a small step. -->


## Anything I wasn't sure about
<!-- Say it here rather than deciding it. This is not a weak answer;
     it's the one that prevents the expensive kind of mistake. -->


---
- [ ] I did not push to `main`, force-push, or merge this myself
