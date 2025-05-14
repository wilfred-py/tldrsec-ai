# tldrSEC-AI

tldrSEC is a web application designed to solve a critical problem for retail investors: the lack of time and expertise to analyze lengthy SEC filings. These documents (10-K, 10-Q, 8-K, Form 4) often span hundreds of pages and contain vital financial and operational insights buried in complex language and formats.

## Features

- **Track Companies**: Monitor SEC filings for your favorite company tickers
- **AI-Powered Summaries**: Get concise, digestible summaries of complex SEC filings
- **Email Notifications**: Receive alerts when new filings are available
- **User Authentication**: Secure access to your personalized dashboard
- **Responsive Design**: Access from any device

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Authentication**: Clerk
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

### Clerk Authentication

Sign up for a Clerk account at [dashboard.clerk.com](https://dashboard.clerk.com/) and create a new application. Then add the following to your `.env.local` file:

```
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_WEBHOOK_SECRET=your_clerk_webhook_secret

# Clerk URL Configuration
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Neon PostgreSQL Database

1. Sign up for a Neon account at [console.neon.tech](https://console.neon.tech/)
2. Create a new project
3. In the project dashboard, find your connection string under "Connection Details"
4. Add the connection string to your `.env.local` file:

```
# Neon PostgreSQL Database
DATABASE_URL=postgresql://user:password@hostname:port/database?sslmode=require
```

Example of a real connection string:
```
DATABASE_URL=postgresql://john:mypassword@ep-cool-snow-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### Application URLs

```
# App URL for webhooks in development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database Setup

After setting up your environment variables, run the following commands to initialize your database:

```bash
# Generate Prisma client
npm run db:generate

# Create database tables (first time only)
npm run db:migrate -- --name init

# Test database connection
npm run db:test

# Open Prisma Studio to view/edit data
npm run db:studio
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
