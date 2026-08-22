# Tech Stack — locked in, don't deviate without discussion

This is a deliberately small, boring stack for a solo/2-hours-a-day builder
running one local app for one auditor. Every choice below trades away
"impressive architecture" for "actually finishable and maintainable alone."
If Claude Code suggests something heavier (Postgres, Docker, React,
microservices, cloud hosting, etc.), that's a flag to stop and check in
before proceeding — it's very likely solving a problem this project doesn't
have.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js (LTS) | Already being installed via the setup script; runs both the backend and Claude Code itself |
| Backend | Plain Node.js + a minimal framework (Express is fine) | No need for NestJS-level structure at this scale |
| Database | **SQLite**, single file | Handles this data volume (3 restaurants, ~15 meats, ~80 dishes, years of daily rows) without breaking a sweat. One file = trivial backup (copy it). No server process to manage. |
| ORM / DB access | Keep it simple — a lightweight query layer (e.g. `better-sqlite3` directly, or a thin wrapper) rather than a heavy ORM like Prisma, unless it later proves genuinely painful | Less tooling to learn/debug for a solo dev |
| Frontend | Plain HTML + CSS + vanilla JavaScript (or a very light templating approach) | No React/build-step needed for forms this simple; fewer moving parts, faster to iterate on with Claude Code |
| File uploads (photos) | Saved to a local folder (e.g. `/uploads/`), path stored in the DB | No cloud storage needed for a local single-machine app |
| Hosting | **None — runs locally** on the auditor's machine, `npm run dev` style | See scope.md — not networked, not cloud-hosted, by design |
| Version control | Git + private GitHub repo | Code and docs only — never the database file or uploads (see .gitignore in the GitHub setup guide) |
| Testing | A lightweight test runner (e.g. Node's built-in `node:test`, or Vitest if it's needed) covering the audit engine's math specifically | The calculation logic is the part that must never be silently wrong — test it directly with real numbers from the old spreadsheet |

## Explicitly NOT using (for now)
- **Postgres** — SQLite is enough at this scale; adds a server process and
  setup complexity with no real benefit here.
- **Docker** — nothing to containerize when there's no multi-service stack
  or deployment target yet.
- **React / any frontend framework** — the forms are simple enough that
  plain HTML/JS is faster to build and easier for Claude Code to reason
  about in small increments.
- **Prisma or another heavy ORM** — one more thing to learn and debug;
  revisit only if raw queries genuinely become unmanageable.
- **Cloud hosting (Vercel/Render/etc.)** — not needed until/unless this
  becomes multi-location (see scope.md), which is a deliberate future
  decision, not a default.
- **Authentication/authorization system** — single local user, see scope.md.

## Project structure (starting point)
```
inventory-audit-app/
├── docs/                    <- these rules docs
├── server/
│   ├── db/                  <- SQLite file lives here (gitignored) + schema/migrations
│   ├── engines/             <- audit-engine.js, recipe-engine.js — pure calculation logic, tested independently
│   ├── routes/               <- API endpoints
│   └── index.js              <- server entry point
├── public/                   <- plain HTML/CSS/JS frontend
├── uploads/                   <- photo attachments (gitignored)
├── tests/
├── .env                       <- secrets (gitignored)
├── .gitignore
└── package.json
```
Keep this flat and boring. Don't add folders/layers speculatively for
features that aren't being built yet.

## When to revisit this doc
If the app is later handed to multiple simultaneous users, moved to a
shared server, or needs to survive far larger data volumes than described
in scope.md — that's when Postgres/hosting/auth become worth discussing.
Not before.
