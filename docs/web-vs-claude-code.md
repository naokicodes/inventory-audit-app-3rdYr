# Web chat vs. Claude Code — when to use which

**2026-08-31 correction**: this doc was written describing Claude Code as
already in use for implementation work. That was wrong — checked against
what actually happened: every step through 23a's architecture (1–22, all of
Round 2, item 3's design, multi-stage yield's design) was built by "coder
worker" sessions that are **free-tier Claude.ai web chat**, same sandboxed
setup rule 18 in `rules-for-claude-code.md` describes (fresh clone, uneven
network/push access, hand off files or push if credentials allow). Literal
Claude Code (the CLI/app product, running against the project owner's own
local checkout) has **not been used yet** — 23a is its first real step. The
reasoning below about setup cost is still correct and is *why* the switch is
happening now; it just wasn't already true. Don't read the rest of this file
as a history of what was done — read it as the plan starting at 23a.

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

## Push access — the other real difference, not yet confirmed

Free-tier web chat "coder workers" have **uneven** git push access per rule
18 — some sessions get read-only network, some get none, and the standing
handoff format (individual files + exact `git add`/`git commit` commands for
the project owner to run) exists specifically to work around that
unevenness. Claude Code, running on the project owner's own machine against
their own local checkout, should in principle have whatever git credentials
are already configured there — which would make direct push the normal case,
not the exception, collapsing most of rule 18's file-handoff dance for
Claude Code sessions specifically.

**This is not yet confirmed** — whether the project owner's local Claude Code
setup actually has push credentials configured needs a direct answer before
rule 18 gets amended to say so. Until confirmed, a Claude Code session should
try `git push` and fall back to rule 18's standard file-handoff format if it
fails, same as any worker — not assume push will work.

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

## Token-efficiency notes (2026-08-31)

Raised directly by the project owner — is the current doc-reading pattern
actually efficient for Claude Code, or just habit carried over from web
chat's fresh-sandbox constraint?

- **Claude Code doesn't need to re-read everything from zero each session**
  the way a fresh web chat does — it can carry a persistent `CLAUDE.md` and
  hold context across a longer working session without re-establishing it
  every message. The `docs/rules-for-claude-code.md` → `session-status.md`
  reading order (rule per this project) still applies at the *start* of a
  session, but shouldn't need repeating mid-session the way a stateless web
  chat effectively does.
- **`session-status.md` itself is now large (1700+ lines) and mixes current
  truth with a lot of resolved historical narrative** (full Round 1 and
  Round 2 write-ups, old step-by-step reasoning that's fully done and
  verified). Every session — web chat or Claude Code — pays to read all of
  it per the standing instruction ("read this first"), even though most of
  it is dead weight for someone about to build step 24a. **Not fixed in this
  session** — a real trim (moving fully-resolved, no-longer-actionable
  sections into `changelog.md` or a dedicated archive doc, leaving
  `session-status.md` as just current/active state) would measurably cut
  the per-session reading cost for every future worker, Claude Code or web
  chat. Flagging this as a real, worthwhile cleanup — not done here since it
  touches a lot of the file and deserves its own pass, not a rider on
  today's architecture session.
- **`graphify`** (github.com/Graphify-Labs/graphify), raised by the project
  owner, turns out to be a direct fit for the problem above — confirmed by
  reading its actual docs, not assumed. It builds a local, deterministic
  code+docs graph (`graphify-out/graph.json`) that Claude Code queries
  (`graphify query "..."`) instead of reading files linearly, and it has a
  first-class Claude Code integration: `graphify hook install` keeps the
  graph current automatically on every commit/branch switch, and
  `graphify claude install [--project] [--strict]` writes a `CLAUDE.md`
  section + a `PreToolUse` hook that nudges (soft) or blocks-and-redirects
  (`--strict`) a raw file read toward a graph query instead.
  - **This pairs directly with the project owner's `/clear`-after-each-
    shipped-feature discipline.** `/clear` resets Claude Code's
    *conversation*, but the graph is a file on disk (and, per graphify's
    own recommendation, committed to git) — it doesn't reset with the
    chat. A freshly-cleared session queries the graph for what changed
    instead of re-reading `session-status.md`'s full 1700+ lines cold
    every time. This is the actual fix for the token-efficiency problem
    flagged above, not a maybe.
  - **Adopt it for step 23a onward, not retroactively.** Once installed
    (`uv tool install graphifyy` or `pipx install graphifyy`, then
    `graphify install` inside the repo), run `/graphify .` once to build
    the initial graph, `graphify hook install` so it self-updates on
    every commit, and `graphify claude install --project` (start without
    `--strict` — nudge, not block, until it's clear the graph is actually
    reliable for this repo).
  - **`.gitignore` needs one more line**, per graphify's own team-setup
    guidance: `graphify-out/cost.json` (local-only run cost, not shared).
    `graphify-out/` itself (`graph.json`, `GRAPH_REPORT.md`) is meant to
    be **committed** — the whole point is that the next session (Claude
    Code or a teammate) starts with the map already built, not rebuilding
    it from zero.
  - **Correction, 2026-08-31 (same day)**: the `.gitignore` entry above was
    initially too broad — a blanket `.claude/` ignore, added before
    `graphify claude install --project` had actually been run. Checked
    against graphify's own docs: a project-scoped install writes
    `.claude/skills/graphify/SKILL.md` (+ a `references/` sidecar) and
    explicitly prints a `git add` hint for it — meant to be **committed**,
    same as the root `CLAUDE.md` it also writes, not machine-local state.
    Narrowed to `.claude/settings.local.json` only (the actual
    machine-local file — API keys, personal tool permissions). `CLAUDE.md`
    and `.claude/skills/` are shared project config now, not ignored.
  - **A separate `.claudeignore` is worth adding too** (not the same file
    as `.gitignore` — different purpose): `graph.json` and `graphify-out/`
    should be committed to git but *excluded from Claude Code's own
    context uploads*, per graphify's own troubleshooting note — otherwise
    every `graphify extract`/`update` invalidates Claude Code's prompt
    cache by re-uploading the whole graph file as raw context on the next
    turn, which is exactly the token cost this is supposed to avoid. The
    graph gets *queried* via the CLI/skill, never read as raw context.
  - **Still genuinely untested on this specific repo** — the recall/
    accuracy numbers in graphify's own benchmarks are on other codebases,
    not this one. Worth treating as "on" but not yet fully trusted for a
    step or two, same caution as any new tool in the loop.

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
