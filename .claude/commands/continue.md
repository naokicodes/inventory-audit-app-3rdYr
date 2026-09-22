---
description: Resume and finish the step /start selected — implement, verify, open the PR.
---

Proceed with the step you selected and planned in the `/start` output above.
This command finishes it. **If `/start` has not been run in this conversation,
stop and say so — run `/start` first.**

Follow the `/step` command's procedure from **phase 4 (implement) through phase 7
(open the PR)**, for the already-selected step. It is the same procedure, resumed
from the plan `/start` already stated — the full detail for each phase lives in
`/step`. These guardrails are non-negotiable and are restated here on purpose:

- **Implement.** Class A decisions are yours — name each in one line and move on.
  **Class B stops you**: anything operator-visible, anything that changes a
  balance/variance/yield number, any new column or constraint, anything in
  "Things NOT to re-litigate." Open a `needs-architect` issue
  (`gh issue create --template needs-architect.md`) with both readings and **no
  recommendation**, note what you did not change, then stop. Class C: park
  silently.
- **Verify** — `npm run verify`, both lines green. If you touched `public/`, start
  the server and click through the actual screen. Whatever you changed, grep for
  who calls it and exercise the route the way the real caller does (it may post
  every row on screen), not a minimal payload of your own design.
- **Branch, commit, push, open the PR** — never to `main`, never force-push, never
  merge your own PR. Fill `.github/pull_request_template.md` completely; do not
  use `gh pr create --fill`. If `gh` is missing, push the branch and hand over the
  compare link plus the filled template, and say plainly that the architect must
  open the PR and cannot then approve it.
- **Report** — paste the PR URL and the verbatim `npm run verify` output, then
  stop. Do not merge.

Verify, don't assert — run it and paste the real output; never report something
as done or pushed because you believe it is.
