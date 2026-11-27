@echo off
setlocal EnableExtensions
REM ===================================================================
REM  Inventory Audit App - restaurant PC (the Beta server).
REM
REM    restaurant-pc.bat               setup; safe to run again, skips what is done
REM    restaurant-pc.bat start         daily: backup, phone link, run the app
REM    restaurant-pc.bat update TAG    move this PC to a tag, e.g. beta-4 (no tag: it lists them and asks)
REM    restaurant-pc.bat backup        one backup now (the 3 PM and 3 AM tasks run this)
REM    restaurant-pc.bat restore       put a backup back; the app must be closed
REM    (update-run is update's own body, run from a copy in TEMP; never typed.)
REM
REM  Setup installs Git and Node.js itself when they are missing, and nothing
REM  else: this PC only hosts the app. It writes InventoryApp\restaurant-pc.bat
REM  as a two-line stub that calls this file in the app folder, so the desktop
REM  files "Start Inventory App" and "Update Inventory App", the Startup folder
REM  file and the two backup tasks always run the app folder's current copy.
REM
REM  The app lives in %USERPROFILE%\InventoryApp\inventory-audit-app-3rdYr
REM  and runs on server\db\beta.db through .env, so a plain
REM  "npm run dev" in that folder always uses the Beta database.
REM  That folder is never pulled and never reseeded. .env and beta.db are
REM  not tracked by git, so "update" never touches them.
REM  No secrets live in this file: the tokens and the password go into .env.
REM
REM  INVENTORY_APP_DIR, when set, replaces %USERPROFILE%\InventoryApp, so the
REM  setup can be tried in another folder (a test install).
REM ===================================================================

set "APPDIR=%USERPROFILE%\InventoryApp"
if defined INVENTORY_APP_DIR set "APPDIR=%INVENTORY_APP_DIR%"
set "REPO=%APPDIR%\inventory-audit-app-3rdYr"
set "STUB=%APPDIR%\restaurant-pc.bat"
set "MARKER=%APPDIR%\update-in-progress.txt"
set "REPO_URL=https://github.com/naokicodes/inventory-audit-app-3rdYr.git"
set "TAG="
set "APP_PORT=3000"
set "WARN="
call :readport

if /i "%~1"=="start" goto :start
if /i "%~1"=="update" goto :update
if /i "%~1"=="update-run" goto :updaterun
if /i "%~1"=="backup" goto :backupword
if /i "%~1"=="restore" goto :restore
if /i "%~1"=="--admin" goto :admin

title Inventory Audit App - restaurant PC setup
echo.
echo  Inventory Audit App - restaurant PC, finishing the install
echo  ===========================================================
call :refreshpath

REM --- 1. Git and Node: installed here when missing, with the same winget
REM     lines as setup-dev-environment.bat (which this PC never runs) ------
echo.
echo  [1/6] Git and Node.js
where git >nul 2>&1
if not errorlevel 1 goto :git_ok
echo        Git is missing - installing it...
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
call :refreshpath
where git >nul 2>&1
if errorlevel 1 goto :no_git
:git_ok
call :nodeok
if not errorlevel 1 goto :node_ok
echo        Node.js 22.13 or newer is missing - installing it...
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
call :refreshpath
call :nodeok
if errorlevel 1 goto :no_node
:node_ok
for /f "delims=" %%V in ('git --version') do echo        %%V
for /f "delims=" %%V in ('node --version') do echo        node %%V
REM Let PowerShell run npm - otherwise typing npm run dev there fails
REM with "running scripts is disabled".
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" >nul 2>&1

REM --- 2. The app itself, pinned to the newest beta tag -----------------
echo.
echo  [2/6] The app
if exist "%REPO%\.git" goto :clone_have
if not exist "%APPDIR%" mkdir "%APPDIR%"
git clone "%REPO_URL%" "%REPO%"
if errorlevel 1 goto :fail_clone
cd /d "%REPO%"
REM Never a fixed tag name: take the newest beta-* tag.
for /f "delims=" %%T in ('git tag -l "beta-*" --sort^=-creatordate') do if not defined TAG set "TAG=%%T"
if not defined TAG goto :no_tag
git -c advice.detachedHead=false checkout -q "%TAG%"
if errorlevel 1 goto :fail_pin
echo        Pinned to tag %TAG%, the newest.
goto :clone_done
:no_tag
echo        [!] There is no beta tag yet, so this is main as of today.
echo            Later: double-click "Update Inventory App" on the desktop.
set "WARN=1"
goto :clone_done
:clone_have
echo        Already downloaded - left exactly as it is.
:clone_done
cd /d "%REPO%"
for /f "delims=" %%H in ('git describe --tags --always') do echo        Version: %%H

REM --- 3. Dependencies --------------------------------------------------
echo.
echo  [3/6] App dependencies
if exist "node_modules\express\package.json" goto :deps_ok
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :fail_deps
:deps_ok
echo        OK

REM --- 4. .env: Beta database, port, tokens, admin password, copy folder -
echo.
echo  [4/6] Settings file .env
set "ENVNEW="
if exist ".env" goto :env_have
set "ENVNEW=1"
>".env" echo # Restaurant PC server settings. Gitignored - never commit this file.
>>".env" echo DB_PATH=server/db/beta.db
>>".env" echo PORT=%APP_PORT%
echo        The Loyverse tokens make the sales sync work. Paste each one and
echo        press Enter, or just press Enter to skip and add it to .env later.
set "TOK="
set /p "TOK=        Silingan Loyverse token: "
if defined TOK (>>".env" echo LOYVERSE_SILINGAN_TOKEN=%TOK%)
if not defined TOK (>>".env" echo # LOYVERSE_SILINGAN_TOKEN=)
set "TOK="
set /p "TOK=        Likod Loyverse token: "
if defined TOK (>>".env" echo LOYVERSE_LIKOD_TOKEN=%TOK%)
if not defined TOK (>>".env" echo # LOYVERSE_LIKOD_TOKEN=)
set "TOK="
set /p "TOK=        FC Loyverse token: "
if defined TOK (>>".env" echo LOYVERSE_FC_TOKEN=%TOK%)
if not defined TOK (>>".env" echo # LOYVERSE_FC_TOKEN=)
set "TOK="
call :envadmin
call :envcopy
call :envsecret
echo        Written.
goto :env_done
:env_have
call :checkenv
if errorlevel 1 goto :fail
echo        Already there - kept as is. DB_PATH=%ENVDB%
REM A line this .env does not have yet (set or commented out) is asked once.
call :fctoken
call :envadmin
call :envcopy
call :envsecret
:env_done
call :readport

REM --- 5. Beta database, created once -----------------------------------
echo.
echo  [5/6] Database
if exist "server\db\beta.db" goto :db_have
set "DB_PATH=server/db/beta.db"
node server\db\seed.js
set "SEEDERR=%errorlevel%"
set "DB_PATH="
if not "%SEEDERR%"=="0" goto :fail_seed
echo        Created server\db\beta.db with the starting data.
goto :db_done
:db_have
echo        server\db\beta.db already exists - kept, never reseeded.
:db_done

REM --- 6. Self-test -----------------------------------------------------
echo.
echo  [6/6] Self-test - about a minute
call npm.cmd run verify >"%APPDIR%\last-verify.log" 2>&1
if errorlevel 1 goto :verify_bad
findstr /c:" files, " /c:"AUDIT CLEAN" "%APPDIR%\last-verify.log"
goto :verify_done
:verify_bad
echo        [!] Self-test FAILED. Run this file again. The log: %APPDIR%\last-verify.log
set "WARN=1"
:verify_done

REM --- Network and power: one Windows permission prompt -----------------
REM The elevated part (--admin) exits non-zero when the firewall rule or the
REM power setting fails; a refused or closed prompt counts as a failure too.
echo.
echo  Network and power settings
if not defined INVENTORY_APP_DIR goto :admin_go
choice /c YN /m "  Test install: also change this computer's firewall and sleep settings"
if errorlevel 2 goto :admin_skip
:admin_go
echo        Click Yes on the Windows prompt.
powershell -NoProfile -Command "try { $p = Start-Process -FilePath '%~f0' -ArgumentList '--admin','%APP_PORT%' -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { exit 1 }"
if errorlevel 1 goto :admin_bad
echo        Port %APP_PORT% open to phones on this network and on Tailscale, sleep off.
goto :admin_done
:admin_bad
echo        [!] The firewall or power settings did not apply - run this file again and click Yes.
set "WARN=1"
goto :admin_done
:admin_skip
echo        Firewall and sleep settings skipped (test install).
:admin_done

REM --- The launcher stub, the desktop files, the Startup file ------------
REM The stub is two lines that call the app folder's own copy of this file,
REM so every word runs the current code and an update never leaves it old.
REM Running setup again replaces each file, never adds a second one.
echo.
if /i "%~f0"=="%STUB%" goto :stub_self
>"%STUB%" echo @echo off|| goto :stub_bad
>>"%STUB%" echo call "%REPO%\scripts\restaurant-pc.bat" %%*|| goto :stub_bad
goto :stub_done
:stub_self
echo  [!] This is the launcher's own copy, so it was not replaced. Run
echo      scripts\restaurant-pc.bat in the app folder once, with no word.
set "WARN=1"
goto :stub_done
:stub_bad
echo  [!] Could not write the launcher in InventoryApp. Run this file again.
set "WARN=1"
:stub_done
set "DESKTOP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%D"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\Desktop"
set "STARTUP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Startup')"`) do set "STARTUP=%%D"
if not defined STARTUP set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINKBAD="
>"%DESKTOP%\Start Inventory App.bat" echo @call "%STUB%" start|| set "LINKBAD=1"
>"%DESKTOP%\Update Inventory App.bat" echo @call "%STUB%" update|| set "LINKBAD=1"
REM Auto-start: the app comes up when this user signs in.
>"%STARTUP%\Start Inventory App.bat" echo @call "%STUB%" start|| set "LINKBAD=1"
if defined LINKBAD goto :links_bad
echo  Desktop: Start Inventory App and Update Inventory App. The app starts by itself at sign-in.
goto :links_done
:links_bad
echo  [!] Could not make the desktop or Startup files. Run this file again.
set "WARN=1"
:links_done

REM --- Backups at 3 PM and 3 AM: two tasks for this user, no admin prompt -
REM Created, or replaced when setup runs again (/f). They run while this user
REM is signed in, which the app's auto-start needs anyway.
set "SCHEDBAD="
schtasks /create /f /sc daily /st 15:00 /tn "Inventory App backup 3PM" /tr "\"%APPDIR%\restaurant-pc.bat\" backup" >nul
if errorlevel 1 set "SCHEDBAD=1"
schtasks /create /f /sc daily /st 03:00 /tn "Inventory App backup 3AM" /tr "\"%APPDIR%\restaurant-pc.bat\" backup" >nul
if errorlevel 1 set "SCHEDBAD=1"
if defined SCHEDBAD goto :sched_bad
echo  Backups scheduled every day at 3 PM and 3 AM.
goto :sched_done
:sched_bad
echo  [!] Could not schedule the 3 PM and 3 AM backups. Run this file again.
set "WARN=1"
:sched_done

echo.
echo  ===============================================================
if defined WARN echo   Finished, with the [!] notes above.
if not defined WARN echo   Finished. Everything is installed and checked.
echo.
echo   Every day: the app starts by itself when this PC signs in, or
echo   double-click "Start Inventory App" on the desktop. It backs up
echo   the data, shows the phone link, and runs the app.
echo.
echo   New version: close the app window, then double-click
echo   "Update Inventory App" on the desktop and pick the version.
echo.
echo   One thing only the router can do: reserve this PC's IP address
echo   - DHCP reservation - so the phone link never changes.
echo  ===============================================================
echo.
choice /c YN /m "  Start the app now"
if errorlevel 2 exit /b 0
goto :start

REM ===================================================================
REM  Daily start: backup, phone link, npm run dev
REM ===================================================================
:start
call :refreshpath
call :checkmarker
if errorlevel 1 goto :fail
if not exist "%REPO%\package.json" goto :fail_norepo
cd /d "%REPO%"
title Inventory Audit App - keep this window open
REM The port first: never start a second copy of the app. Then .env, the backup, the app.
call :portbusy
if errorlevel 1 goto :fail_already
call :checkenv
if errorlevel 1 goto :fail
call :backup
if not "%errorlevel%"=="0" if not "%errorlevel%"=="2" echo  [!] The backup failed - see above. The app starts anyway. Free some disk space; the next start tries again.
REM The newest backup here and in the copy folder, so a backup that stopped working shows at every start.
node "%REPO%\scripts\backup-db.js" "%APPDIR%\backups" --status
echo.
for /f "delims=" %%H in ('git describe --tags --always') do echo  Version: %%H
echo  Phones on the restaurant network open:
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress }"`) do echo      http://%%I:%APP_PORT%
echo.
echo  Keep this window open. Closing it stops the app.
echo.
REM The app's port is the one checked above: a PORT this window inherited would
REM beat .env's (Node keeps a variable that is already set).
set "PORT=%APP_PORT%"
REM One line from npm run dev to the end: an update can replace this file while
REM the window waits at its pause, and cmd reads a whole line before running it.
call npm.cmd run dev & echo. & echo  The app stopped. If you did not close it, read the lines above: & echo    'database file is missing' - run the setup again; & echo    'newer version' - run Update Inventory App; & echo    anything else - start it again; if it stops again, restart the PC. & pause & exit /b 0

REM ===================================================================
REM  Update: move this PC to a tag. The app must be closed first.
REM  git checkout replaces this file, and cmd reads a running .bat from
REM  disk, so the update runs from a copy in TEMP. The call and the exit
REM  are one line: cmd reads a whole line before running it.
REM ===================================================================
:update
call :refreshpath
if not exist "%REPO%\.git" goto :fail_norepo
copy /y "%REPO%\scripts\restaurant-pc.bat" "%TEMP%\inventory-app-update.bat" >nul
if errorlevel 1 goto :fail_tempcopy
call "%TEMP%\inventory-app-update.bat" update-run %2 & exit /b

:updaterun
call :refreshpath
if not exist "%REPO%\.git" goto :fail_norepo
cd /d "%REPO%"
set "NEWTAG=%~2"
set "RESUME="
set "SKIPNPM="
title Inventory Audit App - update
echo.
echo  Inventory Audit App - update
echo  ============================
call :portbusy
if errorlevel 1 goto :fail_running
call :checkenv
if errorlevel 1 goto :fail
if not exist "%MARKER%" goto :update_fresh
REM An unfinished update: finish that one, from the commit the marker names.
call :readmarker
if not defined MTAG goto :fail_prev
if not defined MPREV goto :fail_prev
REM A different tag is refused with the marker's line; no tag, or the same one, finishes it.
if not "%NEWTAG%"=="" if /i not "%NEWTAG%"=="%MTAG%" goto :fail_marker
set "NEWTAG=%MTAG%"
set "PREV=%MPREV%"
set "PREVNAME=%MPREVNAME%"
if not defined PREVNAME set "PREVNAME=%MPREV%"
set "RESUME=1"
echo  The update to %NEWTAG% did not finish - finishing it now.
git rev-parse -q --verify "refs/tags/%NEWTAG%" >nul 2>&1
if errorlevel 1 goto :fail_badtag
goto :update_go

:update_fresh
set "DIRTY="
for /f "delims=" %%L in ('git status --porcelain --untracked-files^=no') do set "DIRTY=1"
if defined DIRTY goto :fail_dirty
git fetch -q --tags origin
if errorlevel 1 goto :fail_fetch
if not "%NEWTAG%"=="" goto :have_tag
echo  Available versions:
git tag -l "beta-*" --sort=-creatordate
set /p "NEWTAG=  Which tag (for example beta-4): "
:have_tag
if "%NEWTAG%"=="" goto :fail_notag
git rev-parse -q --verify "refs/tags/%NEWTAG%" >nul 2>&1
if errorlevel 1 goto :fail_badtag
REM PREV is the exact commit, so going back never depends on a tag name.
set "PREV="
for /f "delims=" %%H in ('git rev-parse HEAD') do set "PREV=%%H"
if not defined PREV goto :fail_prev
set "PREVNAME="
for /f "delims=" %%H in ('git describe --tags --always') do set "PREVNAME=%%H"
echo  Now: %PREVNAME%    Moving to: %NEWTAG%
REM Going back asks first: "older" is a tag whose commit is behind this one.
set "NEWCOMMIT="
for /f "delims=" %%H in ('git rev-list -n 1 "%NEWTAG%"') do set "NEWCOMMIT=%%H"
if /i "%NEWCOMMIT%"=="%PREV%" goto :older_done
git merge-base --is-ancestor "%NEWTAG%" HEAD
if errorlevel 1 goto :older_done
choice /c YN /m "  %NEWTAG% is older than this version (%PREVNAME%). Go back only right after a bad update. Continue"
if errorlevel 2 goto :update_cancelled
:older_done
REM Labelled, so "go back" is restore this backup plus update to the old tag.
call :backup before-update-from-%PREVNAME%
REM Only 0 (backed up) and 2 (backed up, not copied) go on; any other code, say node missing, stops.
if not "%errorlevel%"=="0" if not "%errorlevel%"=="2" goto :fail_nobackup

:update_go
REM The marker, from just before the checkout to Done or Back on: while it is
REM there, start, backup and restore refuse, and the next update finishes this
REM one. A rerun checks out with -f: the changed files are the update's own
REM (.env and beta.db are not tracked).
>"%MARKER%" echo PREV=%PREV%|| goto :fail_markerwrite
>>"%MARKER%" echo TAG=%NEWTAG%|| goto :fail_markerwrite
>>"%MARKER%" echo PREVNAME=%PREVNAME%|| goto :fail_markerwrite
set "CHECKOUTF="
if defined RESUME set "CHECKOUTF=-f"
git -c advice.detachedHead=false checkout -q %CHECKOUTF% "%NEWTAG%"
if errorlevel 1 goto :fail_checkout
REM No install when the lockfile did not change and the parts are there.
if not exist "node_modules\express\package.json" goto :npm_check_done
git diff --quiet %PREV% "%NEWTAG%" -- package-lock.json
if not errorlevel 1 set "SKIPNPM=1"
:npm_check_done
if defined SKIPNPM goto :update_npm_done
echo  Installing the app's parts...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :fail_update_deps
:update_npm_done
echo  Self-test - about a minute...
call npm.cmd run verify >"%APPDIR%\last-verify.log" 2>&1
if errorlevel 1 goto :rollback
findstr /c:" files, " /c:"AUDIT CLEAN" "%APPDIR%\last-verify.log"
del /f /q "%MARKER%" >nul 2>&1
echo.
echo  Done: this PC is on %NEWTAG%. Start the app with the desktop shortcut.
echo  The database upgrades itself on the first start.
pause
exit /b 0
:update_cancelled
echo  Nothing was changed.
pause
exit /b 0
:rollback
echo.
echo  [!] %NEWTAG% did not pass its self-test - going back to %PREVNAME%.
echo      Run the update once more; if it fails again, keep using %PREVNAME%
echo      and tell the admin. The log: %APPDIR%\last-verify.log
git -c advice.detachedHead=false checkout -q "%PREV%"
if errorlevel 1 goto :fail_rollback
set "NOWAT="
for /f "delims=" %%H in ('git rev-parse HEAD') do set "NOWAT=%%H"
if /i not "%NOWAT%"=="%PREV%" goto :fail_rollback
if defined SKIPNPM goto :rollback_npm_done
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :fail_rollback_deps
:rollback_npm_done
del /f /q "%MARKER%" >nul 2>&1
echo  Back on %PREVNAME%. Nothing in the data was changed.
goto :fail

REM ===================================================================
REM  Backup: one backup now. The 3 PM and 3 AM tasks run this word, so
REM  it never pauses: the window closes by itself. Its lines go to
REM  backups\last-backup.log too. An unfinished update writes its line
REM  there instead of a backup (the before-update backup covers the gap).
REM ===================================================================
:backupword
call :refreshpath
if not exist "%APPDIR%\backups" mkdir "%APPDIR%\backups"
set "BKLOG=%APPDIR%\backups\last-backup.log"
>"%BKLOG%" echo %DATE% %TIME%
call :checkmarker >>"%BKLOG%" 2>&1
if errorlevel 1 goto :backupword_done
call :checkenv >>"%BKLOG%" 2>&1
if errorlevel 1 goto :backupword_done
call :backup >>"%BKLOG%" 2>&1
:backupword_done
set "BKERR=%errorlevel%"
type "%BKLOG%"
exit /b %BKERR%

REM ===================================================================
REM  Restore: put a backup back. The app must be closed first.
REM ===================================================================
:restore
call :refreshpath
call :checkmarker
if errorlevel 1 goto :fail
if not exist "%REPO%\package.json" goto :fail_norepo
cd /d "%REPO%"
title Inventory Audit App - restore
echo.
echo  Inventory Audit App - restore
echo  =============================
call :portbusy
if errorlevel 1 goto :fail_restore_running
call :checkenv
if errorlevel 1 goto :fail
node "%REPO%\scripts\restore-db.js" "%APPDIR%\backups"
if errorlevel 1 goto :fail
echo.
pause
exit /b 0

REM ===================================================================
REM  Failures: each names one thing the person can do alone
REM ===================================================================
:fail_restore_running
echo  [X] Close the app window first, then run restore again.
goto :fail
:no_git
echo  [X] Git did not install. Check the internet, then run this file again.
goto :fail
:no_node
echo  [X] Node.js did not install. Check the internet, then run this file again.
goto :fail
:fail_clone
echo  [X] Could not download the app from GitHub. Check the internet, then run this file again.
goto :fail
:fail_deps
echo  [X] Could not download the app's parts. Check the internet, then run this file again.
goto :fail
:fail_seed
echo  [X] Creating the database failed - see the message above. Free some disk space, then run this file again.
goto :fail
:fail_norepo
echo  [X] The app is not installed yet. Run restaurant-pc.bat once with no word after it.
goto :fail
:fail_running
echo  [X] The app is running. Close its window first, then run the update again.
goto :fail
:fail_dirty
echo  [X] Files in the app folder were changed by hand, so the update stopped.
echo      Nothing was changed: keep using this version, and tell the admin.
goto :fail
:fail_fetch
echo  [X] Could not get the new version. Check the internet and run the update again.
goto :fail
:fail_notag
echo  [X] No version given; nothing was changed. Run the update again and type one of the versions listed.
goto :fail
:fail_badtag
echo  [X] There is no version "%NEWTAG%". Nothing was changed. Run the update again with one of these:
git tag -l "beta-*"
goto :fail
:fail_tempcopy
echo  [X] Could not copy the update into the TEMP folder. Nothing was changed. Free some disk space, then run the update again.
goto :fail
:fail_marker
call :checkmarker
goto :fail
:fail_markerwrite
REM Nothing is checked out yet, so a half-written marker must not block the app.
REM A rerun keeps it: that update is already part done.
if not defined RESUME del /f /q "%MARKER%" >nul 2>&1
echo  [X] Could not write in InventoryApp, so the update stopped. Nothing was changed. Free some disk space, then run the update again.
goto :fail
:fail_checkout
echo  [X] Could not switch to %NEWTAG%. Close every other window that uses the app folder,
echo      then run Update Inventory App again. The app will not start until the update finishes.
goto :fail
:fail_update_deps
echo  [X] Could not download the app's parts. Check the internet, then run Update Inventory App again.
echo      The app will not start until the update finishes.
goto :fail
:fail_pin
echo  [X] Could not switch to tag %TAG%. Run this file again.
goto :fail
:fail_already
echo  [X] The app is already running - port %APP_PORT% is in use.
echo      Use the app window that is already open. Nothing was changed.
goto :fail
:fail_prev
echo  [X] Could not read the current version. Nothing was changed. Run the update again.
goto :fail
:fail_nobackup
echo  [X] The backup failed, so the update stopped. Nothing was changed.
echo      Free some disk space, then run the update again.
goto :fail
:fail_rollback
echo  [X] Could not go back to %PREVNAME% by itself. Close every other window that uses
echo      the app folder, then run Update Inventory App again. The app will not start until then.
goto :fail
:fail_rollback_deps
echo  [X] Back on %PREVNAME%, but its parts could not be downloaded. Check the internet,
echo      then run Update Inventory App again. The app will not start until then.
goto :fail
:fail
echo.
pause
exit /b 1

REM ===================================================================
REM  Helpers
REM ===================================================================
:refreshpath
REM New installs only update the registry; read PATH back from it so
REM this window sees git, node and npm without a restart.
set "NEWPATH="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "NEWPATH=%%P"
if defined NEWPATH set "PATH=%NEWPATH%;%USERPROFILE%\.local\bin;%APPDATA%\npm"
goto :eof

:nodeok
REM errorlevel 0 when node is on PATH and is 22.13 or newer.
where node >nul 2>&1
if errorlevel 1 exit /b 1
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=13)?0:1)"
exit /b %errorlevel%

:readport
REM APP_PORT is .env's PORT when it sets one, else 3000: the port check,
REM the phone link and the firewall rule all use it.
if not exist "%REPO%\.env" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in ("%REPO%\.env") do if /i "%%A"=="PORT" if not "%%B"=="" set "APP_PORT=%%B"
exit /b 0

:readmarker
set "MTAG="
set "MPREV="
set "MPREVNAME="
for /f "usebackq tokens=1,* delims==" %%A in ("%MARKER%") do (
  if /i "%%A"=="TAG" set "MTAG=%%B"
  if /i "%%A"=="PREV" set "MPREV=%%B"
  if /i "%%A"=="PREVNAME" set "MPREVNAME=%%B"
)
exit /b 0

:checkmarker
REM errorlevel 1, with its line, when an update did not finish.
if not exist "%MARKER%" exit /b 0
call :readmarker
echo  [X] The update to %MTAG% did not finish (was the PC switched off?). Run Update Inventory App again. The app was not started.
exit /b 1

:backup
REM One backup file (scripts\backup-db.js; %1 = an optional label). It keeps the
REM last 14 days plus one a month, and copies to BACKUP_COPY_DIR when .env sets it.
REM errorlevel 0 = backed up, or no database yet; 1 = failed (its line says why);
REM 2 = backed up, but the copy to the copy folder failed.
node "%REPO%\scripts\backup-db.js" "%APPDIR%\backups" %1
set "BKERR=%errorlevel%"
if "%BKERR%"=="2" echo  [!] The backup is made, but it was not copied to the copy folder - check that the disk or Google Drive is there.
exit /b %BKERR%

:portbusy
REM errorlevel 1 when something already listens on the app's port.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
exit /b %errorlevel%

:hasenv
REM errorlevel 0 when .env already has the line, set or commented out.
findstr /b /c:"%~1=" /c:"# %~1=" ".env" >nul 2>&1
exit /b %errorlevel%

:fctoken
REM FC joined Loyverse after the first setups. Setup only: if .env has no FC line at all,
REM ask once and append it. Nothing else in .env is touched; the daily start never asks.
findstr /b /c:"LOYVERSE_FC_TOKEN=" /c:"# LOYVERSE_FC_TOKEN=" ".env" >nul 2>&1
if not errorlevel 1 exit /b 0
echo        FC is on Loyverse now. Paste its token and press Enter, or just Enter to skip.
set "TOK="
set /p "TOK=        FC Loyverse token: "
>>".env" echo.
if defined TOK (>>".env" echo LOYVERSE_FC_TOKEN=%TOK%)
if not defined TOK (>>".env" echo # LOYVERSE_FC_TOKEN=)
set "TOK="
echo        FC token line added to .env.
exit /b 0

:envadmin
REM Setup only, asked once (Enter skips: the commented line counts as answered).
REM The value is written with delayed expansion, so & | < > in it stay text.
call :hasenv ADMIN_PASSWORD
if not errorlevel 1 exit /b 0
if not defined ENVNEW >>".env" echo.
set "TOK="
set /p "TOK=        Admin password (asked on the phones when an admin logs in): "
if not defined TOK goto :envadmin_skip
setlocal EnableDelayedExpansion
>>".env" echo ADMIN_PASSWORD=!TOK!
endlocal
set "TOK="
exit /b 0
:envadmin_skip
>>".env" echo # ADMIN_PASSWORD=
exit /b 0

:envcopy
REM Setup only, asked once. The folder is made if it is missing.
call :hasenv BACKUP_COPY_DIR
if not errorlevel 1 exit /b 0
if not defined ENVNEW >>".env" echo.
set "TOK="
set /p "TOK=        Copy backups to (a folder on another disk, or Enter to skip): "
if not defined TOK goto :envcopy_skip
set "MKBAD="
setlocal EnableDelayedExpansion
set TOK=!TOK:"=!
if not exist "!TOK!\" mkdir "!TOK!" >nul 2>&1
set "BAD="
if not exist "!TOK!\" set "BAD=1"
>>".env" echo BACKUP_COPY_DIR=!TOK!
endlocal & set "MKBAD=%BAD%"
set "TOK="
if not defined MKBAD exit /b 0
echo        [!] Could not make that folder - check that the disk or Google Drive is there.
set "WARN=1"
exit /b 0
:envcopy_skip
>>".env" echo # BACKUP_COPY_DIR=
exit /b 0

:envsecret
REM Setup only: the login key is made here and written without being shown.
call :hasenv COOKIE_SECRET
if not errorlevel 1 exit /b 0
set "SECRET="
for /f "usebackq delims=" %%S in (`node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))"`) do set "SECRET=%%S"
if not defined SECRET goto :envsecret_bad
if not defined ENVNEW >>".env" echo.
>>".env" echo COOKIE_SECRET=%SECRET%
set "SECRET="
echo        A login key was made and saved in .env.
exit /b 0
:envsecret_bad
echo        [!] Could not make the login key. Run this file again.
set "WARN=1"
exit /b 0

:checkenv
REM An existing .env must point at beta.db. Never rewritten here: stop and say what it found.
set "ENVDB="
if not exist "%REPO%\.env" goto :checkenv_none
for /f "usebackq tokens=1,* delims==" %%A in ("%REPO%\.env") do if /i "%%A"=="DB_PATH" set "ENVDB=%%B"
if not defined ENVDB goto :checkenv_bad
if /i not "%ENVDB:~-7%"=="beta.db" goto :checkenv_bad
exit /b 0
:checkenv_none
echo  [X] The settings file .env is missing. Run restaurant-pc.bat once with no word after it.
exit /b 1
:checkenv_bad
echo  [X] .env does not point at the Beta database, so nothing was started or changed.
if defined ENVDB echo      It says: DB_PATH=%ENVDB%
if not defined ENVDB echo      It has no DB_PATH line.
echo      It must say: DB_PATH=server/db/beta.db - fix that line in .env, then try again.
exit /b 1

REM ===================================================================
REM  Runs elevated - one UAC prompt from the main setup. The port comes
REM  as the second word (an elevated window does not inherit this one's
REM  settings). Exits 1 when the firewall rule or a power setting fails.
REM ===================================================================
:admin
call :refreshpath
if not "%~2"=="" set "APP_PORT=%~2"
set "ADMINBAD="
set "NODEEXE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODEEXE set "NODEEXE=%%N"
REM Clear old rules, including any block rule Windows made if its own
REM "allow node?" prompt was ever cancelled - a block rule beats an allow.
netsh advfirewall firewall delete rule name="Inventory Audit App" >nul 2>&1
netsh advfirewall firewall delete rule name="Node.js JavaScript Runtime" >nul 2>&1
REM ONE rule: node, on the app's port only, from this network and from Tailscale
REM (100.64.0.0/10), on Private and Public: Windows may class the Tailscale adapter
REM as Public, and the remoteip limit keeps everyone else out.
REM Naming node stops Windows' own "Allow Node.js?" pop-up, whose Allow would open
REM every node port (3100 too) and whose Cancel would add a block rule.
if defined NODEEXE netsh advfirewall firewall add rule name="Inventory Audit App" dir=in action=allow program="%NODEEXE%" protocol=TCP localport=%APP_PORT% remoteip=localsubnet,100.64.0.0/10 profile=private,public >nul || set "ADMINBAD=1"
if not defined NODEEXE netsh advfirewall firewall add rule name="Inventory Audit App" dir=in action=allow protocol=TCP localport=%APP_PORT% remoteip=localsubnet,100.64.0.0/10 profile=private,public >nul || set "ADMINBAD=1"
REM Only the network this PC is connected through becomes Private, never every network.
powershell -NoProfile -Command "$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1; if ($r) { Set-NetConnectionProfile -InterfaceIndex $r.InterfaceIndex -NetworkCategory Private }"
REM Never sleep or hibernate while plugged in.
powercfg /change standby-timeout-ac 0 || set "ADMINBAD=1"
powercfg /change hibernate-timeout-ac 0 || set "ADMINBAD=1"
if defined ADMINBAD exit /b 1
exit /b 0
