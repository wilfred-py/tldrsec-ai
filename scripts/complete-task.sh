#!/bin/bash

# complete-task.sh
# This script marks a task as done, merges the task branch to main, and optionally deletes the branch
# Usage: ./scripts/complete-task.sh <task_id> [custom_message]

# Exit on any error
set -e

# Check if task_id is provided
if [ "$#" -lt 1 ]; then
  echo "Usage: ./scripts/complete-task.sh <task_id> [custom_message]"
  echo "Example: ./scripts/complete-task.sh 2 \"Complete database setup and migrations\""
  exit 1
fi

TASK_ID="$1"
CUSTOM_MESSAGE="${2:-}"

# Get task info from tasks.json
TASK_TITLE=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .title" tasks/tasks.json)

if [ -z "$TASK_TITLE" ]; then
  echo "Error: Could not find task $TASK_ID in tasks.json"
  exit 1
fi

# Convert task title to URL-friendly format
TITLE_SLUG=$(echo "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Define branch name
TASK_BRANCH="task-$TASK_ID-$TITLE_SLUG"

# Check if task branch exists
if ! git show-ref --quiet refs/heads/$TASK_BRANCH; then
  echo "Error: Branch $TASK_BRANCH doesn't exist. Please create it first using create-task-branch.sh"
  exit 1
fi

# Check if all subtasks are done
INCOMPLETE_SUBTASKS=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .subtasks[] | select(.status != \"done\") | .id" tasks/tasks.json)

if [ -n "$INCOMPLETE_SUBTASKS" ]; then
  echo "Warning: The following subtasks are not marked as done:"
  for SUBTASK_ID in $INCOMPLETE_SUBTASKS; do
    SUBTASK_TITLE=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .subtasks[] | select(.id == $SUBTASK_ID) | .title" tasks/tasks.json)
    echo "  - $TASK_ID.$SUBTASK_ID: $SUBTASK_TITLE"
  done
  
  read -p "Do you want to mark all subtasks as done? (y/n): " MARK_ALL_DONE
  if [ "$MARK_ALL_DONE" == "y" ] || [ "$MARK_ALL_DONE" == "Y" ]; then
    for SUBTASK_ID in $INCOMPLETE_SUBTASKS; do
      echo "Marking subtask $TASK_ID.$SUBTASK_ID as done..."
      npx task-master set-status --id="$TASK_ID.$SUBTASK_ID" --status=done
    done
  else
    read -p "Do you want to continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
      echo "Aborting. Please complete all subtasks first or use --force flag."
      exit 1
    fi
  fi
fi

# Switch to the task branch
echo "Switching to branch $TASK_BRANCH..."
git checkout $TASK_BRANCH

# Pull latest changes
git pull origin $TASK_BRANCH || echo "Branch not found on remote or conflicts, continuing..."

# Mark the task as done
echo "Marking task $TASK_ID as done..."
npx task-master set-status --id="$TASK_ID" --status=done

# Create commit message
if [ -n "$CUSTOM_MESSAGE" ]; then
  COMMIT_MSG="feat(task-$TASK_ID): $CUSTOM_MESSAGE"
else
  COMMIT_MSG="feat(task-$TASK_ID): Complete '$TASK_TITLE'"
fi

# Commit the changes
git add tasks/tasks.json
git commit -m "$COMMIT_MSG"
git push origin $TASK_BRANCH

# Merge to main
echo "Merging $TASK_BRANCH into main..."
git checkout main
git pull origin main
git merge --no-ff $TASK_BRANCH -m "Merge: $COMMIT_MSG"
git push origin main

# Ask if we should delete the branch
read -p "Do you want to delete the branch $TASK_BRANCH? (y/n): " DELETE_BRANCH
if [ "$DELETE_BRANCH" == "y" ] || [ "$DELETE_BRANCH" == "Y" ]; then
  git branch -d $TASK_BRANCH
  git push origin --delete $TASK_BRANCH
  echo "Branch $TASK_BRANCH deleted."
fi

echo "✅ Task $TASK_ID has been marked as done and merged to main" 