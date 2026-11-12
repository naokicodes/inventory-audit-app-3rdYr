# ADR-039 Testing: Claude checks the logic, people check the looks; fake test accounts

- Status: Accepted 2026-11-02
- Decided by: Naoki
- Supersedes: none (sharpens `docs/click-through.md`)

## Context

Marble builds; he cannot test. Server logic is already tested by `npm run verify` on every PR.
Page behaviour (what saves, what shows, what is hidden) waited for a person. Previews and dev
databases reseed sample data whose only user is the bootstrap super-admin, so the blind view and
site access could not be clicked through at all. Real people are not in the app yet.

## Decision

- **Two halves.** A public step's click-through splits into **Claude checks** (page logic, run by
  Claude in Chrome on the PR's preview) and **You check** (looks, on a real phone, by Naoki or a
  tester). `docs/click-through.md` holds the prompt, the test accounts and the Beta smoke list.
- **Fake test accounts**, every name starting with "Test", made by a separate script
  (`npm run seed:test`, step test-accounts), never by the normal seed. The script refuses
  `inventory.db` and any `beta.db`. `preview.ps1` runs it after each reseed.
- **Real people** reach the restaurant PC only through the people workbook (import-identity).
- A step that adds a role, a switch or an access rule also adds the test account that shows it.
- Before each `beta-N` tag, Claude in Chrome runs the Beta smoke list on a throwaway database
  with the test accounts.

## Why

Logic errors get caught without waiting for a person, and people spend their checks on looks.
Fake accounts never mix with real counts, so history keeps saying who really counted (ADR-034:
the account says who you are). The normal seed also builds `beta.db`, so the fakes stay out of it.

## Consequences

- Specs written from now on name the test account to log in as and split the two lists. An
  older spec with one "Click-through" list is run whole by Claude.
- A laptop that tests with fakes uses a throwaway database (for example `dev.db`), not `beta.db`.

## Reopen only if

Testers need fake accounts on the restaurant PC itself.

## Sources

Architect chat 2026-11-02 (A0), items 4, 9, 10, 13.
