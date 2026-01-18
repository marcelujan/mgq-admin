@echo off
setlocal
cd /d "%~dp0"
git checkout v2
if errorlevel 1 (
  echo ERROR: no pude cambiar a v2.
  pause
  exit /b 1
)
git pull origin v2
git status -sb
pause
endlocal
