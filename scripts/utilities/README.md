# Utility Scripts

This directory contains utility scripts that assist with project development and management.

## Available Scripts

- **create-task-branch.sh**: Shell script to create a new git branch for a specified task

## Using the Scripts

### create-task-branch.sh

This script helps create a git branch named after a task with the proper structure.

```bash
# Usage
./scripts/utilities/create-task-branch.sh <task-number> "<task-description>"

# Example
./scripts/utilities/create-task-branch.sh 4.5 "Document Chunking for Large Filings"
# Creates branch: task-4.5-document-chunking-for-large-filings
``` 