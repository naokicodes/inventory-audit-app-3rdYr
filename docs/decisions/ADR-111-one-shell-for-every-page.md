# ADR-111 One shell for every page: a top bar, one grouped menu, a Home of big buttons, the icon

- Status: Accepted 2026-11-22
- Decided by: Naoki
- Supersedes: -

## Context

beta-3 on an 11.5-inch tablet: Kitchen Sales was linked only from Home, while the menu's "Sales"
opened the typed sales page nobody uses in Beta; Home still read "Setup OK"; above 768px the link
row never wrapped, so its last links and the login link spilled past the bar; most pages were capped
at 700px. ui-conventions had deferred a fuller menu until the login and roles pages existed; they
exist now.

## Decision

- Every page gets the same shell from one shared script: a top bar with the logo and the app's name
  (Home), the person's name or a big Log in; one menu built from one list in four groups (Kitchen,
  Commissary, Management, Admin); a Menu button below 768px; the groups wrapping inside their bar
  above it.
- Everyone sees every link for now: the shell builds habits while the accounts are not ready.
  Following each person's roles comes with login-tonight; the server's refusals stay the guard.
- Home becomes big buttons for the same groups, with a slot at the top for login-tonight's Tonight
  card. The login page puts this phone's recent names first and has a find box.
- Two widths: narrow for the login page and Home, wide (1200px) for every other page.
- The typed sales page is "Typed sales" under Admin; Kitchen Sales is in the menu.
- The Silingan logo is the app icon, with a manifest for Add to Home screen. A tab-free app window
  needs HTTPS and is decided with hosting.

## Why

Testers should not hunt for the page they need, and the habits staff form in Beta should be the
ones the app keeps. The front end can change now without the server; the full visual pass waits
for the pages the roster and login steps change.

## Consequences

Step ui-shell (beta-3.1). ui-conventions gains the shell and the widths.

## Reopen only if

Staff testing shows the groups do not match how they work, or hosting brings HTTPS (then the
tab-free window).

## Sources

Architect chat 2026-11-22 (late: the tablet screenshots and answers 1 to 6).
