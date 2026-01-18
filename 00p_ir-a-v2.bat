@echo off
setlocal

cd /d "%~dp0"

git rev-parse --is-inside-work-tree >NUL 2>&1 || (
  echo ERROR: Esta carpeta no es un repo git.
  echo Carpeta: %CD%
  pause
  exit /b 1
)

REM Cambiar a la rama preview (ajusta el nombre si tu rama es otra)
set "TARGET=v2"

REM Importante: NO ocultar errores. Si falla, lo vas a ver.
echo Cambiando a %TARGET%...
git switch %TARGET%
if errorlevel 1 (
  echo.
  echo ERROR: no pude cambiar de rama.
  echo Tip: si ves un *.lock en .git, cierra otros procesos de git y borra el lock.
  pause
  exit /b 1
)

echo OK. Ahora estas en:
git branch --show-current

exit /b 0
