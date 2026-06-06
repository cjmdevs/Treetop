@echo off
title Treetop Management — Server
cd /d "%~dp0"

echo.
echo  =========================================================
echo   Treetop Management Server
echo  =========================================================
echo.
echo  Starting...  Keep this window open while the app is in use.
echo  To stop the server, close this window or press Ctrl+C.
echo.

node index.js

echo.
echo  ─────────────────────────────────────────────────────────
echo  Server stopped.
pause
