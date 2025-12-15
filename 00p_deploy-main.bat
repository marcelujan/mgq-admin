@echo off
setlocal enabledelayedexpansion

REM Ir a la carpeta donde está este .bat
cd /d "%~dp0"

REM (opcional) inicializar si no es repo
git rev-parse --is-inside-work-tree >NUL 2>&1 || (
  echo Inicializando git...
  git init && git branch -M main
)

REM Mensaje de commit: usa el argumento o uno por defecto
set MSG=%*
if "%MSG%"=="" set MSG=deploy: auto

REM Add + commit solo si hay cambios
git add -A
git diff --cached --quiet || git commit -m "%MSG%"

REM Rebase con remoto (si existe) y push
git pull --rebase origin main >NUL 2>&1
git push -u origin main

echo Listo. Pulsa una tecla para salir.
pause >NUL
