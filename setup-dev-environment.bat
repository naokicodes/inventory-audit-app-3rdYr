@echo off
REM ===================================================================
REM  Inventory Audit App - development environment bootstrap (Windows)
REM
REM  Installs the tools only. It does NOT clone the repo or run
REM  npm install - those are steps 2 and 3 in README.md and belong
REM  there, because they are per-clone, not per-machine.
REM
REM  Safe to run twice. winget skips anything already installed.
REM ===================================================================

echo.
echo  Inventory Audit App - environment setup
echo  =======================================
echo.

REM --- winget present? Everything below depends on it. ---------------
where winget >nul 2>&1
if errorlevel 1 (
    echo  [X] winget was not found on this machine.
    echo.
    echo      winget ships with App Installer from the Microsoft Store.
    echo      Install "App Installer", reopen this window, and run this
    echo      script again. On older Windows 10 builds you may need to
    echo      install the five tools manually - see README.md.
    echo.
    pause
    exit /b 1
)

echo  [1/5] Git
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
echo.

echo  [2/5] Node.js LTS  ^(this project needs 22.13.0 or newer^)
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
echo.

echo  [3/5] Visual Studio Code
winget install --id Microsoft.VisualStudioCode -e --source winget --accept-package-agreements --accept-source-agreements
echo.

echo  [4/5] uv  ^(Python tool installer - graphify is a Python tool^)
winget install --id astral-sh.uv -e --source winget --accept-package-agreements --accept-source-agreements
echo.

echo  ---------------------------------------------------------------
echo   The two npm/uv installs below need Git and Node on PATH.
echo   A brand new install does not update THIS window's PATH.
echo   If either step fails with "not recognized", close this window,
echo   open a new one, and run this script again - the second run
echo   will skip everything already installed.
echo  ---------------------------------------------------------------
echo.

echo  [5/5] Claude Code and graphify
call npm install -g @anthropic-ai/claude-code
if errorlevel 1 echo   ^!^! Claude Code install failed - see the PATH note above.
echo.
call uv tool install graphifyy
if errorlevel 1 echo   ^!^! graphify install failed - see the PATH note above.
echo.

echo  ===============================================================
echo   Tool install finished.
echo.
echo   Verify - each of these should print a version, not an error:
echo.
echo       git --version
echo       node --version        ^(must be v22.13.0 or newer^)
echo       code --version
echo       claude --version
echo       graphify --version
echo.
echo   NEXT: follow README.md from step 2 - clone the repo, run
echo   npm install, then run  graphify hook install  inside the
echo   clone. That last one is per-clone and is NOT done by this
echo   script. Skipping it breaks graph.json merges on branches.
echo  ===============================================================
echo.
pause
