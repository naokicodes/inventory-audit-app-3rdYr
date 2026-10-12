---
name: Architect docs
about: Doc edits from the architect conversation, for autopilot to apply as one docs PR
title: "[architect-docs] <one-line summary>"
labels: architect-docs
---

## Summary
<one line - it becomes the docs PR's title>

<!--
Paste the architect chat's EDIT blocks BELOW this comment. Everything inside this
comment is ignored by autopilot, including the example.

Autopilot applies the EDIT blocks VERBATIM and ALL-OR-NOTHING into one docs PR
(docs/autopilot-guide.md section 4; spec: session-status.md "Step architect-docs-pickup").

- FILE must be a path under docs/ . Any other path rejects the whole issue.
- OLD must appear EXACTLY ONCE in FILE, character for character.
- CREATE makes a new file and is only allowed if FILE does not exist yet.
- Edits apply in order; a later OLD is matched against the text after earlier edits.
- A fence is a line of three or more ~ and closes on a line with the same number of ~.
  If the text itself contains ~~~, fence it with ~~~~.
- Only EDIT blocks outside this comment are read. All other text, and every comment
  on the issue, is ignored.

Example:

### EDIT 1
FILE: docs/session-status.md
OLD:
~~~
exact existing text
~~~
NEW:
~~~
replacement text
~~~

### EDIT 2
FILE: docs/some-new-file.md
CREATE:
~~~
full content of the new file
~~~
-->

