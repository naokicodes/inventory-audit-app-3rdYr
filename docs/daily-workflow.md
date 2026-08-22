# Daily Workflow — what the auditor actually does

This describes the real, repeated daily task the app needs to support well.
Build the UI to match this flow exactly — don't add steps, screens, or
decisions beyond what's here without checking first.

## Who
One person (the auditor / your friend), transcribing numbers from photos
that restaurant staff send, for all 3 restaurants, from one computer.

## The daily loop, per restaurant

1. **Open the app** → pick a restaurant from a dropdown/selector at the top.
2. **Pick the date** (usually today, but should allow going back to fix a
   missed/wrong entry from a prior day).
3. **New Stock screen**: a flat list of the restaurant's active meat items,
   each with a number field. Type the quantity delivered that day, per item,
   straight from the staff photo. Optionally attach the photo itself to the
   entry. Zero is a valid, common entry (no delivery that day) — don't force
   the field to be filled with something non-zero.
4. **Ending Actual screen**: same shape as New Stock, but this is the
   physical closing count per meat item, straight from the staff's
   end-of-day photo. Optionally attach the photo.
5. **Prepped screen** (only for Batch-Prepped dishes): a flat list of
   Batch-Prepped dishes, with a number field for portions actually cooked
   that day (not sold — cooked). Same "type from the photo" pattern.
6. **(If in use) Portion Ending Actual screen**: physical count of ready,
   unsold portions for Batch-Prepped dishes, same pattern as Ending Actual.
7. **Save.** No calculate button needed to be separate — saving a day's
   entries should make the calculated values (beginning, usage, expected
   ending, variance) available immediately wherever they're shown.
8. **(Occasionally) Adjustments**: if something's known — waste, a transfer,
   a staff meal — log it against a meat item, a category (from the
   admin-managed adjustment_types list), a quantity, and optionally a
   from/to location if it's a transfer. This is occasional, not daily-forced.

## What the auditor NEVER has to do
- No manual sales entry (comes from Loyverse sync).
- No recipe/BOM editing (that's a separate admin task, not daily).
- No manual calculation of beginning stock, usage, expected ending, or
  variance — all computed and just displayed.
- No math of any kind, visible or implied, in the daily entry screens.

## Reviewing results
- A simple **variance view** per restaurant per day (or date range): each
  meat item, its variance, and a status (OK / Shortage / Surplus), color-
  coded, sorted so the worst issues are easiest to spot.
- A **weekly view**: same idea, rolled up, so a bad week is visible without
  scrolling through daily entries one by one.
- These are read-only summary screens — no editing happens here, only in the
  entry screens described above.

## Photo attachments
- Optional per entry (new stock, ending actual, prepped, portion ending).
- Stored as a local file (e.g. `/uploads/<restaurant>/<date>/<type>.jpg`),
  path referenced in the corresponding database row — see data-model.md.
- Purpose is later verification if a variance looks suspicious, not OCR or
  automated reading (see scope.md — that's explicitly deferred).

## Mobile-friendliness
Not required for MVP, since the auditor works from one computer, but avoid
building anything that would make a later phone-friendly version painful
(e.g. keep forms simple, avoid tiny click targets, avoid anything that
requires a large screen to function).
