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


## Which callers did you check?
<!-- For every route you changed: name the files in `public/` that call it,
     and say whether you exercised it the way they call it.
     `grep -rn "<route path>" public/` finds them.

     A route tested with one hand-built payload is not tested. On 2026-09-03
     a step's live check posted a single row. The page that calls that route
     posts every row on screen on every save — and the difference silently
     cleared a provenance stamp on every untouched row and wrote a
     content-free activity_log entry for each one. The suite was green, the
     live check was real, and the honest answer to "did this touch public/"
     was no.

     If nothing in `public/` calls it, write "no callers" and say how you
     checked. -->


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
