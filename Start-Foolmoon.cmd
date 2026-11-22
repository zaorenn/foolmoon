@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if exist "%ROOT%\Foolmoon.exe" (
  start "" "%ROOT%\Foolmoon.exe"
  exit /b 0
)
title Foolmoon Desktop Launcher
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $fmRoot = $env:ROOT; foreach ($v in @('HERMES_HOME','PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','__HERMES_ACTIVATED','__HERMES_TEST_PYTHON')) { Remove-Item \"Env:$v\" -ErrorAction SilentlyContinue }; if (Test-Path (Join-Path $fmRoot 'apps\desktop\dist\electron-main.mjs')) { $env:HERMES_SKIP_ACTIVATE_SETUP = '1' }; . (Join-Path $fmRoot 'activate.ps1') | Out-Null; Remove-Item Env:HERMES_SKIP_ACTIVATE_SETUP -ErrorAction SilentlyContinue; foreach ($v in @('PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','__HERMES_ACTIVATED','__HERMES_TEST_PYTHON')) { Remove-Item \"Env:$v\" -ErrorAction SilentlyContinue }; $env:HERMES_HOME = Join-Path $env:LOCALAPPDATA 'hermes'; $env:HERMES_DESKTOP_HERMES_ROOT = $fmRoot; $env:HERMES_DESKTOP_IGNORE_EXISTING = '1'; $pyTool = Get-ChildItem (Join-Path $env:HERMES_HOME 'tools') -Directory -Filter 'python-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'python.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1; if ($pyTool) { $env:HERMES_DESKTOP_PYTHON = (& $pyTool -c \"import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); from pm.environments import project_python; print(project_python(Path(sys.argv[1])))\" $fmRoot | Out-String).Trim() }; Set-Location (Join-Path $fmRoot 'apps\desktop'); if (-not (Test-Path 'dist\electron-main.mjs')) { pnpm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }; if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) { node (Join-Path $fmRoot 'scripts\build\electron-runtime.mjs') --source $fmRoot; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }; Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.' -WorkingDirectory (Join-Path $fmRoot 'apps\desktop')"
if errorlevel 1 (
  echo.
  echo Foolmoon exited with an error. Press any key to close...
  pause >nul
)
