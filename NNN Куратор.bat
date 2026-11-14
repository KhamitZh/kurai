@echo off
chcp 65001 >nul
cd /d "%~dp0"
title NNN Kurator
if not exist node_modules (
  echo Installing libraries, please wait...
  call npm install
)
node server.js --open
pause
