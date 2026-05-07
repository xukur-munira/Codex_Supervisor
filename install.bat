@echo off
REM Codex Supervisor - Installation Script for Windows
REM External Supervisor for OpenAI Codex CLI
REM Usage: install.bat [--with-redis]

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%
set DATA_DIR=%USERPROFILE%\.codex-supervisor

echo ============================================
echo  Codex Supervisor Installation
echo  External Supervisor for OpenAI Codex CLI
echo ============================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 20+ first.
    exit /b 1
)

for /f "tokens=2 delims=v" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=1 delims=." %%i in ("%NODE_VERSION%") do set NODE_MAJOR=%%i

if %NODE_MAJOR% lss 20 (
    echo [ERROR] Node.js version must be 20+. Current:
    node -v
    exit /b 1
)

echo [INFO] Node.js version:
node -v
echo.

REM Check OpenAI Codex CLI
where codex >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] OpenAI Codex CLI not found. You can install it later:
    echo        npm install -g @openai/codex
    echo.
) else (
    echo [INFO] OpenAI Codex CLI found.
    echo.
)

REM Parse arguments
set WITH_REDIS=false
if "%~1"=="--with-redis" set WITH_REDIS=true

REM Install dependencies
echo [INFO] Installing dependencies...
cd /d "%SCRIPT_DIR%"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    exit /b 1
)
echo.

REM Build project
echo [INFO] Building project...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    exit /b 1
)
echo [INFO] Build complete!
echo.

REM Link CLI command globally
echo [INFO] Linking CLI command...
call npm link
if %errorlevel% neq 0 (
    echo [WARN] npm link failed. You can still run via: node dist/index.js
) else (
    echo [INFO] CLI command 'codex-supervisor' is now available globally
)
echo.

REM Create data directory
if not exist "%DATA_DIR%" (
    mkdir "%DATA_DIR%"
    mkdir "%DATA_DIR%\projects"
    mkdir "%DATA_DIR%\tasks"
    mkdir "%DATA_DIR%\checkpoints"
    mkdir "%DATA_DIR%\logs"
    echo [INFO] Created data directory: %DATA_DIR%
)

REM Set environment variable hint
echo.
echo ==========================================
echo [INFO] Installation complete!
echo ==========================================
echo.

if "%WITH_REDIS%"=="true" (
    echo [INFO] Redis mode enabled. Make sure Redis is running.
    echo       Run: redis-cli ping
    echo.
) else (
    echo [INFO] Using in-memory queue (Redis not configured)
    echo       To enable Redis, run: install.bat --with-redis
    echo.
)

echo [INFO] Set environment variables (optional):
echo       set CODEX_DATA_DIR=%DATA_DIR%
echo       set CODEX_LOG_LEVEL=info
if "%WITH_REDIS%"=="true" (
    echo       set CODEX_REDIS_URL=redis://localhost:6379
)
echo.

echo [INFO] Quick Start:
echo.
echo   Start REST API server:
echo     codex-supervisor serve
echo     codex-supervisor serve --port 8080
echo.
echo   Create a new project:
echo     codex-supervisor run -d ./my-project -D "Build a web app"
echo.
echo   Check project status:
echo     codex-supervisor status --project-id PROJECT_ID
echo     codex-supervisor list
echo.
echo [INFO] REST API Endpoints (when serving):
echo   POST /api/projects              - Create project
echo   GET  /api/projects              - List projects
echo   GET  /api/projects/:id          - Get project status
echo   POST /api/projects/:id/tasks    - Decompose tasks
echo   POST /api/projects/:id/workers  - Spawn Codex worker
echo   POST /api/projects/:id/confirm  - Supervisor confirm
echo   POST /api/projects/:id/finalize - Finalize project
echo.

endlocal