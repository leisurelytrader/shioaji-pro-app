@echo off
setlocal
cd /d "%~dp0.."

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-shioaji-dev.ps1" -ProjectRoot "%CD%"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo.
    echo [shioaji] 啟動失敗，錯誤碼：%EXITCODE%
    pause
    exit /b %EXITCODE%
)

pause
