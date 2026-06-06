@echo off
title Treetop Management — Install Windows Service
cd /d "%~dp0"

:: ── Administrator check ───────────────────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: This script must be run as Administrator.
    echo.
    echo  Right-click install-service.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo.
echo  =========================================================
echo   Treetop Management  ^|  Install Windows Service
echo  =========================================================
echo.

:: ── Install node-windows if needed (one-time, ~30s) ──────────────────────────
node -e "require('node-windows')" >nul 2>&1
if errorlevel 1 (
    echo  node-windows not found — installing now (one-time, may take ~30 seconds)...
    echo.
    call npm install node-windows
    if errorlevel 1 (
        echo.
        echo  ERROR: Failed to install node-windows.  Check your internet connection.
        pause
        exit /b 1
    )
    echo.
)

echo  Installing and starting Windows Service...
echo.
node service-install.js

echo.
pause
