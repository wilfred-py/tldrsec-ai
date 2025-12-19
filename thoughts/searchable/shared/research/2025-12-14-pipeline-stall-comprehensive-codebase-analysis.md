---
date: 2025-12-14T21:13:43+11:00
researcher: Claude
git_commit: 45dff63eb4b4a0e07678e37102b6fcbcd01ea39f
branch: main
repository: tldrsec-ai
topic: "SEC Filing Pipeline Stall Analysis - Comprehensive Codebase Documentation"
tags: [research, codebase, pipeline, job-queue, stall, architecture]
status: complete
last_updated: 2025-12-14
last_updated_by: Claude
---

# Research: SEC Filing Pipeline Stall Analysis - Comprehensive Codebase Documentation

**Date**: 2025-12-14T21:13:43+11:00
**Researcher**: Claude
**Git Commit**: 45dff63eb4b4a0e07678e37102b6fcbcd01ea39f
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Document the current state of the SEC filing pipeline system, including how the job queue works, how filing processing flows through discovery/fetch/summarize stages, and how the cron system orchestrates execution.

## Summary

The SEC filing pipeline is a three-phase asynchronous system that discovers SEC filings, fetches their content, and generates AI summaries. The system uses a distributed job queue backed by PostgreSQL, triggered by Cloudflare Workers calling Vercel-hosted API endpoints every 5-10 minutes.

**Current Database State** (from test results):
- 1 filing in SecFiling table (TSLA 10-Q from Jan 15, 2025)
- 12,000+ jobs in JobQueue with massive PENDING backlog
- 12,287 DEAD_LETTER jobs indicating historical failures

## Detailed Findings

### Pipeline Architecture Overview

The pipeline operates as a dual-deployment model:

1. **Cloudflare Workers** (`cloudflare-cron/index.js`)
   - Executes on Cloudflare's edge network every 5 minutes
   - Triggers Vercel endpoints via HTTP
   - Zero cold starts, global distribution
   - Cron schedule: `*/5 * * * *`

2. **Vercel Application** (`https://tldrsec.app`)
   - Hosts the web application and API endpoints
   - Processes jobs via `/api/cron/tier-aware` and `/api/cron/process-filing-queue`
   - Connected to Neon PostgreSQL database

### Three-Phase Pipeline

#### Phase 1: Discovery

**Purpose**: Find new SEC filings for user-tracked tickers

**Files**:
- [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) - Discovery phase handler
- [lib/sec-edgar/rss-parser.ts](lib/sec-edgar/rss-parser.ts) - SEC RSS feed parsing
- [lib/sec-edgar/ticker-monitoring.ts](lib/sec-edgar/ticker-monitoring.ts) - Ticker monitoring logic
- [lib/sec-edgar/client.ts](lib/sec-edgar/client.ts) - SEC EDGAR API client
- [lib/sec-edgar/cik-resolver.ts](lib/sec-edgar/cik-resolver.ts) - Ticker to CIK mapping

**Flow**:
```
Cloudflare Worker calls /api/cron/tier-aware
  -> Creates ASYNC_DISCOVER_FILINGS jobs
  -> Discovery handler queries SEC RSS feeds
  -> New filings saved to SecFiling table
  -> ASYNC_FETCH_FILING jobs created for each filing
```

#### Phase 2: Fetch

**Purpose**: Retrieve filing content from SEC EDGAR

**Files**:
- [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts) - Fetch phase handler
- [services/filings/filingRetrieval.ts](services/filings/filingRetrieval.ts) - Filing content retrieval
- [services/filings/enhancedFilingRetrieval.ts](services/filings/enhancedFilingRetrieval.ts) - Enhanced retrieval with retry logic
- [lib/sec-edgar/filing-storage.ts](lib/sec-edgar/filing-storage.ts) - Filing storage operations
- [services/filings/extractors/documentScraper.ts](services/filings/extractors/documentScraper.ts) - Document scraping

**Flow**:
```
Cloudflare Worker calls /api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING
  -> BackgroundFilingWorker picks up fetch jobs
  -> Content downloaded from SEC EDGAR
  -> Content stored in FilingContentCache table
  -> ASYNC_SUMMARIZE_CACHED jobs created
```

#### Phase 3: Summarize

**Purpose**: Generate AI summaries and deliver via email

**Files**:
- [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts) - Summarization handler
- [lib/ai/summarize.ts](lib/ai/summarize.ts) - Main AI summarization logic
- [lib/ai/summarization/enhanced-summarization-service.ts](lib/ai/summarization/enhanced-summarization-service.ts) - Enhanced summarization
- [services/filing/summaryGenerationService.ts](services/filing/summaryGenerationService.ts) - Summary generation service
- [lib/ai/openrouter-client.ts](lib/ai/openrouter-client.ts) - OpenRouter API client

**Flow**:
```
Cloudflare Worker calls /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
  -> BackgroundFilingWorker picks up summarize jobs
  -> Cached content retrieved from FilingContentCache
  -> AI summary generated via OpenRouter API (Grok model)
  -> Summary saved to Summary table
  -> Email sent via Resend API
  -> User budget updated
```

### Job Queue System

#### Core Components

**Database Model** ([prisma/schema.prisma:146-176](prisma/schema.prisma#L146-L176)):
```prisma
model JobQueue {
  id             String   @id @default(uuid())
  jobType        String
  status         String   @default("PENDING")
  priority       Int      @default(0)
  payload        Json
  idempotencyKey String?  @unique
  scheduledFor   DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  retryCount     Int      @default(0)
  maxRetries     Int      @default(3)
  lastError      String?
  userId         String?
  // ... more fields
}
```

**Status Values**:
- `PENDING` - Job waiting to be processed
- `PROCESSING` - Job currently being executed
- `COMPLETED` - Job successfully finished
- `FAILED` - Job failed (will retry if retryCount < maxRetries)
- `RETRYING` - Job waiting for retry
- `DEAD_LETTER` - Job exceeded max retries or permanently failed

**Job Types**:
- `ASYNC_DISCOVER_FILINGS` - Discovery phase jobs
- `ASYNC_FETCH_FILING` - Fetch phase jobs
- `ASYNC_SUMMARIZE_CACHED` - Summarization phase jobs
- `ASYNC_SUMMARIZE_FILING` - Legacy sync summarization jobs
- `filing_fetch` - Legacy fetch job type

#### Job Queue Service

**File**: [lib/job-queue/index.ts](lib/job-queue/index.ts)

**Key Methods**:
- `addJob()` - Create new job in queue
- `getNextJob()` - Get single job to process
- `getJobsToProcess()` - Get batch of jobs for single type
- `getJobsToProcessMultipleTypes()` - Get batch of jobs for multiple types
- `updateJobStatus()` - Update job status after processing

**Job Selection Query** ([lib/job-queue/index.ts:268-321](lib/job-queue/index.ts#L268-L321)):
```typescript
return await prisma.jobQueue.findMany({
  where: {
    status: { in: ['PENDING', 'RETRYING'] },
    scheduledFor: { lte: now },
    jobType: { in: jobTypes },
    retryCount: { lt: prisma.jobQueue.fields.maxRetries }  // Note: Historical bug location
  },
  orderBy: [
    { priority: 'desc' },
    { scheduledFor: 'asc' },
    { createdAt: 'asc' }
  ],
  take: validatedLimit
});
```

#### Related Job Queue Files

- [lib/job-queue/queue-manager.ts](lib/job-queue/queue-manager.ts) - Queue management utilities
- [lib/job-queue/worker.ts](lib/job-queue/worker.ts) - Worker implementation
- [lib/job-queue/async-filing-processor.ts](lib/job-queue/async-filing-processor.ts) - Async job processor
- [lib/job-queue/lock-service.ts](lib/job-queue/lock-service.ts) - Distributed locking
- [lib/job-queue/dead-letter-queue.ts](lib/job-queue/dead-letter-queue.ts) - Failed job handling
- [lib/job-queue/progress-checkpoint.ts](lib/job-queue/progress-checkpoint.ts) - Progress tracking

### Cron System

#### Cloudflare Worker

**File**: [cloudflare-cron/index.js](cloudflare-cron/index.js)

**Configuration** ([cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml)):
```toml
name = "cloudflare-cron"
[triggers]
crons = ["*/5 * * * *"]
```

**Execution Flow**:
1. Worker triggered every 5 minutes via cron
2. Step 1: POST to `https://tldrsec.app/api/cron/tier-aware` (discovery)
3. Step 2: GET to `https://tldrsec.app/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`
4. Includes circuit breaker and rate limiting logic

#### Vercel API Endpoints

**Tier-Aware Endpoint** ([app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts)):
- Primary cron endpoint for discovery phase
- Authenticates via `CRON_SECRET`
- Implements distributed locking
- Orchestrates user-level processing

**Process Filing Queue** ([app/api/cron/process-filing-queue/route.ts](app/api/cron/process-filing-queue/route.ts)):
- Processes fetch and summarize jobs
- Accepts `jobTypes` query parameter for filtering
- Uses BackgroundFilingWorker for job execution

**Queue Status** ([app/api/cron/queue-status/route.ts](app/api/cron/queue-status/route.ts)):
- Monitoring endpoint for queue health

### Distributed Locking

**File**: [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts)

**Database Model** ([prisma/schema.prisma:194-204](prisma/schema.prisma#L194-L204)):
```prisma
model JobLock {
  id          String   @id @default(uuid())
  lockName    String   @unique
  acquiredBy  String
  acquiredAt  DateTime @default(now())
  expiresAt   DateTime
  refreshedAt DateTime?
  released    Boolean  @default(false)
}
```

**Lock Names Used**:
- `tier-aware-cron-execution-production`
- `tier-aware-cron-execution-development`
- `tier-aware-cron-execution-test`

### AI Integration

**Provider**: OpenRouter (not Anthropic directly)

**Files**:
- [lib/ai/openrouter-client.ts](lib/ai/openrouter-client.ts) - OpenRouter API client
- [lib/ai/config.ts](lib/ai/config.ts) - API key and model configuration
- [lib/ai/enhanced-claude-client.ts](lib/ai/enhanced-claude-client.ts) - Enhanced Claude client

**Models**:
- Primary: `x-ai/grok-4.1-fast` (or `grok-4-fast-reasoning`)
- Fallback: `x-ai/grok-4-fast`

**Environment Variables**:
- `TLDRSEC_AI_SUMMARIZER` - Primary API key
- `OPENROUTER_API_KEY` - Fallback API key
- `DEFAULT_AI_MODEL` - Model selection

### SEC Filing Parsers

**Parser Factory**: [lib/parsers/filing-parser-factory.ts](lib/parsers/filing-parser-factory.ts)

**Supported Formats**:
- [lib/parsers/html-parser.ts](lib/parsers/html-parser.ts) - HTML filing parser
- [lib/parsers/xbrl-parser.ts](lib/parsers/xbrl-parser.ts) - XBRL filing parser
- [lib/parsers/pdf-parser.ts](lib/parsers/pdf-parser.ts) - PDF filing parser

**Form-Specific Parsers**:
- [lib/parsers/filing-types/10k.ts](lib/parsers/filing-types/10k.ts) - 10-K parser
- [lib/parsers/filing-types/10q.ts](lib/parsers/filing-types/10q.ts) - 10-Q parser
- [lib/parsers/filing-types/8k.ts](lib/parsers/filing-types/8k.ts) - 8-K parser
- [lib/parsers/filing-types/form4.ts](lib/parsers/filing-types/form4.ts) - Form 4 parser
- [lib/parsers/filing-types/form144.ts](lib/parsers/filing-types/form144.ts) - Form 144 parser

### Email System

**Provider**: Resend API

**Files**:
- [lib/email/resend-client.ts](lib/email/resend-client.ts) - Resend API client
- [lib/email/summary-service.ts](lib/email/summary-service.ts) - Summary email service
- [lib/email/async-email-queue.ts](lib/email/async-email-queue.ts) - Rate-limited async queue
- [lib/email/notification-service.ts](lib/email/notification-service.ts) - Notification service

**Templates**:
- [components/ui/email/templates/10k-template.tsx](components/ui/email/templates/10k-template.tsx)
- [components/ui/email/templates/10q-template.tsx](components/ui/email/templates/10q-template.tsx)
- [components/ui/email/templates/8k-template.tsx](components/ui/email/templates/8k-template.tsx)
- [components/ui/email/templates/form4-template.tsx](components/ui/email/templates/form4-template.tsx)

### Background Worker

**File**: [lib/cron/background-filing-worker.ts](lib/cron/background-filing-worker.ts)

**Batch Sizes by Job Type**:
- Discovery jobs: 10 (fast, 2-5s each)
- Fetch jobs: 2 (medium, 60-120s each)
- Summarize jobs: 3 (slow, 17-90s each)

**Processing Flow**:
```typescript
for (const jobType of jobTypesToProcess) {
  if (jobs.length > 0) break;
  const batchSize = getBatchSizeForJobType(jobType);
  const typeJobs = await JobQueueService.getJobsToProcessMultipleTypes(batchSize, [jobType]);
  // Process jobs sequentially
}
```

## Code References

### Pipeline Entry Points
- [app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts) - Discovery phase entry
- [app/api/cron/process-filing-queue/route.ts](app/api/cron/process-filing-queue/route.ts) - Fetch/Summarize entry

### Core Services
- [lib/job-queue/index.ts](lib/job-queue/index.ts) - Job queue service
- [lib/cron/background-filing-worker.ts](lib/cron/background-filing-worker.ts) - Background worker
- [lib/db/distributed-lock.ts](lib/db/distributed-lock.ts) - Distributed locking

### Handlers
- [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts) - Discovery
- [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts) - Fetch
- [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts) - Summarize

### Cloudflare Worker
- [cloudflare-cron/index.js](cloudflare-cron/index.js) - Worker script
- [cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml) - Worker configuration

## Architecture Documentation

### Complete Pipeline Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLOUDFLARE WORKERS                                  │
│                    (Every 5 minutes via cron)                               │
│                                                                             │
│  cloudflare-cron/index.js                                                   │
│    ├── Step 1: POST /api/cron/tier-aware                                    │
│    │           └── Discovery phase                                          │
│    └── Step 2: GET /api/cron/process-filing-queue?jobTypes=...              │
│                └── Fetch & Summarize phases                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VERCEL APPLICATION                                  │
│                    (https://tldrsec.app)                                    │
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────┐     │
│  │ /api/cron/tier-aware    │    │ /api/cron/process-filing-queue      │     │
│  │                         │    │                                     │     │
│  │ 1. Authenticate         │    │ 1. Authenticate                     │     │
│  │ 2. Acquire lock         │    │ 2. Filter by jobTypes               │     │
│  │ 3. Create discovery job │    │ 3. BackgroundFilingWorker.process() │     │
│  │ 4. Release lock         │    │ 4. Return results                   │     │
│  └─────────────────────────┘    └─────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          JOB QUEUE (PostgreSQL)                              │
│                                                                             │
│  JobQueue Table                                                             │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │ ASYNC_DISCOVER_FILINGS │ ASYNC_FETCH_FILING │ ASYNC_SUMMARIZE_CACHED │   │
│  │         ↓              │        ↓           │          ↓             │   │
│  │ Query SEC RSS feeds    │ Download from SEC  │ Generate AI summary   │   │
│  │ Create SecFiling rows  │ Store in cache     │ Send email            │   │
│  │ Queue FETCH jobs       │ Queue SUMMARIZE    │ Update budget         │   │
│  └────────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │ SEC EDGAR    │  │ OpenRouter   │  │ Resend API   │                       │
│  │ (RSS/Filing) │  │ (AI Summary) │  │ (Email)      │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Models

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    User        │────>│    Ticker      │────>│   SecFiling    │
│                │     │                │     │                │
│ id             │     │ id             │     │ id             │
│ email          │     │ symbol         │     │ accessionNumber│
│ onboardedAt    │     │ cik            │     │ formType       │
│ tier           │     │ userId         │     │ filingDate     │
└────────────────┘     └────────────────┘     │ tickerId       │
                                              └────────────────┘
                                                     │
                                                     ▼
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   JobQueue     │     │    Summary     │────>│SummaryEmail    │
│                │     │                │     │Delivery        │
│ id             │     │ id             │     │                │
│ jobType        │     │ content        │     │ status         │
│ status         │     │ formType       │     │ sentAt         │
│ priority       │     │ tickerId       │     │ userId         │
│ payload        │     │ secFilingId    │     └────────────────┘
│ retryCount     │     │ createdAt      │
│ maxRetries     │     └────────────────┘
│ scheduledFor   │
│ userId         │
└────────────────┘

┌────────────────┐     ┌────────────────┐
│   JobLock      │     │FilingContent   │
│                │     │Cache           │
│ lockName       │     │                │
│ acquiredBy     │     │ id             │
│ expiresAt      │     │ secFilingId    │
│ released       │     │ content        │
└────────────────┘     │ fetchedAt      │
                       └────────────────┘
```

## Historical Context (from thoughts/)

### Recent Pipeline Investigations

1. **[2025-12-12-pipeline-still-stalled-backlog-not-clearing.md](2025-12-12-pipeline-still-stalled-backlog-not-clearing.md)**
   - Pipeline stalled with 12,000+ PENDING jobs
   - Root cause: Stale distributed locks blocking job selection
   - Production lock expired Dec 7 but not cleaned up

2. **[2025-12-10-pipeline-job-selection-query-analysis.md](2025-12-10-pipeline-job-selection-query-analysis.md)**
   - Critical bug in job selection query
   - `prisma.jobQueue.fields.maxRetries` was a field reference, not value
   - Fixed by switching to raw SQL: `"retryCount" < "maxRetries"`

3. **[2025-12-10-pipeline-summarization-stall.md](2025-12-10-pipeline-summarization-stall.md)**
   - 126 PENDING ASYNC_SUMMARIZE_CACHED jobs
   - Last completion: 2025-11-28
   - Race condition between discovery and fetch/summarize phases

### Key Implementation Plans

- [docs/plans/actioned/2025-12-12-fix-job-selection-prisma-field-reference-bug.md](docs/plans/actioned/2025-12-12-fix-job-selection-prisma-field-reference-bug.md)
- [docs/plans/actioned/2025-12-10-fix-summarization-jobs-blocked-by-fetch-backlog.md](docs/plans/actioned/2025-12-10-fix-summarization-jobs-blocked-by-fetch-backlog.md)
- [docs/plans/actioned/2025-11-21-implement-async-cron-processing.md](docs/plans/actioned/2025-11-21-implement-async-cron-processing.md)

## Related Research

- [2025-12-04-overall-pipeline-flow.md](2025-12-04-overall-pipeline-flow.md) - Overall pipeline flow
- [2025-11-21-e2e-summarization-pipeline-deep-dive.md](2025-11-21-e2e-summarization-pipeline-deep-dive.md) - E2E pipeline deep dive
- [2025-11-24-async-pipeline-failure-root-cause-analysis.md](2025-11-24-async-pipeline-failure-root-cause-analysis.md) - Async pipeline failure analysis

## Open Questions

1. **Current Lock State**: Are there stale locks currently blocking execution?
2. **Job Queue Health**: What is the current distribution of job statuses?
3. **Cloudflare Worker Execution**: Is the worker actually triggering endpoints?
4. **Vercel Function Logs**: Are there errors in recent executions?
5. **Database Integrity**: Why does SecFiling table show only 1 record when verification shows recent discoveries?
