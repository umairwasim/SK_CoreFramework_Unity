@echo off
title SKCore Developer Tools Suite Launcher
cd /d "%~dp0"

echo =======================================================
echo          SKCORE DEVELOPER TOOLS SUITE LAUNCHER        
echo =======================================================
echo.
echo  [1] Open directly in Default Browser (Offline file:/// mode)
echo  [2] Start Local Static Web Server (http://localhost:8080)
echo  [3] Exit
echo.
set /p choice="Select an option [1-3] (Default is 1): "

if "%choice%"=="2" goto server
if "%choice%"=="3" goto exit

:browser
echo Launching SKCore Tools in default browser...
start "" "index.html"
exit

:server
echo Starting high-speed native local server...
node server.js
pause
exit

:exit
exit
