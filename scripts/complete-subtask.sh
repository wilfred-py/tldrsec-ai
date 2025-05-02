#!/bin/bash

# complete-subtask.sh
# This script marks a subtask as done and then commits it to GitHub
# Usage: ./scripts/complete-subtask.sh <task_id> <subtask_id> [custom_commit_message]

# Exit on any error
set -e

# Check if task_id and subtask_id are provided
if [ "$#" -lt 2 ]; then
  echo "Usage: ./scripts/complete-subtask.sh <task_id> <subtask_id> [custom_commit_message]"
  echo "Example: ./scripts/complete-subtask.sh 2 3 \"Implement database schema\""
  exit 1
fi

TASK_ID="$1"
SUBTASK_ID="$2"
CUSTOM_MESSAGE="${3:-}"

# Mark the subtask as done
echo "Marking subtask $TASK_ID.$SUBTASK_ID as done..."
npx task-master set-status --id="$TASK_ID.$SUBTASK_ID" --status=done

# Check if the status update was successful
if [ $? -ne 0 ]; then
  echo "Error: Failed to mark subtask as done."
  exit 1
fi

# Commit and push the changes
echo "Committing changes to GitHub..."
bash ./scripts/commit-subtask.sh "$TASK_ID" "$SUBTASK_ID" "$CUSTOM_MESSAGE"

echo "✅ Subtask $TASK_ID.$SUBTASK_ID has been marked as done and committed to GitHub" 