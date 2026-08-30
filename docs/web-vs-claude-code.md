# Web chat vs. Claude Code — when to use which

This doc explains the *why* behind the architect/worker split already
described in `rules-for-claude-code.md` (rule 18). That rule assumes the
split exists; this doc is for deciding, in the moment, which side of it
a given task belongs on.

## The core difference

Claude.ai web chat can run real commands in a sandbox — clone this repo,
`npm install`, run the actual test suite, edit files, commit. It is not
guessing from a text description; when it says tests pass, it ran them.

The difference from Claude Code isn't "verifies vs. assumes." It's
**setup cost per session**. Web chat's sandbox is fresh and isolated
every conversation — nothing persists, so each session re-pays the full
`git clone` + `npm install` cost before it can run a single test. Claude
Code runs against this project's actual local checkout: already cloned,
dependencies already installed, `CLAUDE.md`/these docs already
available. It skips that setup tax entirely.

That's the whole trade-off. Pick based on how many times, in a row,
you're about to touch the repo.

## Use web chat for

- **The architecture conversation itself** — working through schema
  questions, edge cases, naming, whether a design decision holds up,
  before any code exists to write. No repo needed yet.
- **A one-off independent verification pass** — spinning up a clean
  sandbox specifically *because* it has no memory of what a worker
  session assumed, to re-clone and re-test everything from zero. This is
  what the architect side of rule 18 does: pull, run the baseline suite,
  check what a worker flagged, verify claims rather than trust commit
  messages.
- **Anything that's genuinely a single clone-test-verify cycle**, not the
  start of a longer build loop.

## Use Claude Code for

- **The actual implementation loop** — writing code, running tests,
  fixing what fails, repeating. This is where re-paying the clone/install
  cost every round on web chat would actually add up; Claude Code just
  runs against the checkout that's already there.
- **Any step from `session-status.md`'s roadmap.** Per rule 16, each step
  is sized to fit one focused session — that's a Claude Code worker
  session, not a web chat.
- **Anything needing this project's accumulated context across many
  turns** — the docs in this folder, prior decisions, conventions —
  without re-reading and re-establishing all of it from scratch.

## Rough rule of thumb

Touching the repo **once** to verify something → web chat (fresh,
isolated, arguably better for that specific job). Touching it **many
times in a row** to build something out → Claude Code (no repeated setup
tax, persistent project context).

## How this maps onto rule 18's architect/worker split

- The **architect conversation** (web chat, this doc's "use web chat
  for" list) plans steps, reviews what landed, and does independent
  verification.
- **Coder workers** (Claude Code, this doc's "use Claude Code for" list)
  execute one sized step at a time, test it live, commit, and push.

The split in rule 18 already reflects this reasoning — this doc just
makes the "why" explicit so it doesn't have to be re-derived each time
it's questioned.
