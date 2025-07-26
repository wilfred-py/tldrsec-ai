# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start Next.js development server
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run Jest tests with ESM configuration
- `npm run test:watch` - Run tests in watch mode

### Database Operations
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Prisma Studio
- `npm run db:test` - Test database connection

### Specialized Testing
- `npm run test:parsers` - Run SEC filing parser tests
- `npm run test:tesla` - Test Tesla filing parsing
- `npm run test:extraction` - Test content extraction
- `npm run test:onboarding` - Test onboarding flow

## Project Architecture

### Core Framework
- **Next.js 15** with App Router architecture
- **TypeScript** throughout the codebase
- **Prisma ORM** with PostgreSQL (Neon)
- **Clerk** for authentication
- **shadcn/ui** components with Tailwind CSS

### Key Directory Structure

#### `/app` - Next.js App Router
- `(auth)/` - Authentication pages (sign-in, sign-up, onboarding)
- `(marketing)/` - Public marketing pages
- `api/` - API routes organized by domain
- `dashboard/` - Protected user dashboard
- `summary/[id]/` - Individual filing summary pages

#### `/lib` - Core Business Logic
- `ai/` - Claude AI client, prompts, and parsing logic
- `parsers/` - SEC filing parsers for different document types
- `email/` - Email notification services
- `auth/` - Access control and audit logging
- `db/` - Database utilities and connection management

#### `/services` - Domain Services
- `filing/` - SEC filing retrieval and processing
- `filings/` - Enhanced filing services and extractors
- `company/` - Company data and search services

#### `/components` - React Components
- `auth/` - Authentication components
- `dashboard/` - Dashboard UI components
- `summary/` - Filing summary display components
- `ui/` - Reusable shadcn/ui components

### Data Models (Prisma)
- **User** - User accounts with onboarding tracking
- **Ticker** - Companies users track
- **Summary** - AI-generated filing summaries with processing metadata
- **SecFiling** - SEC filing records with fetch attempts
- **JobQueue** - Background job processing system
- **CikMapping** - Company ticker to CIK mappings

### AI Integration
- Claude API integration for SEC filing summarization
- Form-specific prompts (10-K, 10-Q, 8-K, Form 4, etc.)
- Token counting and cost tracking
- Fallback summary generation for errors
- Streaming response support

### SEC Filing Processing
- Multi-format parser support (HTML, XBRL, PDF)
- Form-specific extractors for different SEC document types
- Content chunking for large documents
- Error handling and retry mechanisms
- Filing type registry for extensible parser system

### Authentication & Authorization
- Clerk integration with custom user context
- Protected routes and API endpoints
- Onboarding flow with tutorial tracking
- User preference management

### Email System
- Resend integration for transactional emails
- Filing summary email notifications
- Welcome email automation
- Email template system with React components

### Testing Strategy
- Jest with ESM configuration
- React Testing Library for component tests
- Integration tests for critical workflows
- Mock implementations for external services
- Specialized test suites for parsers and AI integration

### Environment Configuration
Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk auth
- `ANTHROPIC_API_KEY` - Claude AI integration
- `RESEND_API_KEY` - Email service

### Background Jobs
- Cron jobs for SEC filing monitoring (`/api/cron/`)
- Job queue system with retry logic and dead letter queue
- Processing job status tracking and metrics