#!/bin/bash

# create-task-branch.sh
# This script creates a feature branch for a task in preparation for working on its subtasks
# Usage: ./scripts/create-task-branch.sh <task_id>

# Exit on any error
set -e

# Check if task_id is provided
if [ "$#" -lt 1 ]; then
  echo "Usage: ./scripts/create-task-branch.sh <task_id>"
  echo "Example: ./scripts/create-task-branch.sh 2"
  exit 1
fi

TASK_ID="$1"

# Get task info from tasks.json
TASK_TITLE=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .title" tasks/tasks.json)
TASK_STATUS=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .status" tasks/tasks.json)

if [ -z "$TASK_TITLE" ]; then
  echo "Error: Could not find task $TASK_ID in tasks.json"
  exit 1
fi

# Convert task title to URL-friendly format (lowercase, replace spaces with hyphens, remove special chars)
TITLE_SLUG=$(echo "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Define branch name for the task
BRANCH_NAME="task-$TASK_ID-$TITLE_SLUG"

# Check if branch already exists
if git show-ref --quiet refs/heads/$BRANCH_NAME; then
  echo "Branch $BRANCH_NAME already exists."
  read -p "Do you want to use the existing branch? (y/n): " USE_EXISTING
  if [ "$USE_EXISTING" == "y" ] || [ "$USE_EXISTING" == "Y" ]; then
    echo "Switching to existing branch $BRANCH_NAME..."
    git checkout $BRANCH_NAME
    exit 0
  else
    echo "Aborting. Please delete or rename the existing branch first."
    exit 1
  fi
fi

# Make sure we have the latest main
echo "Updating main branch..."
git checkout main
git pull origin main

# Create and switch to new branch
echo "Creating new branch $BRANCH_NAME for task: $TASK_TITLE"
git checkout -b $BRANCH_NAME

# Set task status to in-progress if not already
if [ "$TASK_STATUS" != "in-progress" ]; then
  echo "Setting task status to in-progress..."
  npx task-master set-status --id="$TASK_ID" --status=in-progress
  
  # Add and commit the status change
  git add tasks/tasks.json
  git commit -m "chore(task-$TASK_ID): Set task status to in-progress"
  git push -u origin $BRANCH_NAME
fi

echo ""
echo "✅ Branch $BRANCH_NAME created successfully!"
echo "Task: $TASK_ID - $TASK_TITLE"
echo ""
echo "You can now work on the subtasks for this task. When you complete a subtask,"
echo "use ./scripts/complete-subtask.sh to mark it as done and commit your changes."
echo ""
echo "Example:"
echo "  ./scripts/complete-subtask.sh $TASK_ID 1 \"Implemented feature X\"" 