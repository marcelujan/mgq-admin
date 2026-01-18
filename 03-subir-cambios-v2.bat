@echo off
setlocal
cd /d "%~dp0"

for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set BR=%%b
if "%BR%"=="" (
  echo No pude detectar la rama. Aborta.
  pause
  exit /b 1
)

if /I "%BR%"=="main" (
  echo.
  echo BLOQUEADO: estas en MAIN.
  echo Usa v2 para trabajar y subir cambios:
  echo   - Ejecuta 02-ir-v2.bat
  echo   - Luego vuelve a ejecutar este script.
  echo.
  pause
  exit /b 1
)

if /I not "%BR%"=="v2" (
  echo.
  echo BLOQUEADO: este script solo sube cambios desde v2.
  echo Rama actual: %BR%
  echo.
  pause
  exit /b 1
)

git status -sb
echo.
set /p MSG=Mensaje de commit: 
if "%MSG%"=="" (
  echo Sin mensaje. Aborta.
  pause
  exit /b 1
)

git add -A
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo No hubo commit (quizas no habia cambios).
  pause
  exit /b 1
)

git push origin v2
pause
endlocal
