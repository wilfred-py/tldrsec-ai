#!/bin/bash

# commit-subtask.sh
# This script commits a completed subtask to the GitHub repository using a feature branch workflow
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

# Convert task title to URL-friendly format
TASK_TITLE_SLUG=$(echo "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Convert subtask title to URL-friendly format
SUBTASK_TITLE_SLUG=$(echo "$SUBTASK_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Define task branch
TASK_BRANCH="task-$TASK_ID-$TASK_TITLE_SLUG"

# Define subtask branch name (not used in current workflow, but keeping for potential future use)
SUBTASK_BRANCH="task-$TASK_ID.$SUBTASK_ID-$SUBTASK_TITLE_SLUG"

# Check if we're already on the right branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$TASK_BRANCH" ]; then
  # Check if branch already exists
  if git show-ref --quiet refs/heads/$TASK_BRANCH; then
    # Branch exists, switch to it
    echo "Switching to existing branch $TASK_BRANCH..."
    git checkout $TASK_BRANCH
  else
    # Create and switch to new branch from main
    echo "Creating new branch $TASK_BRANCH from main..."
    git checkout main
    git pull origin main
    git checkout -b $TASK_BRANCH
  fi
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

# Push the branch to GitHub
echo "Pushing branch $TASK_BRANCH to GitHub..."
git push -u origin $TASK_BRANCH

# Check if all subtasks of this task are completed
ALL_DONE=$(jq -r "[.tasks[] | select(.id == $TASK_ID) | .subtasks[] | .status] | all(. == \"done\")" tasks/tasks.json)

# Merge to main branch
echo "Merging changes to main branch..."
git checkout main
git pull origin main
git merge --no-ff $TASK_BRANCH -m "Merge: $COMMIT_MSG"
git push origin main

# Return to feature branch
git checkout $TASK_BRANCH

# If this was the last subtask of the task, and all are done, offer to delete the branch
if [ "$ALL_DONE" == "true" ]; then
  echo ""
  echo "All subtasks for Task $TASK_ID are completed!"
  read -p "Do you want to delete the branch $TASK_BRANCH? (y/n): " DELETE_BRANCH
  if [ "$DELETE_BRANCH" == "y" ] || [ "$DELETE_BRANCH" == "Y" ]; then
    git checkout main
    git branch -d $TASK_BRANCH
    git push origin --delete $TASK_BRANCH
    echo "Branch $TASK_BRANCH deleted."
  fi
fi

echo "Successfully committed, pushed, and merged subtask $TASK_ID.$SUBTASK_ID: $SUBTASK_TITLE" 