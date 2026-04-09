@echo off
setlocal

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=3004"

cd /d "%ROOT%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [error] npm.cmd not found. Please install Node.js 24 LTS first.
  exit /b 1
)

echo [1/4] Working directory: %ROOT%

if not exist node_modules (
  echo [2/4] Installing dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
) else (
  echo [2/4] Dependencies already installed.
)

echo [3/4] Building production bundle...
call npm.cmd run build
if errorlevel 1 exit /b 1

echo [4/4] Starting Agent Config Hub on http://127.0.0.1:%PORT%
start "Agent Config Hub" cmd /k "cd /d ""%ROOT%"" && call npm.cmd run start -- --port %PORT%"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%PORT%'; $deadline=(Get-Date).AddSeconds(25); do { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if ($response.StatusCode -ge 200) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 0"

echo Agent Config Hub should now be available at http://127.0.0.1:%PORT%
exit /b 0
