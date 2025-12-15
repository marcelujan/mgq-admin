@echo off
setlocal enabledelayedexpansion

REM Ir a la carpeta donde está este .bat
cd /d "%~dp0"

REM Verificar que sea un repo git
git rev-parse --is-inside-work-tree >NUL 2>&1
if errorlevel 1 (
  echo ERROR: Esta carpeta no es un repo git.
  pause
  exit /b 1
)

REM Mensaje de commit
set MSG=%*
if "%MSG%"=="" set MSG=deploy: auto

REM Asegurar que no estamos en main
for /f %%b in ('git branch --show-current') do set BRANCH=%%b
if "%BRANCH%"=="main" (
  echo ERROR: Estas en main. Este script es SOLO para preview.
  pause
  exit /b 1
)

REM Add + commit si hay cambios
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
)

REM Push de la rama actual
git push -u origin %BRANCH%
if errorlevel 1 (
  echo ERROR: Fallo el push.
  pause
  exit /b 1
)

echo -----------------------------------
echo Preview deploy OK en rama %BRANCH%
echo Vercel va a crear el Preview automaticamente
echo -----------------------------------

REM Cerrar automáticamente
exit /b 0
