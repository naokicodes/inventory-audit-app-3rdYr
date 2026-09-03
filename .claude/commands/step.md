---
description: Run one queued step end to end — read, implement, verify, open a PR.
---

Run step **$ARGUMENTS** from start to pull request.

Do not skip a phase, and do not reorder them. Each one exists because
skipping it has caused a real problem on this project before.

## 1. Ground yourself in the real repo

```
git pull
git status -sb
git log --oneline -3
```

Paste the raw output. Not a description of it.

An architect's commits are invisible to a local checkout until you pull,
and generating a file overwrite from a stale copy has caused real
regressions here.

## 2. Establish the baseline before you touch anything

```
npm run verify
```

It must print `SUITE GREEN` and `AUDIT CLEAN`. If it does not, **stop
and report** — you have inherited a problem, and anything you build on
top of it will be blamed on you.

## 3. Read, in this order

- `docs/session-status.md` — the step's own section. This is the spec.
- `docs/decision-authority.md` — what you may decide alone.
- `docs/engineer-role.md` — the lane you are in and the git rules.
- `docs/rules-for-claude-code.md` — the standing constraints.

Use `graphify query "<question>"` for codebase questions rather than
reading files linearly. Reading large docs top to bottom is one of the
two things that caused a token cost regression on this project.

**Check the step's stated prerequisites against the code, not against the
step text.** On 2026-09-02 two columns had been in the schema and fully
read by the engine for two sub-steps while written by no route at all,
and the step list read as though the write path existed. Grep for the
actual write path before trusting that something exists.

## 4. State the plan, then implement

Before writing code, say briefly: which files change, what the approach
is, and what you are explicitly not touching. Then build it.

While you build:

- **Class A decisions are yours.** Naming, file placement, test shape,
  refactor shape, migration mechanics. Decide, keep a one-line note, move
  on. Do not ask.
- **Class B stops you.** Anything operator-visible, anything that changes
  a number, any new column or constraint, anything in "Things NOT to
  re-litigate". Go to phase 7.
- **Class C you park silently.** Ideas and improvements are not issues.

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` and cannot loosen a
constraint on an existing local `inventory.db`. Any such change needs an
idempotent helper in `server/db/migrate.js`, wired into `connection.js`
before `schema.sql` runs. Follow `migrateYieldLogInputQuantityColumn`.

## 5. Verify

```
npm run verify
```

Both lines green. If the audit fails because you added a column with no
writer yet, that is a real finding — do not silence it with an allowlist
entry on your own initiative. Adding an allowlist entry is Class B.

**If you touched `public/`, a green suite is not enough.** Three of the
last four dispatches found a real UI bug while the suite was fully green:
a wrong row key on the balance cards, a dropdown with no active filter,
a bad edit rejection. Start the server, open the screen, click the thing,
and write down what you actually saw. Then stop the server (rule 21).

## 6. Branch, commit, push, open the PR

Never push to `main`. Never force-push. Never merge your own PR.

```
git checkout -b <prefix>/<short-description>
git status --short
git add <specific paths>
git commit -m "<short subject>" -m "<what and why>"
git push -u origin <branch>
```

Then fill in `.github/pull_request_template.md` — copy it, complete every
section, and save the filled copy to a scratch file outside the repo.
Open the PR with it:

```
gh pr create --title "<short subject>" --body-file <path-to-filled-copy>
```

**Do not use `gh pr create --fill`.** It builds the body from your commit
message and silently skips the template, so the verify output, the
`public/` click-through, the scope check and the settled-decision check
all go missing.

**If `gh` is not installed**, do not stop and do not push to `main`. Push
the branch, save the filled template to a scratch file, and hand over both
the compare link
(`https://github.com/naokicodes/inventory-audit-app-3rdYr/pull/new/<branch>`)
and the file path, saying plainly that `gh` was missing. Note that the
architect then has to open the PR themselves and cannot approve it — so say
so, rather than leaving them to discover it at the merge gate.

Fill it in honestly, including the `npm run verify` output verbatim and
your Class A decisions. "I didn't check this" is a welcome answer. A
guess presented as a check is not.

Then paste the PR URL and **stop**. Do not merge.

## 7. If you hit a Class B question

```
gh issue create --template needs-architect.md
```

State the step, the exact ambiguity, and both readings — evenly, with no
recommendation. Include what you did *not* change, which is the box that
tells an architect whether you stopped in the right place.

Then stop. If partial work exists, push it as a draft PR and link it.
Do not resolve the ambiguity to keep moving.

## Reporting

Verify, don't assert. Never report something as done, passing, or pushed
because you believe it is — run it and paste the real output. A worker on
this project once reported a step as pushed, with a real commit hash and
a real test count, when the work had never left their local checkout.
