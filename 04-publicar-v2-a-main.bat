@echo off
setlocal
cd /d "%~dp0"

echo Esto va a:
echo   1) Actualizar main
echo   2) Merge de v2 dentro de main
echo   3) Push a origin/main (PRODUCCION)
echo.
set /p OK=Escribi SI para continuar: 
if /I not "%OK%"=="SI" (
  echo Cancelado.
  pause
  exit /b 0
)

git checkout main
if errorlevel 1 (
  echo ERROR: no pude cambiar a main.
  pause
  exit /b 1
)

git pull origin main
if errorlevel 1 (
  echo ERROR: fallo pull de main.
  pause
  exit /b 1
)

git merge v2
if errorlevel 1 (
  echo.
  echo ERROR: hubo conflictos en el merge.
  echo Resolvelos, luego:
  echo   git add -A
  echo   git commit
  echo   git push origin main
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo ERROR: fallo el push a main.
  pause
  exit /b 1
)

echo Listo: main publicado.
pause
endlocal
