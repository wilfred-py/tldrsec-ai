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

# Run the development server
npm run dev
```

### Build and Deploy

```bash
# Build for production
npm run build

# Start the production server
npm start
```

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
