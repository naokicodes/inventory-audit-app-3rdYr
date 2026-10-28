# Click-through checks for `public/` steps

Any step that touches `public/` needs a click-through before merge (ADR-002, `/naoki-qs` merge
policy).

1. **Chrome runs the checklist.** Claude in Chrome opens the page at 390px wide (a same-origin
   iframe works well) and at desktop width, and walks the step's "Click-through" line plus its
   Edge states.
2. **A person checks a real phone.** Naoki (or a tester) opens the same build on a phone on the
   restaurant or home Wi-Fi.
3. **Record it.** Put the commit hash that was checked, the date, and what was checked in the PR
   (a comment or the description). A later commit on the branch needs a new check.

Blind-count steps add one check: as a counter, the numbers must not appear in View Source or the
network response, not only on screen.
