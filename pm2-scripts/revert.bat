@echo off
setlocal enabledelayedexpansion

:: PM2 revert script - rolls back to a previous commit
:: Usage: pm2 exec revert.bat -- [number_of_commits_to_revert]

:: Default to reverting 1 commit if no argument is provided
set COMMITS_TO_REVERT=1
if not "%~1"=="" set COMMITS_TO_REVERT=%~1

echo Starting revert process...
echo Reverting %COMMITS_TO_REVERT% commit(s)...

:: Store current branch name
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%a

:: Get the commit hash to revert to
for /f "tokens=*" %%a in ('git rev-parse HEAD~%COMMITS_TO_REVERT%') do set TARGET_COMMIT=%%a

:: Perform the revert
git reset --hard %TARGET_COMMIT%
if %ERRORLEVEL% neq 0 (
  echo Error: Failed to revert to previous commit
  exit /b 1
)

:: Get short commit hash for display
for /f "tokens=*" %%a in ('git rev-parse --short HEAD') do set SHORT_COMMIT=%%a
echo Successfully reverted to commit: !SHORT_COMMIT!
echo Running post-revert deployment process...

:: Run the deployment process
call npm install
call npm run build

:: Restart the application
call pm2 reload ecosystem.cjs --env production

echo Revert and redeployment completed successfully
