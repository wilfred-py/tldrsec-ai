# Database Setup and Management

This project uses PostgreSQL with Prisma ORM to manage the database.

## Database Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create or update the `.env` file with your PostgreSQL connection string:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/secinsight?schema=public"
   ```

   For production, use a secure connection string from your database provider.

3. **Generate Prisma Client**:
   ```bash
   npm run prisma:generate
   ```

4. **Run database migrations**:
   ```bash
   npm run prisma:migrate
   ```

5. **Seed the database** (optional):
   ```bash
   npm run db:seed
   ```

## Database Management

- **View and manage data**:
  ```bash
  npm run prisma:studio
  ```

- **Create a new migration** after schema changes:
  ```bash
  npm run prisma:migrate
  ```

## Database Schema

The database schema includes the following models:

1. **User** - Application users with authentication details
   - Fields: id, email, name, authProvider, authProviderId, etc.

2. **Ticker** - Stock tickers that users are tracking
   - Fields: id, symbol, companyName, userId, etc.

3. **Summary** - SEC filing summaries for tracked tickers
   - Fields: id, tickerId, filingType, filingDate, summaryText, etc.

## API Utilities

The database API utilities are located in `src/lib/api/` and include:

- `users.ts` - Functions for user management
- `tickers.ts` - Functions for ticker and summary management

These utilities provide type-safe access to the database and should be used for all data operations. 