@echo off
cd /d "%~dp0"
git status --porcelain | findstr . >nul && (
  echo Tenes cambios sin commit. Commit o stash antes de cambiar de rama.
  exit /b 1
)
git checkout prueba-preview && git pull --rebase origin prueba-preview
if errorlevel 1 exit /b 1
