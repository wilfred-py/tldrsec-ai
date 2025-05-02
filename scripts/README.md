# Task Automation Scripts

This directory contains automation scripts for managing task completion and GitHub integration in the SECInsightAI project.

## Available Scripts

### `complete-subtask.sh`

Marks a subtask as done and commits the changes to GitHub.

**Usage:**
```bash
./scripts/complete-subtask.sh <task_id> <subtask_id> [custom_commit_message]
```

**Example:**
```bash
# Mark subtask 2.3 as done and commit with default message
./scripts/complete-subtask.sh 2 3

# Mark subtask 2.3 as done with a custom commit message
./scripts/complete-subtask.sh 2 3 "Implement database schema with foreign key constraints"
```

### `commit-subtask.sh`

Commits changes related to a subtask to GitHub. This script is used by `complete-subtask.sh` but can also be used independently.

**Usage:**
```bash
./scripts/commit-subtask.sh <task_id> <subtask_id> [custom_message]
```

**Example:**
```bash
# Commit changes for subtask 2.3 with default message
./scripts/commit-subtask.sh 2 3

# Commit changes for subtask 2.3 with a custom message
./scripts/commit-subtask.sh 2 3 "Fix validation logic in database schema"
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
- Adding additional checks before committing
- Implementing automatic PR creation
- Adding notifications for completed tasks 