@echo off
title Agentarium
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if errorlevel 1 (
  echo.
  echo Agentarium did not start. Review the error above.
  pause
)
