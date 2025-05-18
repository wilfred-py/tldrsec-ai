#!/bin/bash

# Check if task number is provided
if [ -z "$1" ]; then
  echo "Error: Task number is required"
  echo "Usage: ./scripts/create-task-branch.sh <task-number> [branch-name-suffix]"
  echo "Example: ./scripts/create-task-branch.sh 3 sec-filing-service"
  exit 1
fi

# Task number from first argument
TASK_NUMBER=$1

# Branch suffix (optional)
BRANCH_SUFFIX=$2

# Get the current branch
CURRENT_BRANCH=$(git branch --show-current)

# Get the task title from tasks.json
TASK_TITLE=$(node -e "
  try {
    const fs = require('fs');
    const tasks = JSON.parse(fs.readFileSync('./tasks/tasks.json', 'utf8')).tasks;
    const task = tasks.find(t => t.id === $TASK_NUMBER);
    if (!task) {
      console.error('Task $TASK_NUMBER not found');
      process.exit(1);
    }
    // Convert to kebab case and lowercase
    const kebabTitle = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    console.log(kebabTitle);
  } catch (err) {
    console.error('Error reading tasks file:', err.message);
    process.exit(1);
  }
")

# Create branch name
if [ -n "$BRANCH_SUFFIX" ]; then
  BRANCH_NAME="task-$TASK_NUMBER-$BRANCH_SUFFIX"
else
  BRANCH_NAME="task-$TASK_NUMBER-$TASK_TITLE"
fi

# Check if we need to switch back to main first
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Currently on branch '$CURRENT_BRANCH'. Switching to 'main' first..."
  git checkout main
  if [ $? -ne 0 ]; then
    echo "Error: Failed to switch to main branch"
    exit 1
  fi
fi

# Create and checkout the new branch
echo "Creating branch '$BRANCH_NAME'..."
git checkout -b $BRANCH_NAME

# Print next steps
if [ $? -eq 0 ]; then
  echo "Successfully created branch '$BRANCH_NAME'"
  echo ""
  echo "Next steps:"
  echo "1. Make your changes for Task $TASK_NUMBER"
  echo "2. Commit your changes: git commit -m \"Implement task $TASK_NUMBER: <description>\""
  echo "3. Push to GitHub: git push -u origin $BRANCH_NAME"
  echo "4. Create a pull request: https://github.com/wilfred-py/tldrsec-ai/pull/new/$BRANCH_NAME"
  echo ""
else
  echo "Error: Failed to create branch"
  exit 1
fi 