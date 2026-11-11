@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0scripts\start-windows.ps1"
if errorlevel 1 pause
