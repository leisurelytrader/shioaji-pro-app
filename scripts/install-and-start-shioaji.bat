@echo off
setlocal
cd /d "%~dp0.."

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-and-start-shioaji.ps1" -CollectorRoot "C:\Users\Leisu\shioaji-private-collector" -FrontendRoot "C:\Users\Leisu\shioaji-pro-app"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo.
    echo [shioaji] Installation or startup failed. Exit code: %EXITCODE%
    pause
    exit /b %EXITCODE%
)

echo.
echo [shioaji] Installation and startup completed.
pause
