@echo off
setlocal enabledelayedexpansion

REM ==========================================================
REM MGQ - Push changes to GitHub (branch v2)
REM ==========================================================

cd /d "%~dp0"

echo.
echo ===== MGQ: GIT STATUS =====
git status
if errorlevel 1 goto :error

echo.
set /p msg=Commit message (ej: "fix items search filter"): 
if "%msg%"=="" set msg=update

echo.
echo ===== Switching to branch v2 =====
git rev-parse --abbrev-ref HEAD >nul 2>&1
if errorlevel 1 goto :error

REM Si no estás en v2, cambia a v2
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set currentBranch=%%b
if /i not "!currentBranch!"=="v2" (
  echo Current branch is "!currentBranch!" - switching to v2...
  git checkout v2
  if errorlevel 1 goto :error
)

echo.
echo ===== Adding changes =====
git add -A
if errorlevel 1 goto :error

echo.
echo ===== Committing =====
git commit -m "%msg%"
if errorlevel 1 (
  echo.
  echo No commit created (maybe nothing changed). Continuing...
)

echo.
echo ===== Pull latest (rebase) =====
git pull --rebase origin v2
if errorlevel 1 goto :error

echo.
echo ===== Pushing to origin/v2 =====
git push origin v2
if errorlevel 1 goto :error

echo.
echo ✅ DONE: Changes pushed to GitHub (branch v2)
echo Now Vercel should detect the push and redeploy.
pause
exit /b 0

:error
echo.
echo ❌ ERROR: Git command failed.
echo Make sure:
echo  - you are inside the repo folder
echo  - git is installed
echo  - remote origin is configured
echo  - you have permissions / credentials
pause
exit /b 1
