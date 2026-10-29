@echo off
rem ============================================================
rem  Production server launcher (double-click to start)
rem    1. pull updates from git   2. install packages if changed
rem    3. build if source changed 4. apply DB schema   5. start
rem  Details: scripts\serve.mjs
rem  Options: start-server.cmd --no-pull / --rebuild
rem ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 22 from https://nodejs.org/
  pause
  exit /b 1
)

node scripts\serve.mjs %*
if errorlevel 1 pause
