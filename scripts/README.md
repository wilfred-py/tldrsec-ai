# Task Automation Scripts

This directory contains automation scripts for managing task completion and GitHub integration in the SECInsightAI project.

## Branch-Based Workflow

This project uses a branch-based Git workflow where each task gets its own feature branch. The workflow is as follows:

1. Create a task branch for the main task (with task ID and title in the branch name)
2. Complete each subtask, committing changes on the task branch
3. After all subtasks are completed, mark the task as done and merge to main
4. Delete the task branch once it's no longer needed

## Branch Naming Convention

Branches follow this naming convention:
- Task branches: `task-<task_id>-<task-title-slug>`
- Example: `task-2-set-up-postgresql-database-and-schema`

This makes branches more descriptive and easier to identify in the Git history.

## Available Scripts

### `create-task-branch.sh`

Creates a new feature branch for a task and marks it as in-progress. The branch name includes the task ID and a slug of the task title.

**Usage:**
```bash
./scripts/create-task-branch.sh <task_id>
```

**Example:**
```bash
# Create a branch for task 3
./scripts/create-task-branch.sh 3
# Creates a branch like: task-3-implement-sec-edgar-monitoring-service
```

### `complete-subtask.sh`

Marks a subtask as done and commits the changes to the task branch.

**Usage:**
```bash
./scripts/complete-subtask.sh <task_id> <subtask_id> [custom_commit_message]
```

**Example:**
```bash
# Mark subtask 2.3 as done with a custom commit message
./scripts/complete-subtask.sh 2 3 "Implement database schema with foreign key constraints"
```

### `complete-task.sh`

Marks a task as done, merges the task branch to main, and optionally deletes the branch.

**Usage:**
```bash
./scripts/complete-task.sh <task_id> [custom_message]
```

**Example:**
```bash
# Complete task 2 with a custom message
./scripts/complete-task.sh 2 "Complete database setup and migrations"
```

### `commit-subtask.sh`

Commits changes related to a subtask. This script is used by other scripts and generally shouldn't be called directly.

**Usage:**
```bash
./scripts/commit-subtask.sh <task_id> <subtask_id> [custom_message]
```

## Typical Workflow Example

```bash
# 1. Start a new task by creating a branch
./scripts/create-task-branch.sh 2
# Creates a branch like: task-2-set-up-postgresql-database-and-schema

# 2. Work on subtasks one by one
# (make changes to the code for subtask 2.1)
./scripts/complete-subtask.sh 2 1 "Set up Neon PostgreSQL instance"

# (make changes for subtask 2.2)
./scripts/complete-subtask.sh 2 2 "Configure Prisma ORM with environment variables"

# (more subtasks...)

# 3. When all subtasks are done, complete the task
./scripts/complete-task.sh 2 "Complete database setup and migrations"
```

## Dependencies

- These scripts require `jq` for parsing the tasks.json file
- Task Master CLI (`task-master`) must be installed
- Git must be configured with access to the repository

## Installation

If `jq` is not installed, you can install it using:

```bash
# For macOS
brew install jq

# For Ubuntu/Debian
sudo apt-get install jq

# For CentOS/RHEL
sudo yum install jq
```

## Customization

Feel free to modify these scripts according to your workflow needs. Common customizations include:
- Automating PR creation instead of direct merges to main
- Adding code review steps before merges
- Adding notifications for completed tasks or subtasks 