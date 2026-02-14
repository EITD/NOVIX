@echo off
setlocal
chcp 65001 >nul
echo ========================================
echo    WenShape One-Click Start
echo ========================================
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Python not found. Please install Python 3.10+.
    echo Download: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Node.js not found. Please install Node.js 18+.
    echo Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] Starting backend...
for /f "usebackq tokens=1,2 delims=," %%a in (`powershell -NoProfile -Command "$bp=$env:WENSHAPE_BACKEND_PORT; if(-not $bp){$bp=$env:PORT}; if(-not $bp){$bp=8000}; $fp=$env:WENSHAPE_FRONTEND_PORT; if(-not $fp){$fp=$env:VITE_DEV_PORT}; if(-not $fp){$fp=3000}; function Pick([int]$start){ for($p=$start;$p -lt ($start+30);$p++){ try{$l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p);$l.Start();$l.Stop(); return $p}catch{}} return $start }; Write-Output ((Pick([int]$bp)).ToString()+','+(Pick([int]$fp)).ToString())"` ) do (
    set "WENSHAPE_BACKEND_PORT=%%a"
    set "WENSHAPE_FRONTEND_PORT=%%b"
)
start "WenShape Backend" cmd /k "set PORT=%WENSHAPE_BACKEND_PORT%&& set WENSHAPE_BACKEND_PORT=%WENSHAPE_BACKEND_PORT%&& set WENSHAPE_AUTO_PORT=1&& cd /d %~dp0backend && run.bat"
timeout /t 3 >nul

echo [2/3] Starting frontend...
start "WenShape Frontend" cmd /k "set VITE_DEV_PORT=%WENSHAPE_FRONTEND_PORT%&& set WENSHAPE_FRONTEND_PORT=%WENSHAPE_FRONTEND_PORT%&& set VITE_BACKEND_PORT=%WENSHAPE_BACKEND_PORT%&& set WENSHAPE_BACKEND_PORT=%WENSHAPE_BACKEND_PORT%&& set VITE_BACKEND_URL=http://localhost:%WENSHAPE_BACKEND_PORT%&& cd /d %~dp0frontend && run.bat"

echo.
echo [3/3] Services started.
echo.
echo ========================================
echo  URLs:
echo ----------------------------------------
echo  Frontend:  http://localhost:%WENSHAPE_FRONTEND_PORT%
echo  Backend:   http://localhost:%WENSHAPE_BACKEND_PORT%
echo  Docs:      http://localhost:%WENSHAPE_BACKEND_PORT%/docs
echo ========================================
echo.
echo Tip: Close the opened windows to stop services.
echo.
pause
