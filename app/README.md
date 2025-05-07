# tldrSEC - AI-Powered SEC Filings Summarizer

tldrSEC is a web application that automatically monitors, parses, and summarizes SEC filings using AI. It delivers concise, actionable insights directly to users, enabling them to make informed investment decisions without the time-consuming process of reading entire documents.

## Features

- **Automated SEC Filing Monitoring**: Hourly checks for new filings from tracked companies
- **AI-Powered Summarization**: Transforms lengthy, complex documents into actionable insights
- **Email Notifications**: Delivers summaries based on user preferences (immediate or digest)
- **User Dashboard**: Central hub for managing tracked companies and accessing summaries
- **Secure Authentication**: OAuth sign-in with Google, GitHub, and Twitter

## Technology Stack

- **Frontend**: Next.js with TypeScript and Tailwind CSS
- **UI Components**: shadcn/ui
- **Authentication**: Clerk
- **Database**: PostgreSQL (Neon)
- **AI**: Anthropic's Claude API
- **Email**: Resend

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Clerk account for authentication
- Neon PostgreSQL database
- Anthropic Claude API key
- Resend API key

### Environment Setup

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in the values:
   ```
   # Clerk Authentication
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key
   CLERK_SECRET_KEY=your_secret_key
   
   # Clerk URL configurations
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
   ```

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Push database schema (development only)
npm run prisma:push

# Seed the database with initial data
npm run db:seed
```

Or you can run the setup script that combines generate and push:

```bash
npm run db:setup
```

### Development Server

```bash
npm run dev
```

### Common Issues

#### Database Connection Issues

If you encounter the error "The table 'public.users' does not exist in the current database":

1. Make sure your database is running and accessible
2. Verify your `.env` file has the correct `DATABASE_URL` 
3. Run `npm run prisma:push` to create the database tables
4. Verify the database connection with `npx prisma db pull --schema=./prisma/schema.prisma`

#### Client Component Metadata

In Next.js App Router, you cannot export metadata from a Client Component (one marked with "use client").
Instead, create a separate layout.tsx file to handle metadata for that route.

```tsx
// layout.tsx - Server Component
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title',
  description: 'Page description',
};

export default function Layout({ children }) {
  return children;
}
```

#### Working with Prisma

Always run Prisma commands from the `app` directory, and always specify the schema path:

```bash
cd app
npx prisma db push --schema=./prisma/schema.prisma
```

See the [Prisma documentation](app/prisma/README.md) for more details.

## Project Structure

```
app/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── dashboard/         # Protected dashboard pages
│   │   ├── sign-in/           # Authentication pages
│   │   ├── sign-up/           # Authentication pages
│   │   ├── globals.css        # Global CSS
│   │   ├── layout.tsx         # Root layout with ClerkProvider
│   │   └── page.tsx           # Home page
│   ├── components/            # Reusable components
│   │   └── ui/                # shadcn/ui components
│   ├── lib/                   # Utility functions
│   └── middleware.ts          # Clerk authentication middleware
├── public/                    # Static files
├── .env.example               # Example environment variables
├── .env.local                 # Local environment variables (gitignored)
├── next.config.ts             # Next.js configuration
├── package.json               # Dependencies
└── tailwind.config.ts         # Tailwind CSS configuration
```

## License

This project is licensed under the MIT License.

## Authentication and User Registration

### Setting Up Clerk Authentication

To ensure that users are registered in the database when they sign in (especially with OAuth providers), you need to set up Clerk webhooks correctly.

1. **Create Clerk Account**: Sign up and create a project at [clerk.com](https://clerk.com)

2. **Configure Environment Variables**: Copy the keys from your Clerk dashboard to `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

3. **Configure OAuth Providers** (optional): In the Clerk dashboard, set up any OAuth providers you want to use (Google, GitHub, etc.)

4. **Set Up Webhooks**:
   - In your Clerk dashboard, go to "Webhooks"
   - Create a new webhook endpoint
   - URL: `https://your-domain.com/api/webhook/clerk` (or `http://localhost:3000/api/webhook/clerk` for local development)
   - Events to subscribe to:
     - `user.created`
     - `user.updated`
   - Get your webhook secret and add it to `.env.local`:
     ```
     CLERK_WEBHOOK_SECRET=whsec_...
     ```

5. **Test the Integration**:
   - Start your development server with `npm run dev`
   - Sign in with your OAuth provider or create a new account
   - Check that the user is created in the database (you can use `npx prisma studio` to view the database)

### Troubleshooting Authentication

If users are not being registered in the database:

1. **Check the Server Logs**: Look for webhook errors or user creation failures
   
2. **Verify Webhook Setup**:
   - Confirm the webhook URL is correct and accessible
   - Check that the webhook secret is correctly set in your environment
   - Verify in Clerk dashboard that webhooks are being delivered successfully

3. **Test Both Authentication Methods**:
   - The app uses a dual-approach for user registration:
     - Webhooks: Server-side events from Clerk
     - Client-side sync: Runs when a user signs in via the browser
   - Make sure both approaches are working

4. **Check CSP Settings**:
   - Ensure your Content Security Policy allows connections to Clerk domains:
   ```
   connect-src 'self' https://*.clerk.accounts.dev https://clerk.xyz ...
   ```

### Authentication Debugging Tools

This application includes several tools to help diagnose authentication issues, especially when users are not being registered in the database properly after OAuth sign-in:

#### 1. Admin Debug Page

The easiest way to debug auth issues is to visit the admin debug page while signed in:

```
/dashboard/admin/auth
```

This page displays:
- Your Clerk user information
- Your database user information (if it exists)
- Sync status between Clerk and the database
- A manual sync button to force synchronization

#### 2. Debug API Endpoint

You can also access the raw auth debug data through an API endpoint:

```
/api/debug/auth
```

The endpoint will return a JSON response with:
- Authentication status
- Clerk user details
- Database user details (if found)
- Sync status between Clerk and your database
- Recommended next steps for troubleshooting

Example response:

```json
{
  "authenticated": true,
  "clerkUser": {
    "id": "user_2JCo3g...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "imageUrl": "https://img.clerk.com/...",
    "oauthProviders": ["google"]
  },
  "databaseUser": null,
  "syncStatus": "not_synchronized",
  "nextSteps": [
    "Trigger sync by visiting /api/auth/sync-user",
    "Verify webhook configuration",
    "Check database connection and permissions"
  ]
}
```

> **Important**: These debug endpoints should be disabled or removed in production environments.
