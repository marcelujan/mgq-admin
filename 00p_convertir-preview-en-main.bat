@echo off
cd /d "%~dp0"

git status --porcelain | findstr . >nul && (
  echo Tenes cambios sin commit. Commit o stash antes del merge.
  exit /b 1
)

git checkout main || exit /b 1
git pull --rebase origin main || exit /b 1

git merge prueba-preview
if errorlevel 1 (
  echo Hubo conflictos. Resolve en VSCode, luego:
  echo   git add -A
  echo   git commit
  exit /b 1
)

git push origin main || exit /b 1
