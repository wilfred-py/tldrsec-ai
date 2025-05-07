# Prisma Database Setup and Management

This document provides instructions for setting up and managing the database for the SECInsightAI project.

## Environment Setup

1. Ensure your database connection string is correctly set up in `.env`
2. The connection string should be in the format:
```
DATABASE_URL="postgresql://username:password@hostname:port/database?sslmode=require"
```

## Available Commands

Run these commands from the `app` directory:

```bash
# Generate Prisma client
npm run prisma:generate

# Create and apply database migrations
npm run prisma:migrate

# Push schema changes to database (dev only)
npm run prisma:push

# Open Prisma Studio
npm run prisma:studio

# Seed the database with initial data
npm run db:seed
```

## Database Schema Overview

- **User**: Represents application users with authentication details and preferences
- **Ticker**: Represents stock ticker symbols tracked by users
- **Summary**: Stores SEC filing summaries for tracked tickers

## Troubleshooting Common Issues

### Database Connection Errors

If you encounter database connection errors:

1. **Check your database URL**: Verify the connection string in `.env` is correct
2. **Verify database exists**: Ensure the database has been created
3. **Network access**: Ensure your IP is allowed to access the database
4. **Credentials**: Verify username and password are correct
5. **SSL requirements**: For cloud databases, make sure to include `?sslmode=require`

### "Table Does Not Exist" Errors

If you encounter errors about missing tables:

1. **Run database push**: Execute `npm run prisma:push` to create the tables
2. **Check schema**: Ensure your schema matches the database configuration
3. **Verify database name**: Make sure you're connecting to the correct database
4. **Check permissions**: Ensure your database user has permission to create tables
5. **Correct schema**: For PostgreSQL, verify you're using the correct schema (usually "public")

### Full Reset (Development Only)

If you need to completely reset your database:

```bash
# Drop all tables and recreate them
npm run prisma:reset

# Push schema changes
npm run prisma:push

# Seed with fresh data
npm run db:seed
```

## Database Connection Verification

To verify your database connection:

```typescript
import { PrismaClient } from '@prisma/client';

async function verifyConnection() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

verifyConnection();
```

## Production Environment

For production environments:

1. Use a managed database service like Neon, Supabase, or AWS RDS
2. Configure proper security, including:
   - Strong passwords
   - SSL encryption
   - IP restrictions
   - Regular backups
3. Use proper migrations instead of direct schema pushes

## Next Steps

After database setup:

1. Create or update your database migrations
2. Add seed data for development
3. Set up proper error handling and connection pooling

## Database Environment Variables

### About Environment Files Priority

In a Next.js application, environment variables are loaded with the following priority:

1. `.env.$(NODE_ENV).local`
2. `.env.local`
3. `.env.$(NODE_ENV)`
4. `.env`

When multiple environment files define the same variable (like `DATABASE_URL`), only the value from the highest priority file will be used.

### Common Environment Issues

- **Multiple DATABASE_URL definitions**: If you have `DATABASE_URL` in both `.env` and `.env.local`, the one in `.env.local` will be used.
- **Different databases for development/production**: Use separate environment files (`.env.development.local` and `.env.production.local`) for different environments.

### Verifying Which Database You're Connected To

To verify which database your application is connecting to, look for the following log message on startup:

```
Connecting to database: [database-name]
```

If you need to switch databases, update the appropriate environment file and restart the application. 