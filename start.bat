@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js/npm was not found on PATH.
  echo Install Node.js from https://nodejs.org/ then run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies - first run only, this can take a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed - see the errors above.
    echo.
    pause
    exit /b 1
  )
)

echo Starting Snappy Tool...
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start msedge http://localhost:5173"

call npm run dev

echo.
echo Snappy Tool server stopped.
pause
