# Rules for Claude Code

Read this at the start of any session touching this project. These are
standing constraints, not suggestions — they exist to keep a solo,
2-hours-a-day project from drifting into something unmaintainable.

## Before writing code
1. **Read the relevant docs first** (`data-model.md`, `scope.md`,
   `daily-workflow.md`, `tech-stack.md`, and `loyverse-sync.md` if
   touching sync). Don't guess at schema, formulas, or scope — they're
   already defined.
2. **State the plan briefly before implementing** — what files will
   change, what won't. Small, reviewable steps over large ones.
3. **If a task isn't covered by these docs, or seems to require expanding
   scope, stop and ask** rather than making an assumption and building on
   top of it.

## While writing code
4. **Calculated values are never hardcoded or stored redundantly.**
   Beginning stock, usage, expected ending, variance — always computed
   from the underlying input tables per the formulas in `data-model.md`,
   not written as static numbers or cached without a clear invalidation
   plan.
5. **Match the tech stack in `tech-stack.md` exactly.** Don't introduce
   Postgres, Docker, React, a heavy ORM, or cloud dependencies without
   an explicit conversation first — these are deliberate exclusions, not
   oversights.
6. **Write tests for the audit engine specifically**, using real numbers
   (from the original spreadsheet's stress-tested examples where
   possible) as the expected answers. This is the one part of the app
   that must never be silently wrong.
7. **Don't modify these docs directly.** If something here turns out to
   be wrong or incomplete once implementation reveals a gap, flag it and
   the doc gets updated deliberately (outside of a pure coding session),
   not edited inline as a side effect of writing code.
8. **Small, focused commits — but committing is a separate, later step**
   from testing (see the GitHub setup guide). Don't feel pressure to
   commit before something is actually working; freely iterate first.

## Specific to this project
9. **The worker-facing (auditor's daily) screens must stay minimal** —
   see `daily-workflow.md`. No math visible, no recipe/admin concepts
   leaking into the daily entry forms.
10. **Recipe/BOM data is intentionally incomplete right now.** Don't try
    to "fill in" missing recipe quantities from assumptions — that's a
    real business decision that happens through the admin UI, made by a
    human, not inferred by code.
11. **Positive variance = shortage, negative = surplus.** This sign
    convention is fixed — don't flip it for "readability" without
    updating every doc and screen consistently.
12. **Photo attachments are references only** — never build automatic
    reading/OCR of the photos (explicitly deferred, see `scope.md`).
13. **The Loyverse sync is a later phase** (see `scope.md` and
    `loyverse-sync.md`) — don't let it block or complicate the core
    audit engine, which should work fine with manually-entered test
    sales data first.

## Red flags — stop and ask if you notice yourself about to do these
- Adding authentication/user roles beyond a single local user.
- Suggesting a hosted database or cloud deployment.
- Building features not listed in `scope.md`.
- Writing a calculation as a hardcoded number "for now."
- Silently changing the sign convention, units, or table names from
  `data-model.md`.
- Expanding the daily entry screens with anything beyond what
  `daily-workflow.md` describes.
