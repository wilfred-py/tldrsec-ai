# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plan & Review

### Before starting work
- Always start in plan mode to make a plan. 
- Write a plan to .claude/tasks/TASK_NAME.md.
- The plan should be a detailed implementation plan and the reasoning behind them, as well as tasks broken down into subtasks.
- Review the plan with me.
- Always list unresolved questions you have at the end of the plan. 
- For any unresolved questions, allow me to answer them before you continue.
- Use concise language to create the final plan for approval by me. 

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

### Route Management
- `npm run routes:enable-dev` - Enable development-essential API routes (system health, processing metrics, companies list/search)
- `npm run routes:disable-non-essential` - Disable non-essential routes for Vercel Hobby plan deployment
- `npm run routes:disable-preserve-dev` - Disable non-essential routes while preserving development routes

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
- `npm run test:pipeline:comprehensive` - **MANDATORY** Comprehensive pipeline validation (CIK, content verification, regression tests)
- `npm run test:pipeline:comprehensive:quick` - Quick comprehensive validation (~25s)

### Daily Verification
- `npm run verify:daily` - **NEW** Verify yesterday's filings completed full pipeline (Discovery → Fetch → Summarize → Email)
- `npm run verify:daily -- --date=2025-11-28` - Verify specific date
- `npm run verify:daily:no-remediation` - Skip auto-remediation for dry-run

### Pipeline Validation Testing
- `npm run test:cik-validation` - Validate CIK mappings for all user-tracked tickers
- `npm run test:content-verification` - Verify SEC content fetched matches filing metadata
- `npm run test:regression:filings` - Known filing regression suite (URL construction, content fetching)
- `npm run test:regression:filings:quick` - Quick regression test (one of each form type)

### Comprehensive Pipeline E2E Testing
- `npm run test:e2e:all-tickers` - **NEW** Full E2E pipeline validation for all user-tracked tickers
  - Dynamically queries all tickers from database
  - Executes complete 3-phase pipeline (Discovery -> Fetch -> Summarize)
  - Validates content metadata accuracy
  - Validates summary quality with AI
  - Sends emails to configured recipients
  - 3-minute timeout per ticker
  - Scales automatically with new tickers
- `npm run test:e2e:all-tickers:verbose` - Verbose output with detailed results table
- `npm run test:e2e:all-tickers:skip-email` - Skip email delivery during testing
- `npm run test:e2e:ticker=SYMBOL` - Test single ticker (e.g., `--ticker=VRT`)

### Parser-Specific Testing
- `npm run test:pdf` - Test PDF parser functionality
- `npm run test:xbrl` - Test XBRL parser functionality

### Build Pipeline Testing
- `npm run test:build` - Test build pipeline
- `npm run test:build:performance` - Build performance tests
- `npm run test:build:integration` - Build integration tests

### Async Email Queue Testing
- `npm run test:async-email-queue` - **NEW** Test async email queue system with rate limiting compliance

### Security Testing
- `npm run test:security` - Run security test suite

### Cloudflare Workers Deployment Commands
- `npm run cloudflare:deploy` - Deploy Cloudflare Worker to production
- `npm run cloudflare:deploy:dry-run` - Validate deployment configuration without deploying
- `npm run cloudflare:deploy:tail` - Deploy and start log monitoring
- `npm run cloudflare:logs` - View Cloudflare Worker logs in real-time
- `npm run cloudflare:status` - Check deployment status and list recent deployments
- `npm run test:cloudflare-integration` - **NEW** Test Cloudflare Worker integration

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

### Health Check Commands
- `curl https://tldrsec.app/api/health/environment` - Check environment variable configuration
- `curl https://tldrsec.app/api/health/pipeline` - **ENHANCED** Check pipeline health with cron gaps, orphaned filings, and recovery state
- `npm run test:e2e` - Verify end-to-end functionality including external services

### Pipeline Recovery Commands
- `curl -H "Authorization: Bearer $CRON_SECRET" https://tldrsec.app/api/cron/auto-recover` - Trigger self-healing auto-recovery
- `curl -H "Authorization: Bearer $CRON_SECRET" https://tldrsec.app/api/cron/tier-aware` - Manually trigger SEC filing pipeline
- See `docs/runbooks/pipeline-stall-recovery.md` for complete recovery procedures

### Context & Workflow Testing
- `npm run test:context-workflow` - **NEW** Test processing context tracking and workflow

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

#### Three-Layer Redundancy Architecture

The pipeline uses a three-layer redundancy system to ensure 100% uptime:

```
Layer 1: Primary Cloudflare Worker (Every 10 min)
    └── Triggers /api/cron/tier-aware
    └── Source: "cloudflare-cron"

Layer 2: Auto-Recovery Endpoint (Every 5 min via CF Worker)
    └── Self-healing: cleanup, orphan recovery, health monitoring
    └── Source: "auto-recover"

Layer 3: Vercel Final Backup (Every 30 min)
    └── Emergency trigger if no executions in 25 minutes
    └── Source: "final-backup"
```

**See**: `docs/runbooks/pipeline-stall-recovery.md` for complete operations guide.

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
- **Redundancy**: Three independent trigger mechanisms ensure uptime

### Key Directory Structure

#### `/app` - Next.js App Router
- `(auth)/` - Authentication pages (sign-in, sign-up, onboarding)
- `(marketing)/` - Public marketing pages
- `api/` - API routes organized by domain
  - `api/monitoring/` - **NEW** Comprehensive monitoring API endpoints
    - `error-alerts/` - Alert management system
    - `health-trends/` - System health tracking
    - `metrics/` - Performance metrics collection
    - `pipeline-health/` - Pipeline status monitoring
- `dashboard/` - Protected user dashboard
- `summary/[id]/` - Individual filing summary pages

#### `/lib` - Core Business Logic
- `ai/` - Claude AI client, prompts, and parsing logic
- `parsers/` - SEC filing parsers for different document types
- `email/` - Email notification services
  - `async-email-queue.ts` - **NEW** Rate-limited async email processing
  - `security-helpers.ts` - **NEW** Email security validation
- `auth/` - Access control and audit logging
- `db/` - Database utilities and connection management
- `cron/` - **ENHANCED** Cron job management with context tracking
  - `bounded-context-manager.ts` - **NEW** Context boundary management
- `monitoring/` - **NEW** Comprehensive monitoring system
  - `alert-service.ts` - Alert creation and management
  - `async-alert-queue.ts` - Asynchronous alert processing
  - `performance-monitor.ts` - Performance tracking
  - `pipeline-error-detector.ts` - Error detection and analysis
- `security/` - **NEW** Enhanced security framework
  - `data-sanitizer.ts` - Data sanitization utilities
  - `rbac.ts` - Role-based access control
  - `secure-logger.ts` - Secure logging implementation
  - `validation-schemas.ts` - Input validation schemas

#### `/services` - Domain Services
- `filing/` - SEC filing retrieval and processing
- `filings/` - Enhanced filing services and extractors
- `company/` - Company data and search services

#### `/components` - React Components
- `auth/` - Authentication components
- `dashboard/` - Dashboard UI components
  - `filing-status-indicator.tsx` - **NEW** Real-time filing status
  - `processing-status.tsx` - **NEW** Processing status display
  - `system-health-banner.tsx` - **NEW** System health notifications
- `summary/` - Filing summary display components
- `ui/` - Reusable shadcn/ui components

### Data Models (Prisma)
- **User** - User accounts with onboarding tracking
- **Ticker** - Companies users track
- **Summary** - AI-generated filing summaries with processing metadata
- **SecFiling** - SEC filing records with fetch attempts
- **JobQueue** - Background job processing system
- **CikMapping** - Company ticker to CIK mappings
- **ErrorAlert** - **NEW** System error tracking and alert management
- **SecurityAuditLog** - **NEW** Security event auditing

### AI Integration
- Claude API integration for SEC filing summarization
- Form-specific prompts (10-K, 10-Q, 8-K, Form 4, etc.)
- Token counting and cost tracking
- Fallback summary generation for errors
- Streaming response support
- **Enhanced Model Validation** - Model configuration validation service

### SEC Filing Processing
- Multi-format parser support (HTML, XBRL, PDF)
- Form-specific extractors for different SEC document types
- Content chunking for large documents
- Error handling and retry mechanisms
- Filing type registry for extensible parser system
- **Enhanced Context Tracking** - Processing context propagation throughout pipeline

### Authentication & Authorization
- Clerk integration with custom user context
- Protected routes and API endpoints
- Onboarding flow with tutorial tracking
- User preference management
- **Enhanced RBAC** - Role-based access control system

### Email System
- Resend integration for transactional emails
- Filing summary email notifications
- Welcome email automation
- Email template system with React components
- **Async Email Queue** - Rate-limited email processing for compliance
- **MCP Resend Server**: Available at `/mcp-send-email/` with `list-audiences` and `send-email` tools ✅
  - Verified domain: `tldrsec.app`
  - API key validated and functional
  - Built and ready for use

### Monitoring & Alerting System
- **Comprehensive Alert Framework** - 10 different alert types
- **Performance Monitoring** - Real-time performance tracking
- **Error Detection** - Automated error pattern recognition
- **Pipeline Health Monitoring** - End-to-end pipeline status tracking
- **Async Alert Processing** - Non-blocking alert queue system
- **Dashboard Integration** - Real-time monitoring dashboards

### Testing Strategy
- Jest with ESM configuration
- React Testing Library for component tests
- Integration tests for critical workflows
- Mock implementations for external services
- Specialized test suites for parsers and AI integration
- **Comprehensive Security Testing** - 73+ security test cases
- **Performance Testing** - Dedicated performance test suites
- **Monitoring Integration Testing** - Alert system validation

### Environment Configuration
Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk auth
- `ANTHROPIC_API_KEY` - Claude AI integration
- `RESEND_API_KEY` - Email service (validated and working ✅)
- **Monitoring Variables** - Alert email recipients and escalation paths

### Slack Pipeline Monitor Configuration (Optional)
For real-time pipeline notifications in Slack:
- `SLACK_WEBHOOK_URL` - Incoming Webhook URL for posting cron results
- `SLACK_ALERTS_WEBHOOK_URL` - (Optional) Separate webhook for critical alerts
- `SLACK_BOT_TOKEN` - Bot User OAuth Token (starts with `xoxb-`) for @mention responses
- `SLACK_SIGNING_SECRET` - Signing secret for verifying incoming Slack events

**Setup Steps:**
1. Create a Slack App at https://api.slack.com/apps
2. Enable Incoming Webhooks and create one for your channel
3. Add Bot Token Scopes: `chat:write`, `app_mentions:read`
4. Install to workspace and copy Bot Token
5. Get Signing Secret from Basic Information page
6. Configure Event Subscriptions URL: `https://tldrsec.app/api/slack/events`
7. Add environment variables to Vercel: `vercel env add SLACK_WEBHOOK_URL production preview development`

### Background Jobs
- Cron jobs for SEC filing monitoring (`/api/cron/`)
- Job queue system with retry logic and dead letter queue
- Processing job status tracking and metrics
- **Enhanced Lock Management** - Environment-specific distributed locking
- **Context Propagation** - Processing context tracking across jobs

## Git Workflow & Pre-Commit Requirements

### Mandatory Pre-Commit Testing

**CRITICAL: Before any commit or deployment, you MUST run the comprehensive pipeline validation and end-to-end tests:**

```bash
npm run test:pipeline:comprehensive  # Pipeline validation (~25s)
npm run test:e2e                      # E2E email test
```

The comprehensive pipeline test validates:
- ✅ CIK mappings for all 13 user-tracked tickers
- ✅ Content verification against SEC metadata (100% confidence)
- ✅ Known filing regression suite (URL construction, content fetching)

The E2E test validates:
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
   npm run lint                           # Code quality
   npm run test                           # Unit tests
   npm run test:pipeline:comprehensive    # Pipeline validation (CIK, content, regression)
   npm run test:e2e                       # End-to-end email test
   npm run test:cron-comprehensive        # Cron integration tests
   ```
3. **Verify TEST_EMAIL received summary** - Check your inbox
4. **Only commit if ALL tests pass** - No exceptions
5. **Create commit with descriptive message**

### Pre-Deployment Checklist

- [ ] All linting passes (`npm run lint`)
- [ ] Unit tests pass (`npm run test`)
- [ ] **Pipeline comprehensive test passes (`npm run test:pipeline:comprehensive`)**
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

## Known Issues and Solutions

### Production Issues Resolved (2025-11-14)

#### Issue: Waitlist form working in dev but not prod
- **Symptom**: 401 errors on page_analytics insert, 500 errors on newsletter subscribe
- **Root Cause**: RLS policies blocking client-side access, missing environment variables
- **Solution**: Updated RLS policies, verified Vercel environment configuration
- **Verification**: Run `npm run test:production-waitlist`
- **Documentation**: See [docs/plans/2025-11-14-fix-waitlist-production-errors.md](docs/plans/2025-11-14-fix-waitlist-production-errors.md)

## Recent Updates (Updated: 2025-10-25)

### Major Features Added
- **🚨 Comprehensive Alert System**: Full implementation with 10 alert types, async processing, and dashboard integration
- **📊 Advanced Monitoring**: Pipeline health monitoring, performance tracking, and error pattern detection
- **🔒 Enhanced Security Framework**: RBAC, secure logging, data sanitization, and comprehensive security testing
- **⚡ Async Email Queue**: Rate-limited email processing for compliance and performance optimization
- **📈 Processing Context Tracking**: Enhanced context propagation throughout the filing pipeline

### Critical Bug Fixes
- **Duplicate Export Resolution**: Fixed ValidationUtils duplicate export blocking build compilation
- **Prisma Import Corrections**: Updated monitoring API routes to use proper Prisma client imports
- **Pipeline Error Recovery**: Enhanced error handling for SEC filing retrieval and processing
- **Lock Management**: Environment-specific distributed locking with proper cleanup

### API Enhancements
- **New Monitoring Endpoints**: `/api/monitoring/error-alerts`, `/api/monitoring/health-trends`, `/api/monitoring/metrics`, `/api/monitoring/pipeline-health`
- **Enhanced Cron Endpoint**: Improved lock management and error handling in `/api/cron/tier-aware`
- **Security Dashboards**: New admin security and monitoring dashboards

### Testing Infrastructure
- **98.6% Security Test Coverage**: 73 out of 74 security tests passing
- **Comprehensive Integration Tests**: Alert system, monitoring, and performance testing
- **Enhanced E2E Validation**: Improved end-to-end testing with context workflow validation

### Performance Optimizations
- **Bounded Context Management**: Efficient context boundary handling for large-scale processing
- **Async Alert Processing**: Non-blocking alert queue system
- **Memory Management**: Enhanced memory monitoring and cleanup

### Documentation & Analysis
- **Cloudflare Worker Analysis**: Comprehensive deployment gap assessment and recommendations
- **Performance Analysis**: Detailed performance impact analysis for alert system implementation
- **Security Analysis**: Complete security framework documentation and validation reports

## Important Notes

### Breaking Changes
- **Prisma Client Access**: Monitoring API routes now use `getPrismaClient()` instead of direct `prisma` imports
- **Alert System Integration**: New database schema for ErrorAlert and SecurityAuditLog models

### Development Priorities
1. **Security First**: All new features include comprehensive security testing
2. **Performance Monitoring**: Real-time performance tracking is now integral to the system
3. **Context Preservation**: Processing context must be maintained throughout all pipeline operations
4. **Alert Management**: Proactive error detection and alerting is now core functionality

### Deployment Considerations
- **Cloudflare Worker Updates**: Worker deployment should be coordinated with Vercel deployments
- **Database Migrations**: New alert and security audit tables require migration
- **Environment Variables**: Additional monitoring configuration variables required for full functionality