@echo off
setlocal EnableDelayedExpansion
cd /d %~dp0

echo [1/7] Python environment...
if not exist .venv (
    python -m venv .venv || goto :error
)

call .venv\Scripts\activate.bat || goto :error
python -m pip install --upgrade pip || goto :error
pip install -r backend\requirements.txt || goto :error

echo [2/7] Checking Node.js...
where node >nul 2>nul || goto :node_missing
where npm >nul 2>nul || goto :node_missing

echo [3/7] Frontend dependencies...
if not exist node_modules (
    call npm install || goto :error
) else (
    echo node_modules already exists, skipping install
)

echo [4/7] Environment file...
if not exist .env (
    echo .env not found. Copy .env.example to .env and fill in values.
    echo.
    echo IMPORTANT:
    echo VITE_AI_API_BASE_URL=http://127.0.0.1:8001
    echo ALLOWED_ORIGINS=http://127.0.0.1:8000,http://localhost:8000
    echo.
) else (
    findstr /B /C:"VITE_AI_API_BASE_URL=" .env >nul 2>nul
    if errorlevel 1 (
        echo WARNING: VITE_AI_API_BASE_URL not found in .env
        echo Add this line:
        echo VITE_AI_API_BASE_URL=http://127.0.0.1:8001
        echo.
    )
    findstr /B /C:"ALLOWED_ORIGINS=" .env >nul 2>nul
    if errorlevel 1 (
        echo WARNING: ALLOWED_ORIGINS not found in .env
        echo Add this line:
        echo ALLOWED_ORIGINS=http://127.0.0.1:8000,http://localhost:8000
        echo.
    )
)

echo [5/7] Building frontend...
call npm run build || goto :error

echo [6/7] Starting AI backend on http://127.0.0.1:8001 ...
start "Bilimcorp AI Backend" cmd /k "cd /d %~dp0backend && call ..\.venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload"

timeout /t 3 /nobreak >nul

echo [7/7] Starting platform server on http://127.0.0.1:8000 ...
python -m uvicorn backend.frontend_server:app --host 127.0.0.1 --port 8000

goto :end

:node_missing
echo.
echo Node.js and npm were not found in PATH.
echo Install Node.js LTS, reopen terminal, and run this file again.
pause
exit /b 1

:error
echo.
echo Startup failed.
pause
exit /b 1

:end
echo.
echo Server stopped.
pause