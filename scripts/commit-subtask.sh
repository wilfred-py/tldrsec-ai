#!/bin/bash

# commit-subtask.sh
# This script commits a completed subtask to the GitHub repository
# Usage: ./scripts/commit-subtask.sh <task_id> <subtask_id> [custom_message]

# Exit on any error
set -e

# Check if task_id and subtask_id are provided
if [ "$#" -lt 2 ]; then
  echo "Usage: ./scripts/commit-subtask.sh <task_id> <subtask_id> [custom_message]"
  echo "Example: ./scripts/commit-subtask.sh 2 3"
  exit 1
fi

TASK_ID="$1"
SUBTASK_ID="$2"
CUSTOM_MESSAGE="${3:-}"

# Get task and subtask info from tasks.json
TASK_TITLE=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .title" tasks/tasks.json)
SUBTASK_TITLE=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .subtasks[] | select(.id == $SUBTASK_ID) | .title" tasks/tasks.json)

if [ -z "$SUBTASK_TITLE" ]; then
  echo "Error: Could not find subtask $TASK_ID.$SUBTASK_ID in tasks.json"
  exit 1
fi

# Create commit message
if [ -n "$CUSTOM_MESSAGE" ]; then
  COMMIT_MSG="feat(task-$TASK_ID.$SUBTASK_ID): $CUSTOM_MESSAGE"
else
  COMMIT_MSG="feat(task-$TASK_ID.$SUBTASK_ID): Complete '$SUBTASK_TITLE'"
fi

# Add all files to git
git add .

# Commit with the generated message
git commit -m "$COMMIT_MSG"

# Push to the repository
echo "Pushing changes to GitHub..."
git push

echo "Successfully committed and pushed subtask $TASK_ID.$SUBTASK_ID: $SUBTASK_TITLE" 