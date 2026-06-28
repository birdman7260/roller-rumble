@echo off
REM Double-click this file to run the OpenSprints probe.
REM It launches the PowerShell script with ExecutionPolicy Bypass for THIS run
REM only - it does not change any setting on the computer and needs no admin.

setlocal
cd /d "%~dp0"

echo Starting the OpenSprints probe...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Probe-OpenSprints.ps1"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo The probe exited with a problem. See the messages above and the saved .txt file.
  echo If nothing was saved, read INSTRUCTIONS.txt for what to try next.
  echo.
)

pause
