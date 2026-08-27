# Rules for Claude Code

Read this at the start of any session touching this project. These are
standing constraints, not suggestions — they exist to keep a solo,
2-hours-a-day project from drifting into something unmaintainable.

## Before writing code
1. **Read the relevant docs first** (`data-model.md`, `scope.md`,
   `daily-workflow.md`, `tech-stack.md`, `loyverse-sync.md` if touching
   sync, and `commissary-and-stock-receipts.md` if touching stock receipts,
   commissary yield, or the activity log). Don't guess at schema, formulas,
   or scope — they're already defined.
2. **State the plan briefly before implementing** — what files will
   change, what won't. Small, reviewable steps over large ones.
3. **If a task isn't covered by these docs, or seems to require expanding
   scope, stop and ask** rather than making an assumption and building on
   top of it.

## While writing code
4. **Calculated values are never hardcoded or stored redundantly.**
   Beginning stock, new stock, usage, expected ending, variance, commissary
   yield loss % and status — always computed from the underlying input
   tables per the formulas in `data-model.md`, not written as static
   numbers or cached without a clear invalidation plan.
5. **Match the tech stack in `tech-stack.md` exactly.** Don't introduce
   Postgres, Docker, React, a heavy ORM, or cloud dependencies without
   an explicit conversation first.
6. **Write tests for the audit engine specifically** (and the commissary
   yield engine, once built), using real numbers from the original
   spreadsheets as the expected answers. This is the part that must never
   be silently wrong.
7. **Don't modify these docs directly.** If something here turns out to
   be wrong or incomplete once implementation reveals a gap, flag it and
   the doc gets updated deliberately (outside of a pure coding session),
   not edited inline as a side effect of writing code.
8. **Small, focused commits — but committing is a separate, later step**
   from testing. Don't feel pressure to commit before something is
   actually working; freely iterate first.
9. **Every write to `stock_receipts` or `commissary_yield_log` logs to
   `activity_log`** with a before/after snapshot, in the same transaction
   as the write it's logging. Deletes on those two tables are soft
   (`deleted_at`), never a physical `DELETE`. See
   `commissary-and-stock-receipts.md` Part 3. This pattern is scoped to
   just these two tables for now — don't silently extend it to
   `ending_actual`/`adjustments`/`prepped`/`portion_ending_actual`; that's
   deliberate future work, tracked in `scope.md`.

## Specific to this project
10. **The worker-facing (auditor's daily) screens must stay minimal** —
    see `daily-workflow.md`. No math visible, no recipe/admin concepts
    leaking into the daily entry forms.
11. **Recipe/BOM data is intentionally incomplete right now.** Don't try
    to "fill in" missing recipe quantities from assumptions.
12. **Positive variance = shortage, negative = surplus.** This sign
    convention is fixed — don't flip it without updating every doc and
    screen consistently.
13. **Photo attachments are references only** — never build automatic
    reading/OCR of the photos.
14. **The Loyverse sync is a later phase** — don't let it block or
    complicate the core audit engine.
15. **Never infer `commissary_meat_map` rows from matching meat codes.**
    Commissary and restaurant meat numbering are confirmed NOT aligned
    (see `data-model.md` section 10) — mapping is explicit, admin-set data
    only.

## Red flags — stop and ask if you notice yourself about to do these
- Adding authentication/user roles beyond a single local user.
- Suggesting a hosted database or cloud deployment.
- Building features not listed in `scope.md`.
- Writing a calculation as a hardcoded number "for now."
- Silently changing the sign convention, units, or table names from
  `data-model.md`.
- Expanding the daily entry screens with anything beyond what
  `daily-workflow.md` describes.
- Matching a commissary meat to a restaurant meat by code string instead
  of via `commissary_meat_map`.
- A hard `DELETE` on `stock_receipts` or `commissary_yield_log` instead of
  a soft delete + activity log entry.
