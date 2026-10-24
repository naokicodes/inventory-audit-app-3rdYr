---
description: Quick issue report — read every open issue at once and write one plain report Naoki can paste into a fresh architect chat. Read-only.
---

Read every open issue, group them, and write one report. Best run in a fresh
conversation (`/clear` first).

**Read-only.** Never comment, label, close, assign, push, or edit a file in the
repo. The only file you write is the report, and it goes outside the repo so it
can never be committed.

## 1. Ground

`git fetch origin` and note `main`'s short hash. Read `docs/dispatch-queue.md`
and the "Things NOT to re-litigate" list in `docs/session-status.md`.

## 2. Gather

```
gh issue list --state open --limit 100 --json number,title,labels,author,createdAt,updatedAt
```
For each issue: `gh issue view <n> --comments`. Note any PR or step it names.

## 3. Sort each issue into exactly one group

- **Decisions needed**: label `needs-architect`. For each: the step it parks (the
  title's `Step <step-id>`), the question in one sentence, Reading A and Reading
  B copied from the issue evenly, the silent doc section, any linked PR, and the
  steps waiting behind it (from `dispatch-queue.md`). Then check whether `main`
  already answers it: if `docs/session-status.md` or `docs/decisions/` changed
  after the issue was opened and covers the question, write "may already be
  answered in <file + heading>".
- **Doc requests**: label `architect-docs`. One line each.
- **Bugs**: Beta reports and anything describing broken behavior. Merge
  duplicates into one entry and count the reports. For each: page, what happens,
  how to make it happen again, and how bad, using exactly one of: **wrong
  number** (a count, balance, variance, yield or peso figure is wrong),
  **stops work** (someone can't finish their task), **looks wrong** (everything
  else).
- **Probably stale**: the step it names is CLOSED in `dispatch-queue.md` or its
  PR is merged. Say why in one line; do not close it.
- **Other**: one line each.

## 4. Write the report

Save to `~/Downloads/naoki-qi-<yyyy-mm-dd-hhmm>.md`. In the terminal print only
the file path and the count per group.

```
# Issue report - <date time>, main at <short hash>
Paste into a fresh architect chat in the Auditing WebApp project.

Decisions: n · Doc requests: n · Bugs: n (wrong number: n, stops work: n, looks wrong: n) · Probably stale: n · Other: n

## Decisions needed
### #<n> - Step <step-id>: <the question, in plain words>
- Reading A: <...>
- Reading B: <...>   (evenly, no recommendation)
- Silent doc section: <file + heading>
- Linked PR: #<n> or none · Waiting behind it: <steps>
- <"may already be answered in ..." if it applies>

## Bugs
### <page>: <what happens> (<how bad>, <k> reports: #a, #b)
- To repeat: <steps>

## Doc requests / Probably stale / Other
- #<n> - <one line>
```

Rules for the report: plain words. Decisions first, then bugs with **wrong
number** before **stops work** before **looks wrong**. Copy questions and
readings from the issue, never invent one, and never add a recommendation. No
prices, costs, supplier or staff names, even if an issue contains them. Under
200 lines.

Verify, don't assert: every line comes from real command output.
