#!/bin/bash

# PM2 revert script - rolls back to a previous commit
# Usage: pm2 exec revert.sh -- [number_of_commits_to_revert]

# Default to reverting 1 commit if no argument is provided
COMMITS_TO_REVERT=${1:-1}

echo "Starting revert process..."
echo "Reverting $COMMITS_TO_REVERT commit(s)..."

# Store current branch name
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Get the commit hash to revert to
TARGET_COMMIT=$(git rev-parse HEAD~$COMMITS_TO_REVERT)

# Perform the revert
git reset --hard $TARGET_COMMIT
if [ $? -ne 0 ]; then
  echo "Error: Failed to revert to previous commit"
  exit 1
fi

echo "Successfully reverted to commit: $(git rev-parse --short HEAD)"
echo "Running post-revert deployment process..."

# Run the deployment process
npm install
npm run build

# Restart the application
pm2 reload ecosystem.cjs --env production

echo "Revert and redeployment completed successfully"
