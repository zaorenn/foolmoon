@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
title Foolmoon Desktop Launcher
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $root = $env:ROOT; foreach ($v in @('HERMES_HOME','PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','__HERMES_ACTIVATED','__HERMES_TEST_PYTHON')) { Remove-Item \"Env:$v\" -ErrorAction SilentlyContinue }; . (Join-Path $root 'activate.ps1') | Out-Null; foreach ($v in @('PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','__HERMES_ACTIVATED','__HERMES_TEST_PYTHON')) { Remove-Item \"Env:$v\" -ErrorAction SilentlyContinue }; $env:HERMES_HOME = Join-Path $env:LOCALAPPDATA 'hermes'; $env:HERMES_DESKTOP_HERMES_ROOT = $root; $env:HERMES_DESKTOP_IGNORE_EXISTING = '1'; Set-Location (Join-Path $root 'apps\desktop'); if (-not (Test-Path 'dist\electron-main.mjs')) { pnpm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }; pnpm exec electron ."
if errorlevel 1 (
  echo.
  echo Foolmoon exited with an error. Press any key to close...
  pause >nul
)
