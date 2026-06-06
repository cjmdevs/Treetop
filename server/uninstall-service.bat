@echo off
title Treetop Management — Uninstall Windows Service
cd /d "%~dp0"

:: ── Administrator check ───────────────────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: This script must be run as Administrator.
    echo.
    echo  Right-click uninstall-service.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo.
echo  =========================================================
echo   Treetop Management  ^|  Remove Windows Service
echo  =========================================================
echo.
echo  This will stop and remove the Treetop Management Server service.
echo  Your database and configuration (.env) will NOT be deleted.
echo.

node service-uninstall.js

echo.
pause
