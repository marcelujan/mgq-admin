@echo off
setlocal
cd /d "%~dp0"
echo ===== REPO =====
for %%I in (.) do echo %%~fI
echo.
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set BR=%%b
if "%BR%"=="" (
  echo No pude detectar la rama (¿estas dentro del repo? ¿git instalado?).
  pause
  exit /b 1
)
echo ===== BRANCH =====
echo %BR%
echo.
echo ===== STATUS =====
git status -sb
echo.
echo ===== LAST 5 COMMITS =====
git log --oneline --decorate -5
echo.
pause
endlocal