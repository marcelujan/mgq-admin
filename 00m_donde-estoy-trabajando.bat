@echo off
setlocal

REM Verificar que estamos en un repo git
git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo ERROR: Esta carpeta no es un repositorio Git.
  pause
  exit /b 1
)

REM Obtener rama actual
for /f "delims=" %%B in ('git branch --show-current') do set BRANCH=%%B

echo.
echo ===============================
echo Rama actual: %BRANCH%
echo ===============================

if "%BRANCH%"=="main" (
  echo ENTORNO: PRODUCCION (main)
) else if "%BRANCH%"=="prueba-preview" (
  echo ENTORNO: PREVIEW
) else (
  echo ENTORNO: OTRA RAMA
)

echo.
pause
