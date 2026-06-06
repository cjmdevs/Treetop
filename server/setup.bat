@echo off
setlocal enabledelayedexpansion
title Treetop Management — Server Setup

echo.
echo  =========================================================
echo   Treetop Management Server  ^|  One-Time Setup
echo  =========================================================
echo.

:: ── Verify Node.js is installed ───────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Please download and install Node.js LTS from:
    echo    https://nodejs.org/
    echo.
    echo  After installing, re-run this setup script.
    echo.
    pause
    exit /b 1
)

:: ── Verify Node.js version is 18 or newer ────────────────────────────────────
:: We ask Node itself to check its own version — more reliable than parsing text.
node -e "if(parseInt(process.versions.node)<18){console.error('  ERROR: Node.js ' + process.version + ' is too old. Version 18 or newer is required.');process.exit(1);}"
if errorlevel 1 (
    echo.
    echo  Download Node.js LTS ^(v18 or newer^) from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f %%v in ('node -e "process.stdout.write(process.version)"') do set NODEVER=%%v
echo  Node.js %NODEVER% detected.  OK.
echo.

:: ── Move into the directory that contains this script (server/) ───────────────
cd /d "%~dp0"

:: ── Step 1 of 3: Install production dependencies ─────────────────────────────
echo  [1/3] Installing server dependencies...
echo        (this may take a minute on first run)
echo.
call npm install --omit=dev
if errorlevel 1 (
    echo.
    echo  ERROR: npm install failed.
    echo.
    echo  The most common cause is a space in the installation path.
    echo  Move the server folder to a path with no spaces, for example:
    echo    C:\TreetopServer
    echo  Then re-run setup.bat.
    echo.
    pause
    exit /b 1
)

echo.
echo  [2/3] Generating environment config and initialising database...
echo.
node setup.js
if errorlevel 1 (
    echo.
    echo  ERROR: Setup script failed.  See the error message above.
    echo.
    pause
    exit /b 1
)

echo.
echo  =========================================================
echo   [3/3] Setup complete!
echo  =========================================================
echo.
echo  HOW TO START THE SERVER
echo  -----------------------
echo  Simple (manual):  double-click  start-treetop-server.bat
echo.
echo  Always-on service (auto-starts on boot):
echo    Right-click install-service.bat → Run as administrator
echo.
echo  FIRST LAUNCH
echo  ------------
echo  On first launch the server will print a BOOTSTRAP TOKEN and
echo  save it to BOOTSTRAP_TOKEN.txt in this folder.
echo  Use that token to create the first admin account from any
echo  client machine connected to this server.
echo.
echo  DEMO / TESTING DATA
echo  -------------------
echo  The database is empty (no demo users).  To load demo data
echo  for testing purposes only, run:
echo    npm run seed
echo  WARNING: this erases all existing data.
echo.
pause
