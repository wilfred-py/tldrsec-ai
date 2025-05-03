# tldrsec-ai

tldrSEC is a web application that automatically monitors, parses, and summarizes SEC filings using AI. It delivers concise, actionable insights directly to users, enabling them to make informed investment decisions without the time-consuming process of reading entire documents.

## GitHub Repository

This project is hosted on GitHub. You can clone it using one of the following methods:

```bash
# Using HTTPS
git clone https://github.com/wilfred-py/tldrsec-ai.git

# Using GitHub CLI
gh repo clone wilfred-py/tldrsec-ai

# Using SSH (requires SSH key setup)
git clone git@github.com:wilfred-py/tldrsec-ai.git
```

## Task Management & Automation

This project uses Task Master for task management and implements a branch-based Git workflow:

1. Each task gets its own feature branch with descriptive name based on task title
2. Subtasks are completed on the task branch
3. When a task is complete, the branch is merged to main
4. The task branch is deleted after completion

### Branch Naming Convention

Branches follow this naming convention:
- Task branches: `task-<task_id>-<task-title-slug>`
- Example: `task-2-set-up-postgresql-database-and-schema`

### Workflow Scripts

```bash
# 1. Start a new task
./scripts/create-task-branch.sh <task_id>

# 2. Complete a subtask
./scripts/complete-subtask.sh <task_id> <subtask_id> [custom_message]

# 3. Complete a task when all subtasks are done
./scripts/complete-task.sh <task_id> [custom_message]
```

For example, to work on Task 2 (Database Setup):

```bash
# Create branch for task 2
./scripts/create-task-branch.sh 2

# Complete subtask 2.3 (Database schema)
./scripts/complete-subtask.sh 2 3 "Implement schema with foreign key relationships"

# When all subtasks are done, complete the task
./scripts/complete-task.sh 2 "Complete database setup and migrations"
```

For more information about the automation scripts, see [scripts/README.md](scripts/README.md).

## Database Management

This project uses Prisma ORM with PostgreSQL. All database-related files are in the `app` directory:

- Prisma schema: `app/prisma/schema.prisma`
- Database seed: `app/prisma/seed.ts`
- Database API utilities: `app/src/lib/api/`

### Important: Running Database Commands

All database commands must be run from the `app` directory, not the project root:

```bash
# Navigate to app directory first
cd app

# Then run database commands
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio
npm run db:seed          # Seed the database
```

## Troubleshooting

### Database Command Errors

- **Error: "Missing script: 'prisma:push'"**
  
  This occurs when running database commands from the project root instead of the app directory.
  
  Solution:
  ```bash
  cd app
  npm run prisma:push  # Now it will work
  ```

- **Error: "Cannot find module '@prisma/client'"**
  
  This usually means the Prisma client hasn't been generated yet.
  
  Solution:
  ```bash
  cd app
  npm run prisma:generate
  ```

- **Error: "Unknown file extension '.ts'"**
  
  This occurs when there's an issue with TypeScript execution in ESM mode.
  
  Solution:
  ```bash
  # Install tsx for better TypeScript ESM support
  cd app
  npm install --save-dev tsx
  
  # Update the db:seed script in package.json
  # "db:seed": "npx tsx prisma/seed.ts"
  ```

- **Error: "Can't reach database server"**
  
  This means your database connection isn't properly configured or the database isn't accessible.
  
  Solution:
  ```bash
  # Check your .env or .env.local file for the correct DATABASE_URL
  # For Neon database, ensure you have the proper credentials and ?sslmode=require
  ```
