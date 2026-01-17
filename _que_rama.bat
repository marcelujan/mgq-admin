@echo off
cd /d "%~dp0"
echo Branch:
git branch --show-current
echo.
echo Remote:
git remote -v
echo.
git status
pause