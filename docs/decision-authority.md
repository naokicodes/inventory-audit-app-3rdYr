# Decision authority — what you may decide, and what waits

Read this alongside `docs/engineer-role.md`. That file says which *work*
you may start. This one says which *decisions* you may make once you have
started.

They are different questions, and conflating them is why work stalls. A
dispatched step can be perfectly in-scope and still generate twenty small
choices along the way. If every one of those comes back to an architect,
the loop is no faster than doing it by hand.

## The test

Two questions, in this order.

1. **Is it reversible?** Could a later commit undo it cleanly, with no
   data migration and no retraining anyone?
2. **Is it invisible to a restaurant operator?** Would the person doing
   the daily audit notice, or care?

**Both yes → decide it yourself and log it.** Anything else → stop.

Reversibility is the load-bearing half. "It's a small change" is not the
test — a one-character change to a validation rule can corrupt a ledger.
"It's a big change" is not the test either — a 400-line refactor with the
suite green is trivially revertible.

## Class A — decide it, log it, do not ask

- Function, variable, and file naming
- Which existing file a new helper belongs in
- Test structure, test naming, how many assertions, fixture shape
- Refactor shape, extraction, de-duplication — where behaviour is identical
- Error *message* wording in developer-facing output and logs
- Migration mechanics: helper name, ordering within `migrate.js`, how the
  idempotency check is written
- Whether to split your own work into more than one commit
- Adding a test for behaviour that already exists and is correct

Log Class A decisions as a short list in the pull request body. Not for
approval — for the record, so an architect reading the diff later knows a
choice was made deliberately rather than by accident. One line each.

## Class B — stop, open an issue, do not decide

- Anything an operator sees, reads, clicks, or types
- Anything that changes what a balance, variance, or yield number comes
  out as
- What a term *means* in the business: usage vs loss vs allocation, what
  counts as an adjustment, what a shipment is
- New columns, tables, constraints, or anything that changes what the
  code rejects
- Data-entry burden: adding a required field, removing a default,
  changing what an auditor has to key in per shift
- Irreversible data operations against a live database
- Step ordering, priority, or scope — including "this step would be
  better split"
- Anything in `session-status.md`'s **"Things NOT to re-litigate"**

Use `gh issue create --template needs-architect.md`. State the step, the
exact ambiguity, and **both readings** — not a recommendation. A
recommendation is what a hurried person will treat as permission.

Then stop and take the next unassigned issue, or stop entirely if there
isn't one.

## Class C — park it silently

Ideas, convenience features, "we should also…", anything you noticed that
isn't broken. Do not open an issue and do not raise it in the PR. The
plan after the queue is a soft launch against real output, so that real
use decides what gets built rather than guesswork. An idle assistant
costs far less than an invented step.

The exception: something actually broken. That is an issue, always, even
if you cannot fix it.

## UI work is Class B by default — with one escape

Almost every UI choice is operator-visible, so on a plain reading of the
test, UI work would stop constantly. That is the correct default and it
is also useless.

The escape is `docs/ui-conventions.md`. **Anything that file settles is
Class A** — follow the convention, do not ask. Anything it does not
cover is Class B, and the right move is an issue proposing the
convention, not a one-off choice buried in a screen.

That is the intended pressure. Every UI question you have to ask is a
convention that should have been written down, and the file is supposed
to grow until the questions stop.

## When the classification itself is unclear

Treat it as Class B. Asking costs an issue and some waiting. Guessing
wrong on a Class B costs a corrupted ledger or a retrained auditor.

The asymmetry is the whole point, and it is not a nudge toward asking
about everything — Class A is genuinely yours, and running an
architect's eyes over a variable name wastes the one resource this
process is trying to protect.
