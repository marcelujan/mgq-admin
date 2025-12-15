@echo off
setlocal

cd /d "%~dp0"

git rev-parse --is-inside-work-tree >NUL 2>&1 || (
  echo ERROR: Esta carpeta no es un repo git.
  echo Carpeta: %CD%
  pause
  exit /b 1
)

set "TARGET=main"

echo Cambiando a %TARGET%...
git switch %TARGET%
if errorlevel 1 (
  echo.
  echo ERROR: no pude cambiar de rama.
  pause
  exit /b 1
)

echo OK. Ahora estas en:
git branch --show-current

exit /b 0
