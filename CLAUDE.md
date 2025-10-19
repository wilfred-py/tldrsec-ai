# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plan & Review

### Before starting work
- Always start in plan mode to make a plan. 
- Write a plan to .claude/tasks/TASK_NAME.md.
- The plan should be a detailed implementation plan and the reasoning behind them, as well as tasks broken down into subtasks.
- Review the plan with me.

### While implementing
- You should update the plan as you work. 
- After you complete tasks in the plan, you should update and append detailed descriptions of the changes you made, so following tasks can be easily handed over to other engineers. 

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
- `npm run test:tesla:simple` - Simplified Tesla filing tests
- `npm run test:extraction` - Test content extraction
- `npm run test:extraction:ts` - TypeScript extraction tests
- `npm run test:extraction:simple` - Simplified extraction tests
- `npm run test:extraction:direct` - Direct extraction tests
- `npm run test:onboarding` - Test onboarding flow

### Cron & Background Job Testing
- `npm run test:cron` - Test cron job functionality
- `npm run test:cron-performance` - Performance tests for cron jobs
- `npm run test:cron-endpoint` - Test cron API endpoints
- `npm run test:cron-comprehensive` - **MANDATORY** comprehensive cron integration tests

### End-to-End Testing
- `npm run test:e2e` - **MANDATORY** end-to-end test with email summarization flow

### Enhanced Summarization Testing
- `npm run test:enhanced:performance` - Performance tests for enhanced summaries
- `npm run test:enhanced:integration` - Integration tests for enhanced features
- `npm run test:enhanced:functionality` - Functional tests for enhanced summaries

### Real Pipeline Testing
- `npm run test:pipeline:real` - **Execute real production pipeline** with live API calls, actual database users, SEC filings, and email delivery (10-minute test)
- `npm run test:pipeline:analyze` - Analyze current database state including users, tickers, summaries, budgets, and unprocessed filings

### Parser-Specific Testing
- `npm run test:pdf` - Test PDF parser functionality
- `npm run test:xbrl` - Test XBRL parser functionality

### Build Pipeline Testing
- `npm run test:build` - Test build pipeline
- `npm run test:build:performance` - Build performance tests
- `npm run test:build:integration` - Build integration tests

### Security Testing
- `npm run test:security` - Run security test suite

### Cloudflare Workers Deployment Commands
- `npm run cloudflare:deploy` - Deploy Cloudflare Worker to production
- `npm run cloudflare:deploy:dry-run` - Validate deployment configuration without deploying
- `npm run cloudflare:deploy:tail` - Deploy and start log monitoring
- `npm run cloudflare:logs` - View Cloudflare Worker logs in real-time
- `npm run cloudflare:status` - Check deployment status and list recent deployments

**Manual Commands (run from cloudflare-cron/ directory):**
- `cd cloudflare-cron && npx wrangler deploy` - Deploy worker
- `cd cloudflare-cron && npx wrangler tail --format=pretty` - View logs
- `cd cloudflare-cron && npx wrangler deployments list` - List deployments
- `cd cloudflare-cron && npx wrangler secret put CRON_SECRET` - Set secrets

### Vercel Deployment Commands  
- `vercel` - Deploy to Vercel
- `vercel ls` - List Vercel deployments
- `vercel domain ls` - List custom domains
- `vercel env` - Manage environment variables

### Security Operations
- API key generation and management for secure access
- Security configuration validation and setup
- Environment variable validation for security compliance
- Signature testing for authentication mechanisms
- Security auditing and vulnerability assessment
- Access control validation and authorization testing

## Project Architecture

### Core Framework
- **Next.js 15** with App Router architecture
- **TypeScript** throughout the codebase
- **Prisma ORM** with PostgreSQL (Neon)
- **Clerk** for authentication
- **shadcn/ui** components with Tailwind CSS

### Deployment Architecture

#### Dual-Service Deployment Model
- **Vercel** (Primary): Hosts the web application for users
  - Domain: `https://tldrsec.app`
  - Serves user dashboard, authentication, API endpoints
  - Handles SEC filing summarization pipeline via `/api/cron/tier-aware`
  - Connected to Neon PostgreSQL database
  - Available 24/7 for user interactions

- **Cloudflare Workers** (Cron Only): Executes scheduled SEC filing monitoring
  - Runs on Cloudflare's global edge network every 10 minutes
  - Calls Vercel endpoint: `https://tldrsec.app/api/cron/tier-aware`
  - Lightweight serverless execution model
  - Zero cold start times and global distribution
  - Configured via `wrangler.toml` cron schedule: `*/10 * * * *`

#### Why This Architecture?
- **Separation of Concerns**: Web serving vs scheduled tasks
- **Cost Optimization**: Cloudflare Workers minimal cost for cron execution
- **Global Distribution**: Cloudflare's edge network provides worldwide reliability
- **Performance**: Zero cold starts and millisecond execution times

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
- **MCP Resend Server**: Available at `/mcp-send-email/` with `list-audiences` and `send-email` tools ✅
  - Verified domain: `tldrsec.app`
  - API key validated and functional
  - Built and ready for use

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
- `RESEND_API_KEY` - Email service (validated and working ✅)

### Background Jobs
- Cron jobs for SEC filing monitoring (`/api/cron/`)
- Job queue system with retry logic and dead letter queue
- Processing job status tracking and metrics

## Git Workflow & Pre-Commit Requirements

### Mandatory Pre-Commit Testing

**CRITICAL: Before any commit or deployment, you MUST run the end-to-end test to ensure the complete summarization pipeline is working:**

```bash
npm run test:e2e
```

This test validates:
- ✅ Environment configuration (API keys, database connection)
- ✅ SEC filing retrieval functionality  
- ✅ AI summarization pipeline
- ✅ Email delivery to TEST_EMAIL address

### Environment Setup for Testing

Required environment variables for E2E testing:
- `TEST_EMAIL` - Email address to receive test summaries
- `ANTHROPIC_API_KEY` - Claude AI integration
- `DATABASE_URL` - PostgreSQL connection
- `RESEND_API_KEY` - Email service

### Git Commit Workflow

1. **Complete your code changes**
2. **Run comprehensive tests:**
   ```bash
   npm run lint                    # Code quality
   npm run test                    # Unit tests  
   npm run test:e2e               # End-to-end email test
   npm run test:cron-comprehensive # Cron integration tests
   ```
3. **Verify TEST_EMAIL received summary** - Check your inbox
4. **Only commit if ALL tests pass** - No exceptions
5. **Create commit with descriptive message**

### Pre-Deployment Checklist

- [ ] All linting passes (`npm run lint`)
- [ ] Unit tests pass (`npm run test`)
- [ ] **E2E test passes (`npm run test:e2e`)**
- [ ] **Cron integration tests pass (`npm run test:cron-comprehensive`)**
- [ ] **TEST_EMAIL received summary email**
- [ ] Environment variables are properly configured
- [ ] No sensitive data in commit

### Cloudflare Workers Cron Configuration

**Cloudflare Worker Purpose:** Executes scheduled SEC filing monitoring by calling Vercel endpoint.

**CRITICAL: Cloudflare Worker environment variables required:**

```bash
CRON_SECRET=your_secure_cron_secret_here
PUBLIC_URL=https://tldrsec.app  # Target Vercel endpoint
```

**Cloudflare Worker configuration (wrangler.toml):**
- ✅ Worker script: `cloudflare-cron/index.js`
- ✅ Cron schedule: `*/10 * * * *` (Every 10 minutes)
- ✅ Target endpoint: `https://tldrsec.app/api/cron/tier-aware`
- ✅ Zero cold starts and global edge execution
- ✅ **Build-time database independence**: Worker builds without DATABASE_URL requirement

**⚠️ WARNING: Test E2E pipeline against Vercel before Cloudflare Worker deployment**

#### Build Configuration Notes

The codebase is configured to handle missing `DATABASE_URL` during Cloudflare Worker builds:

1. **Prisma Client**: Gracefully skips initialization during build time when `DATABASE_URL` is unavailable
2. **API Routes**: Use dynamic imports to defer database-dependent modules until runtime
3. **Next.js Config**: Configured for standalone builds outside Vercel environment
4. **Build Process**: Successfully builds even when database is unreachable

This ensures Cloudflare Workers can be deployed independently without database connectivity during the build phase.

### Production Deployment Safety

- E2E test acts as final safety net before production
- Validates entire user-facing workflow end-to-end
- Catches integration issues that unit tests might miss
- Ensures email notifications work for real users
- Add this integration into memory