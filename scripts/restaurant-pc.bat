@echo off
setlocal EnableExtensions
REM ===================================================================
REM  Inventory Audit App - restaurant PC (the Beta server).
REM
REM    restaurant-pc.bat               setup; safe to run again, skips what is done
REM    restaurant-pc.bat start         daily: backup, phone link, run the app
REM    restaurant-pc.bat update TAG    move this PC to a tag, e.g. beta-2
REM
REM  Run setup once AFTER setup-dev-environment.bat. The desktop file
REM  "Start Inventory App" calls "start".
REM
REM  The app lives in %USERPROFILE%\InventoryApp\inventory-audit-app-3rdYr
REM  and runs on server\db\beta.db through .env, so a plain
REM  "npm run dev" in that folder always uses the Beta database.
REM  That folder is never pulled and never reseeded. .env and beta.db are
REM  not tracked by git, so "update" never touches them.
REM  No secrets live in this file: the Loyverse tokens go into .env.
REM ===================================================================

set "APPDIR=%USERPROFILE%\InventoryApp"
set "REPO=%APPDIR%\inventory-audit-app-3rdYr"
set "REPO_URL=https://github.com/naokicodes/inventory-audit-app-3rdYr.git"
set "TAG="
set "APP_PORT=3000"
set "KEEP_BACKUPS=14"
set "WARN="

if /i "%~1"=="start" goto :start
if /i "%~1"=="update" goto :update
if /i "%~1"=="--admin" goto :admin

title Inventory Audit App - restaurant PC setup
echo.
echo  Inventory Audit App - restaurant PC, finishing the install
echo  ===========================================================
call :refreshpath

REM --- 1. Git and Node --------------------------------------------------
echo.
echo  [1/9] Git and Node.js
where git >nul 2>&1
if errorlevel 1 goto :no_git
where node >nul 2>&1
if errorlevel 1 goto :no_node
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=13)?0:1)"
if errorlevel 1 goto :old_node
for /f "delims=" %%V in ('git --version') do echo        %%V
for /f "delims=" %%V in ('node --version') do echo        node %%V
REM Let PowerShell and the VS Code terminal run npm - otherwise typing
REM npm run dev there fails with "running scripts is disabled".
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" >nul 2>&1

REM --- 2. VS Code - optional on a server --------------------------------
echo.
echo  [2/9] Visual Studio Code
where code >nul 2>&1
if not errorlevel 1 goto :code_ok
echo        Not installed yet - retrying the download...
winget install --id Microsoft.VisualStudioCode -e --source winget --accept-package-agreements --accept-source-agreements
call :refreshpath
where code >nul 2>&1
if not errorlevel 1 goto :code_ok
echo        [!] VS Code still did not download. The app does not need it,
echo            so setup continues. Run this file again later to retry.
set "WARN=1"
goto :code_done
:code_ok
echo        OK
:code_done

REM --- 3. Claude Code ---------------------------------------------------
echo.
echo  [3/9] Claude Code
where claude >nul 2>&1
if not errorlevel 1 goto :claude_ok
call npm.cmd install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code
call :refreshpath
where claude >nul 2>&1
if not errorlevel 1 goto :claude_ok
echo        [!] Claude Code did not install. The app does not need it; continuing.
set "WARN=1"
goto :claude_done
:claude_ok
echo        OK
:claude_done

REM --- 4. graphify ------------------------------------------------------
echo.
echo  [4/9] graphify
where graphify >nul 2>&1
if not errorlevel 1 goto :graphify_ok
call uv tool install graphifyy
call :refreshpath
where graphify >nul 2>&1
if not errorlevel 1 goto :graphify_ok
echo        [!] graphify did not install. The app does not need it; continuing.
set "WARN=1"
goto :graphify_done
:graphify_ok
echo        OK
:graphify_done

REM --- 5. The app itself, pinned to the newest beta tag -----------------
echo.
echo  [5/9] The app
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
echo            Later: restaurant-pc.bat update beta-N
set "WARN=1"
goto :clone_done
:clone_have
echo        Already downloaded - left exactly as it is.
:clone_done
cd /d "%REPO%"
for /f "delims=" %%H in ('git describe --tags --always') do echo        Version: %%H

REM --- 6. Dependencies --------------------------------------------------
echo.
echo  [6/9] App dependencies
if exist "node_modules\express\package.json" goto :deps_ok
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :fail_deps
:deps_ok
echo        OK

REM --- 7. .env: Beta database, port, Loyverse tokens --------------------
echo.
echo  [7/9] Settings file .env
if exist ".env" goto :env_have
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
echo        Written.
goto :env_done
:env_have
call :checkenv
if errorlevel 1 goto :fail
echo        Already there - kept as is. DB_PATH=%ENVDB%
call :fctoken
:env_done

REM --- 8. Beta database, created once -----------------------------------
echo.
echo  [8/9] Database
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

REM --- 9. Self-test -----------------------------------------------------
echo.
echo  [9/9] Self-test - about a minute
call npm.cmd run verify >"%APPDIR%\last-verify.log" 2>&1
if errorlevel 1 goto :verify_bad
findstr /c:" files, " /c:"AUDIT CLEAN" "%APPDIR%\last-verify.log"
goto :verify_done
:verify_bad
echo        [!] Self-test FAILED. Send %APPDIR%\last-verify.log to Naoki.
set "WARN=1"
:verify_done

REM --- Network and power: one Windows permission prompt -----------------
echo.
echo  Network and power settings - click Yes on the Windows prompt
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '--admin' -Verb RunAs -Wait"
if not errorlevel 1 goto :admin_ok
echo        [!] Permission refused - phones may not reach this PC.
echo            Run this file again and click Yes.
set "WARN=1"
goto :admin_done
:admin_ok
echo        Port %APP_PORT% open to phones on this network and on Tailscale, sleep off.
:admin_done

REM --- Desktop launcher -------------------------------------------------
if /i "%~f0"=="%APPDIR%\restaurant-pc.bat" goto :launcher_copied
copy /y "%~f0" "%APPDIR%\restaurant-pc.bat" >nul 2>&1
if not errorlevel 1 goto :launcher_copied
echo  [!] Could not copy this file into InventoryApp, so the desktop file may run an old copy.
set "WARN=1"
:launcher_copied
set "DESKTOP="
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%D"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\Desktop"
>"%DESKTOP%\Start Inventory App.bat" echo @call "%APPDIR%\restaurant-pc.bat" start

echo.
echo  ===============================================================
if defined WARN echo   Finished, with the [!] notes above.
if not defined WARN echo   Finished. Everything is installed and checked.
echo.
echo   Every day: double-click "Start Inventory App" on the desktop.
echo   It backs up the data, shows the phone link, and runs npm run dev.
echo.
echo   New version: close the app window, then run
echo      "%APPDIR%\restaurant-pc.bat" update beta-N
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
if not exist "%REPO%\package.json" goto :fail_norepo
cd /d "%REPO%"
title Inventory Audit App - keep this window open
REM The port first: never copy beta.db while the app is using it.
call :portbusy
if errorlevel 1 goto :fail_already
call :checkenv
if errorlevel 1 goto :fail
call :backup
if not errorlevel 1 goto :start_backed_up
echo  [!] The backup failed - see above. The app starts anyway; tell Naoki today.
:start_backed_up
echo.
for /f "delims=" %%H in ('git describe --tags --always') do echo  Version: %%H
echo  Phones on the restaurant network open:
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress }"`) do echo      http://%%I:%APP_PORT%
echo.
echo  Keep this window open. Closing it stops the app.
echo.
call npm.cmd run dev
echo.
echo  The app stopped.
pause
exit /b 0

REM ===================================================================
REM  Update: move this PC to a tag. The app must be closed first.
REM ===================================================================
:update
call :refreshpath
if not exist "%REPO%\.git" goto :fail_norepo
cd /d "%REPO%"
set "NEWTAG=%~2"
title Inventory Audit App - update
echo.
echo  Inventory Audit App - update
echo  ============================
call :portbusy
if errorlevel 1 goto :fail_running
call :checkenv
if errorlevel 1 goto :fail
set "DIRTY="
for /f "delims=" %%L in ('git status --porcelain --untracked-files^=no') do set "DIRTY=1"
if defined DIRTY goto :fail_dirty
git fetch -q --tags origin
if errorlevel 1 goto :fail_fetch
if not "%NEWTAG%"=="" goto :have_tag
echo  Available versions:
git tag -l "beta-*" --sort=-creatordate
set /p "NEWTAG=  Which tag (for example beta-2): "
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
call :backup
if errorlevel 1 goto :fail_nobackup
git -c advice.detachedHead=false checkout -q "%NEWTAG%"
if errorlevel 1 goto :fail_checkout
echo  Installing dependencies...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :rollback
echo  Self-test - about a minute...
call npm.cmd run verify >"%APPDIR%\last-verify.log" 2>&1
if errorlevel 1 goto :rollback
findstr /c:" files, " /c:"AUDIT CLEAN" "%APPDIR%\last-verify.log"
echo.
echo  Done: this PC is on %NEWTAG%. Start the app with the desktop shortcut.
echo  The database upgrades itself on the first start.
pause
exit /b 0
:rollback
echo.
echo  [!] %NEWTAG% failed its check - going back to %PREVNAME%.
echo      The log is %APPDIR%\last-verify.log - send it to Naoki.
git -c advice.detachedHead=false checkout -q "%PREV%"
if errorlevel 1 goto :fail_rollback
set "NOWAT="
for /f "delims=" %%H in ('git rev-parse HEAD') do set "NOWAT=%%H"
if /i not "%NOWAT%"=="%PREV%" goto :fail_rollback
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :fail_rollback_deps
echo  Back on %PREVNAME%. Nothing in the data was changed.
goto :fail

REM ===================================================================
REM  Failures
REM ===================================================================
:no_git
echo  [X] Git is not installed. Run setup-dev-environment.bat first.
goto :fail
:no_node
echo  [X] Node.js is not installed. Run setup-dev-environment.bat first.
goto :fail
:old_node
echo  [X] Node.js is older than 22.13.0. Run setup-dev-environment.bat again.
goto :fail
:fail_clone
echo  [X] Could not download the app from GitHub. Check the internet, run again.
goto :fail
:fail_deps
echo  [X] npm ci failed. Check the internet, then run this file again.
goto :fail
:fail_seed
echo  [X] Creating the database failed - see the message above.
goto :fail
:fail_norepo
echo  [X] The app is not installed yet. Run restaurant-pc.bat once with no word after it.
goto :fail
:fail_running
echo  [X] The app is running. Close its window first, then run the update again.
goto :fail
:fail_dirty
echo  [X] Files in the app folder were edited by hand, so the update stopped.
echo      Nothing was changed. Ask Naoki.
goto :fail
:fail_fetch
echo  [X] Could not reach GitHub. Check the internet; nothing was changed.
goto :fail
:fail_notag
echo  [X] No tag given; nothing was changed.
goto :fail
:fail_badtag
echo  [X] There is no tag "%NEWTAG%". Nothing was changed. Available:
git tag -l "beta-*"
goto :fail
:fail_checkout
echo  [X] Could not switch to %NEWTAG%. Nothing was changed.
goto :fail
:fail_pin
echo  [X] Could not switch to tag %TAG%. Run this file again; if it fails again, tell Naoki.
goto :fail
:fail_already
echo  [X] The app is already running - port %APP_PORT% is in use.
echo      Use the app window that is already open. Nothing was changed.
goto :fail
:fail_prev
echo  [X] Could not read the current version. Nothing was changed. Tell Naoki.
goto :fail
:fail_nobackup
echo  [X] The backup failed, so the update stopped. Nothing was changed.
echo      Check the disk space, then tell Naoki.
goto :fail
:fail_rollback
echo  [X] Could not go back to %PREVNAME% by itself. Do NOT start the app.
echo      Send a photo of this window to Naoki.
goto :fail
:fail_rollback_deps
echo  [X] Back on %PREVNAME%, but reinstalling its parts failed. Do NOT start the app.
echo      Check the internet, then send a photo of this window to Naoki.
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
REM this window sees git, node, npm, uv and graphify without a restart.
set "NEWPATH="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "NEWPATH=%%P"
if defined NEWPATH set "PATH=%NEWPATH%;%USERPROFILE%\.local\bin;%APPDATA%\npm"
goto :eof

:backup
REM Returns errorlevel 1 if any copy failed.
if not exist "%REPO%\server\db\beta.db" exit /b 0
set "STAMP="
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set "STAMP=%%T"
if not defined STAMP goto :backup_bad
if not exist "%APPDIR%\backups" mkdir "%APPDIR%\backups"
copy /y "%REPO%\server\db\beta.db" "%APPDIR%\backups\beta_%STAMP%.db" >nul
if errorlevel 1 goto :backup_bad
if not exist "%REPO%\server\db\beta.db-wal" goto :backup_ok
copy /y "%REPO%\server\db\beta.db-wal" "%APPDIR%\backups\beta_%STAMP%.db-wal" >nul
if errorlevel 1 goto :backup_bad
:backup_ok
echo  Data backed up to InventoryApp\backups\beta_%STAMP%.db
REM Keep the newest %KEEP_BACKUPS% backups; delete older ones (and their -wal files).
powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%APPDIR%\backups' -Filter 'beta_*.db' | Where-Object { $_.Extension -eq '.db' } | Sort-Object Name -Descending | Select-Object -Skip %KEEP_BACKUPS% | ForEach-Object { Remove-Item -LiteralPath $_.FullName; Remove-Item -LiteralPath ($_.FullName + '-wal') -ErrorAction SilentlyContinue }"
exit /b 0
:backup_bad
echo  [X] Backing up the data failed. Is the disk full?
exit /b 1

:portbusy
REM errorlevel 1 when something already listens on the app's port.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
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
echo      It must say: DB_PATH=server/db/beta.db  - fix .env by hand, or ask Naoki.
exit /b 1

REM ===================================================================
REM  Runs elevated - one UAC prompt from the main setup
REM ===================================================================
:admin
call :refreshpath
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
if defined NODEEXE netsh advfirewall firewall add rule name="Inventory Audit App" dir=in action=allow program="%NODEEXE%" protocol=TCP localport=%APP_PORT% remoteip=localsubnet,100.64.0.0/10 profile=private,public >nul
if not defined NODEEXE netsh advfirewall firewall add rule name="Inventory Audit App" dir=in action=allow protocol=TCP localport=%APP_PORT% remoteip=localsubnet,100.64.0.0/10 profile=private,public >nul
REM Only the network this PC is connected through becomes Private, never every network.
powershell -NoProfile -Command "$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1; if ($r) { Set-NetConnectionProfile -InterfaceIndex $r.InterfaceIndex -NetworkCategory Private }"
REM Never sleep or hibernate while plugged in.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
exit /b 0
