@echo off
setlocal

REM Ejecutar siempre desde la carpeta donde está este .bat
cd /d "%~dp0" || (echo No pude entrar a la carpeta del script.& pause & exit /b 1)

title MGQ - Estado
echo ===== REPO =====
for %%I in (.) do echo %%~fI
echo.

REM Rama actual (más robusto que branch --show-current)
for /f "usebackq delims=" %%b in (`git rev-parse --abbrev-ref HEAD 2^>nul`) do set "BR=%%b"

if not defined BR (
  echo No pude detectar la rama.
  echo - Asegurate de ejecutar este .bat dentro del repo (misma carpeta que .git)
  echo - Asegurate de tener Git instalado y en PATH
  echo.
  pause
  exit /b 1
)

echo ===== BRANCH =====
echo %BR%
echo.

echo ===== STATUS (resumen) =====
git status -sb
echo.

echo ===== ULTIMOS COMMITS =====
git log --oneline --decorate -5
echo.

pause