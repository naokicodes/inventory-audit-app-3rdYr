# ADR-047 People import: held duplicates, loose names, full site lists

- Status: Accepted 2026-11-12
- Decided by: Naoki
- Supersedes: import-identity's add-only memberships ("insert (user_id, site_code) when it
  resolves"), for removals only

## Context

Step import-identity (3j, PR #65) loads the off-repo people workbook (Roles.csv, Users.csv) into
roles, users and user_sites. Its spec listed duplicate names in the report but did not say what
happens to those rows (issue #66). It also only ever added site memberships, while its export
writes each person's full site list for the export -> edit -> import round trip.

## Decision

- **Duplicates are held.** A name on more than one row is not imported at all, in either tab.
  Every row with that name is skipped and reported; the role or person keeps what the app had,
  and a new person is not added, until the sheet is fixed and the import runs again. Two people
  who share a nickname get a specifier in the sheet.
- **Names match loosely.** Names compare ignoring capitals and extra spaces, for the duplicate
  check and for finding an existing person or role. A person whose stored name differs only that
  way takes the sheet's spelling; a role keeps the app's spelling.
- **A person's sites cell is their full list.** The import adds sites the cell lists and removes
  the ones it no longer lists, and the report shows every removal. A skipped row changes
  nothing. If any code in the cell does not resolve, the good codes are added and nothing is
  removed for that person. A blank cell means no sites. People not in the sheet are untouched.
- Unchanged: the workbook's super-admin row renames the one bootstrap super-admin, and its
  active = 0 is ignored.

## Why

- Role and site access are permissions: the head-chef role is the landing (ADR-035) and roles
  decide blind counting (ADR-038). The import must not guess between two rows. Holding costs
  one fix and a rerun, and the import is built to be rerun.
- "Kim" and "kim" are one person to staff; a second login entry would split their history.
- Add-only memberships made the export disagree with the sheet after an edit and left access
  behind once site-filter enforces sites; nothing else in the app removes a membership. The
  unresolved-code guard keeps a typo from stripping access.

## Consequences

- PR #65 changes in its own files: a two-pass duplicate check, a normalized name key, membership
  removal, and new report sections. No schema change; login keys on user_id, so a spelling
  update is safe. Roles are never renamed because code looks some up by name.
- Later import tabs (Stations, Staff, role assignments) say in their own specs whether these
  rules apply.

## Reopen only if

A screen in the app starts editing memberships, so the sheet stops being the only source of
truth for people (its spec must then say how the two share it), or people need more than one
row each.

## Sources

Issue #66 and PR #65 (2026-11-12); session-status "Step import-identity", decision block
2026-11-12; architect chat 2026-11-12 (A0, "recs").
