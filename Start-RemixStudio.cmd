@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.local\bin;%PATH%"
call npm.cmd run dev -- --hostname 127.0.0.1
if errorlevel 1 pause
