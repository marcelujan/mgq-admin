@echo off
setlocal
cd /d "%~dp0"
git checkout main
if errorlevel 1 (
  echo ERROR: no pude cambiar a main.
  pause
  exit /b 1
)
git pull origin main
git status -sb
pause
endlocal
