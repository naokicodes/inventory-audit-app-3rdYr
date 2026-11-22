# Running the app - the restaurant PC

**For:** whoever runs the server: an admin who does not code. It covers what beta-3's launcher
(`scripts/restaurant-pc.bat`) does. What beta-4 changes is listed at the end, under **Planned**.

## What runs where (Built)

The app runs on one Windows PC at the restaurant (the **restaurant PC**). It stays on; phones open
the app in their browser. Everything lives in one folder, `%USERPROFILE%\InventoryApp`
(`C:\Users\<the Windows user>\InventoryApp`):

| In InventoryApp | What it is |
|---|---|
| `inventory-audit-app-3rdYr\` | The app, pinned to one version (a tag: beta-1, beta-2, ...). Never edit files in it. |
| `inventory-audit-app-3rdYr\.env` | The settings file: which database, the port, the three Loyverse tokens. Private: never send, post or photograph it. |
| `inventory-audit-app-3rdYr\server\db\beta.db` | The data. While the app runs, `beta.db-wal` and `beta.db-shm` beside it are part of it. |
| `backups\` | A copy of the data from every start (the newest 14 are kept). |
| `restaurant-pc.bat` | The launcher. The desktop file "Start Inventory App" calls it. |
| `last-verify.log` | The newest self-test. |

Phones on the restaurant network open `http://<the PC's address>:3000`; the start window prints
the address. Phones away from the restaurant use Tailscale (the last section).

## Every day: start the app (Built)

1. Double-click **Start Inventory App** on the desktop.
2. It backs up the data, shows `Version: beta-N` and the phone link, and runs the app.
3. Keep the window open (minimize it). Closing it stops the app.

| The window says | Do this |
|---|---|
| `[X] The app is already running - port 3000 is in use.` | A window is already open: use it. |
| `[!] The backup failed - see above. The app starts anyway` | Check the free space on C:. |
| `[X] .env does not point at the Beta database` | Someone changed `.env`. Its line must read `DB_PATH=server/db/beta.db`. |

## A new version: update (Built)

A version is a tag. The person in charge of the app makes a tag only after its checks pass, and
says which one to install.

1. Close the app window.
2. Open Command Prompt (Start, type `cmd`, Enter).
3. Type `"%USERPROFILE%\InventoryApp\restaurant-pc.bat" update beta-N` and press Enter. (Without
   the tag it lists the versions and asks which.)
4. It shows `Now: <old>    Moving to: beta-N`, backs up the data, downloads the version, installs
   its parts and runs the self-test (about a minute).
5. `Done: this PC is on beta-N.` Then run the setup once ("Run the setup again", below): until
   beta-4, an update does not refresh the launcher copy, and the setup also asks for any new
   setting.
6. Start the app with the desktop file. The database upgrades itself on the first start.

| The window says | What happened |
|---|---|
| `[X] The app is running. Close its window first` | Nothing changed. Close the app window and run it again. |
| `[X] Files in the app folder were edited by hand, so the update stopped.` | Nothing changed. Someone edited the app's files: ask the person in charge. |
| `[X] Could not reach GitHub.` | Nothing changed. Check the internet and run it again. |
| `[X] There is no tag "..."` | Nothing changed. Check the name against the list it prints. |
| `[X] The backup failed, so the update stopped.` | Nothing changed. Free some space on C:. |
| `[!] beta-N failed its check - going back to <old>.` then `Back on <old>.` | The new version did not pass its self-test; the PC stays on the old one and the data was not changed. Send `last-verify.log` to the person in charge. |
| `[X] Could not go back to <old> by itself. Do NOT start the app.` | Send a photo of the window to the person in charge. |

## Run the setup again (Built)

Double-click `%USERPROFILE%\InventoryApp\inventory-audit-app-3rdYr\scripts\restaurant-pc.bat`. It
is safe to run any time the app is closed: it skips what is already done, and it never changes
the app's version or an existing `beta.db`. Its steps:

1. **[1/9]** checks Git and Node.js (22.13 or newer).
2. **[2/9] to [4/9]** check VS Code, Claude Code and graphify, and install them if missing. The app
   needs none of them; let these steps run or fail (Planned: they go in beta-4).
3. **[5/9]** keeps the app folder as it is. **[6/9]** its parts.
4. **[7/9]** keeps `.env`. If `.env` has no FC line, it asks for FC's Loyverse token once: paste
   it and press Enter, or press Enter to skip.
5. **[8/9]** creates `beta.db` with the starting data **only if there is none**.
6. **[9/9]** the self-test.
7. A Windows permission prompt: click **Yes**. It opens port 3000 to phones on this network and on
   Tailscale, and stops the PC from sleeping while plugged in.
8. It refreshes the launcher copy and the desktop file, then asks `Start the app now`.

## First install on an empty PC (Built)

Only for a PC with no `InventoryApp` folder. If the folder exists, the setup keeps what is in it:
use "A new version" and, for clean data, "Start over with a fresh database".

1. Install Git and Node.js LTS, for example in Command Prompt:
   `winget install --id Git.Git -e --source winget` and
   `winget install --id OpenJS.NodeJS.LTS -e --source winget`. Close and reopen Command Prompt.
2. Get the setup with git, not from GitHub's web page (a downloaded `.bat` has line endings that
   Command Prompt can misread):
   `git clone https://github.com/naokicodes/inventory-audit-app-3rdYr.git "%TEMP%\inventory-app-setup"`
3. Double-click `%TEMP%\inventory-app-setup\scripts\restaurant-pc.bat`. It downloads the app into
   `InventoryApp`, pins it to the newest version, asks the three Loyverse tokens (Silingan, Likod,
   FC; Enter skips one), creates `beta.db`, runs the self-test and asks for the Windows permission.
4. In the router, reserve the PC's address (Deco app: More -> Advanced -> Address Reservation) so
   the phone link never changes. The PC and the counting phones use the cashier network, never a
   guest network.
5. At `Start the app now`, press N. Add the people (below), then start the app.

## Start over with a fresh database, the old one kept aside (Built)

Only before real data exists, or when the person in charge says so. Nothing is deleted.

1. Close the app window. If a new version is due, update first.
2. In File Explorer, make a folder `%USERPROFILE%\InventoryApp\old-beta-db-<today's date>`.
3. Open `%USERPROFILE%\InventoryApp\inventory-audit-app-3rdYr\server\db` and move **every file
   whose name starts with `beta.db`** (`beta.db`, and `beta.db-wal` and `beta.db-shm` if they are
   there) into that folder. Move them together: a `-wal` file left beside a new `beta.db` can
   damage it.
4. Run the setup ("Run the setup again"). Step [8/9] says
   `Created server\db\beta.db with the starting data.`
5. At `Start the app now`, press N. Add the people (below), then start the app.
6. Each site's first count of the month starts in the **Month opening** panel at the top of
   Landing.

To go back to the old data: close the app, move the new `beta.db*` files into another folder, and
move the old ones back into `server\db`.

## Add people: the people import (Built)

People come from the people workbook, saved as one CSV file per tab. `Users.csv` has the columns
`name, default_role, active, site_memberships`: a nickname, a role (`super-admin`, `admin`,
`management`, `head-chef`, `checker`, `supervisor`), 1 or 0, and the site codes as Settings shows
them (`"RA,FC"`). The first `super-admin` row takes over the starting `superadmin` login. Keep the
folder off the repo: it holds real names.

1. Copy the CSV folder onto the PC, outside the app folder: `%USERPROFILE%\InventoryApp\people`.
2. Close the app window.
3. In Command Prompt:
   `cd /d "%USERPROFILE%\InventoryApp\inventory-audit-app-3rdYr"`
   then
   `npm run import:settings -- "%USERPROFILE%\InventoryApp\people"`
4. The first line must read `Database: ...\server\db\beta.db (DB_PATH from .env)`. Then it lists
   what it added. A name on two rows is skipped and listed. Once a person exists, their role and
   switches change on the Roles page, not through the import.
5. Start the app.

## A phone away from the restaurant: Tailscale (Built)

What staff see: a phone at another site (FC) opens the app as if it were on the restaurant's
network. That phone's person reaches the restaurant PC and nothing else.

On the restaurant PC, once:

1. Install Tailscale (tailscale.com/download) and sign in with the account that runs the
   restaurant's tailnet.
2. In Tailscale's settings on the PC, turn on **Run unattended**, so it stays connected when nobody
   is signed in to Windows.
3. In the Tailscale admin console, Machines: on the restaurant PC, **Disable key expiry**.
4. The setup's firewall rule lets Tailscale's addresses in on port 3000. A PC set up before
   2026-11-14 lacks that: run the setup again and click Yes.

For each phone, one person at a time:

5. The person installs the Tailscale app and signs in with their own account (or the phone's
   restaurant account).
6. In the admin console, Machines: on the restaurant PC, **Share**, by email or link; the person
   accepts. A share reaches only that machine, and the PC cannot reach the phone.
7. The phone opens `http://<the PC's Tailscale address, 100.x.y.z>:3000`; add it to the home
   screen.

Never invite staff into the tailnet as users: an invited user reaches every machine on it. To
stop one phone, revoke its share in the admin console.

## Planned (beta-4)

- Admin logins ask for the admin password; the setup asks it once and keeps it in `.env`.
- Backups: one file each, at every start and at 3 PM and 3 AM; every backup of the last 14 days
  kept, plus one a month; a `restore` word. An optional "copy backups to" folder (none yet: the
  backups stay on C:).
- The launcher becomes a two-line stub that always runs the current version's file; an **Update
  Inventory App** desktop file; the app opens by itself after a restart; the setup no longer
  installs VS Code, Claude Code or graphify; every message names one thing to do.
- After `update beta-4`, run the setup once. This page is rewritten with their messages then.

---
Last checked: 2026-11-22, against `main` `55423ca` (beta-3's code) plus the decisions recorded that
day.
