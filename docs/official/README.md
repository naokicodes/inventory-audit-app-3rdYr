# Official documentation

**For:** anyone outside the build loop - the owners and management, Prince (SPOS), staff
trainers, and whoever maintains the app later.

This folder is the plain-language description of the Inventory Audit App **as it is**. The rest
of `docs/` is the working record: step specs, decisions as they are made, the queue and the
engineer's rules. Read this folder to understand the app; read the rest to change it.

## Rules for this folder

1. **Built or settled only.** Each page marks what is **Built** and what is **Planned**. No step
   numbers, no open questions, no options under discussion.
2. **`docs/session-status.md` is the record.** If a page here disagrees with it, session-status
   wins and the page gets fixed.
3. **The repo is public.** No real prices or costs, no credentials, no staff personal details, no
   sales figures. Examples use sample numbers.
4. **Plain language, one topic per page,** written for the reader named at its top.
5. **Every page ends with "Last checked"** - the date and the `main` commit it was checked against.
6. **The architect maintains it** (a drop-in or an architect-docs issue). A build step edits a
   page here only when its spec says so.

## Contents

| Page | For | Status |
|---|---|---|
| [system-overview.md](system-overview.md) - what the app is, who uses what, how it fits with SPOS | everyone | written |
| [glossary.md](glossary.md) - the words the kitchens and the app use | everyone | written |
| staff-guide.md - the daily count on a phone | staff | to write, after the UI pass |
| management-guide.md - reading the dashboard | management | to write, with the dashboard |
| admin-guide.md - items, recipes, sites, roles | admins | to write |
| spos-integration.md - exactly what crosses between the two apps | Prince, maintainers | to write |
| running-the-app.md - install, start, reset Beta, back up | whoever runs the server | to write |

---
Last checked: 2026-10-19, against `main` `a6ec30d` plus the decisions recorded that day.
