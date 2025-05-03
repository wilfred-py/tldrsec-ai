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

# Get task info from tasks.json
TASK_TITLE=$(jq -r ".tasks[] | select(.id == $TASK_ID) | .title" tasks/tasks.json)

if [ -z "$TASK_TITLE" ]; then
  echo "Error: Could not find task $TASK_ID in tasks.json"
  exit 1
fi

# Convert task title to URL-friendly format
TITLE_SLUG=$(echo "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Define task branch name
TASK_BRANCH="task-$TASK_ID-$TITLE_SLUG"

# Check if we're on the correct task branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$TASK_BRANCH" ]; then
  echo "You are not on the task branch ($TASK_BRANCH). Current branch: $CURRENT_BRANCH"
  read -p "Do you want to switch to $TASK_BRANCH? (y/n): " SWITCH_BRANCH
  if [ "$SWITCH_BRANCH" == "y" ] || [ "$SWITCH_BRANCH" == "Y" ]; then
    # Check if the branch exists
    if git show-ref --quiet refs/heads/$TASK_BRANCH; then
      git checkout $TASK_BRANCH
    else
      echo "Branch $TASK_BRANCH does not exist. Creating it now..."
      ./scripts/create-task-branch.sh $TASK_ID
    fi
  else
    echo "Aborting. Please switch to the task branch first or use create-task-branch.sh"
    exit 1
  fi
fi

# Make sure we have the latest changes
echo "Updating branch with latest changes..."
git pull origin $TASK_BRANCH || echo "Branch not found on remote yet, continuing..."

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

# Check if all subtasks of this task are completed
ALL_DONE=$(jq -r "[.tasks[] | select(.id == $TASK_ID) | .subtasks[] | .status] | all(. == \"done\")" tasks/tasks.json)

if [ "$ALL_DONE" == "true" ]; then
  # If all subtasks are done, ask to mark the task as done
  echo ""
  echo "🎉 All subtasks for Task $TASK_ID are complete!"
  read -p "Do you want to mark the entire task as done? (y/n): " MARK_TASK_DONE
  if [ "$MARK_TASK_DONE" == "y" ] || [ "$MARK_TASK_DONE" == "Y" ]; then
    npx task-master set-status --id="$TASK_ID" --status=done
    
    # Commit and push the task status change
    git add tasks/tasks.json
    git commit -m "feat(task-$TASK_ID): Complete all subtasks and mark task as done"
    git push origin $TASK_BRANCH
    
    # Merge to main
    git checkout main
    git pull origin main
    git merge --no-ff $TASK_BRANCH -m "Merge: Complete task $TASK_ID - $(jq -r ".tasks[] | select(.id == $TASK_ID) | .title" tasks/tasks.json)"
    git push origin main
    
    # Delete the branch
    read -p "Do you want to delete the task branch now? (y/n): " DELETE_BRANCH
    if [ "$DELETE_BRANCH" == "y" ] || [ "$DELETE_BRANCH" == "Y" ]; then
      git branch -d $TASK_BRANCH
      git push origin --delete $TASK_BRANCH
      echo "Task branch $TASK_BRANCH deleted."
    fi
    
    echo "✅ Task $TASK_ID has been marked as done and merged to main"
  fi
fi 