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
set "TAG=beta-1"
set "APP_PORT=3000"
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

REM --- 5. The app itself, pinned ----------------------------------------
echo.
echo  [5/9] The app
if exist "%REPO%\.git" goto :clone_have
if not exist "%APPDIR%" mkdir "%APPDIR%"
git clone "%REPO_URL%" "%REPO%"
if errorlevel 1 goto :fail_clone
cd /d "%REPO%"
git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>&1
if errorlevel 1 goto :no_tag
git -c advice.detachedHead=false checkout -q "%TAG%"
echo        Pinned to tag %TAG%.
goto :clone_done
:no_tag
echo        [!] There is no %TAG% tag yet, so this is main as of today.
echo            Later: restaurant-pc.bat update %TAG%
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
echo        Written.
goto :env_done
:env_have
echo        Already there - kept as is.
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
echo        Firewall open for phones on the Private network, sleep off.
:admin_done

REM --- Desktop launcher -------------------------------------------------
if /i not "%~f0"=="%APPDIR%\restaurant-pc.bat" copy /y "%~f0" "%APPDIR%\restaurant-pc.bat" >nul 2>&1
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
call :backup
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
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 goto :fail_running
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
set "PREV="
for /f "delims=" %%H in ('git describe --tags --always') do set "PREV=%%H"
echo  Now: %PREV%    Moving to: %NEWTAG%
call :backup
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
echo  [!] %NEWTAG% failed its check - going back to %PREV%.
echo      The log is %APPDIR%\last-verify.log - send it to Naoki.
git -c advice.detachedHead=false checkout -q "%PREV%"
call npm.cmd ci --no-audit --no-fund
echo  Back on %PREV%. Nothing in the data was changed.
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
if not exist "%REPO%\server\db\beta.db" goto :eof
set "STAMP="
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set "STAMP=%%T"
if not exist "%APPDIR%\backups" mkdir "%APPDIR%\backups"
copy /y "%REPO%\server\db\beta.db" "%APPDIR%\backups\beta_%STAMP%.db" >nul
if exist "%REPO%\server\db\beta.db-wal" copy /y "%REPO%\server\db\beta.db-wal" "%APPDIR%\backups\beta_%STAMP%.db-wal" >nul
echo  Data backed up to InventoryApp\backups\beta_%STAMP%.db
goto :eof

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
netsh advfirewall firewall add rule name="Inventory Audit App" dir=in action=allow protocol=TCP localport=%APP_PORT% profile=private >nul
if defined NODEEXE netsh advfirewall firewall add rule name="Inventory Audit App" dir=in action=allow program="%NODEEXE%" profile=private >nul
REM The restaurant network counts as Private, so the rules above apply.
powershell -NoProfile -Command "Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private"
REM Never sleep or hibernate while plugged in.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
exit /b 0
