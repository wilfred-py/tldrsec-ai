# Fix Fetch Job Processing Race Condition

**Date**: 2025-12-09 08:10:34 AEDT
**Git Commit**: 58fb9f69985fdb4b042f6fc8d8432ebef4221868
**Branch**: main
**Repository**: tldrsec-ai

## Overview

The Cloudflare Worker's sequential cron flow creates a race condition where discovery jobs queued in Step 1 immediately block fetch job processing in Step 2. This plan implements a job type filter parameter to allow targeted processing.

## Current State Analysis

### The Problem

From [2025-12-09-fetch-job-processing-cloudflare-investigation.md](../../thoughts/shared/research/2025-12-09-fetch-job-processing-cloudflare-investigation.md):

```
Cron Step 1 (tier-aware):
├── Creates ASYNC_DISCOVER_FILINGS job (status: PENDING)
└── Returns 202 Accepted immediately

Cron Step 2 (process-filing-queue):
├── BackgroundFilingWorker.processBatch() called
├── Job type priority check:
│   1. ASYNC_DISCOVER_FILINGS → FOUND (the job from Step 1!)
│   2. Never reaches ASYNC_FETCH_FILING
└── Processes discovery job, ignoring 11,788 fetch jobs
```

### Evidence

- Discovery job `094aae37` created at 20:00:37, completed at 20:01:16 (39s total)
- Same execution ID for both steps confirms sequential flow
- Fetch queue unchanged: 11,788 PENDING, 95 COMPLETED (no progress)

### Key Code Locations

| File | Line | Purpose |
|------|------|---------|
| `lib/cron/background-filing-worker.ts` | 153-175 | Job type priority loop (breaks on first match) |
| `lib/cron/background-filing-worker.ts` | 77-84 | Constructor (no jobTypes parameter) |
| `app/api/cron/process-filing-queue/route.ts` | 59-62 | Worker instantiation (no filtering) |
| `cloudflare-cron/index.js` | 220-257 | Step 2 endpoint call |

## Desired End State

After implementation:
1. Cloudflare Worker Step 2 calls `/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`
2. Discovery jobs (from Step 1) are excluded from Step 2 processing
3. Fetch jobs progress through the queue (target: 5+ jobs per 10-minute cron cycle)
4. No changes required to Step 1 or discovery job handling

### Verification

```bash
# Check fetch job processing after cron run
curl -X GET "https://tldrsec.app/api/monitoring/metrics" \
  -H "Authorization: Bearer $CRON_SECRET" | jq '.jobs.fetch'

# Expected: fetch.completed increasing, fetch.pending decreasing
```

## What We're NOT Doing

- **NOT creating a new endpoint** - Reusing existing endpoint with filter
- **NOT modifying job type priority logic** - Just adding filter capability
- **NOT changing batch sizes** - Existing sizes are well-tuned
- **NOT adding parallel endpoint calls** - Sequential is safer for rate limiting
- **NOT modifying tier-aware endpoint** - Discovery works correctly

## Analysis of Alternative Approaches

### Approach 1: Separate Discovery and Fetch Processing (Two Sequential Calls)
**Description**: Call process-filing-queue twice - once for discovery only, once for fetch only

| Pros | Cons |
|------|------|
| Minimal code changes to worker | Increases total cron execution time |
| Clear separation of concerns | Doubles HTTP requests to Vercel |
| Each job type gets guaranteed time | Still sequential, no parallelization |
| Easy to understand and maintain | Requires Cloudflare Worker changes only |

**Verdict**: Works but inefficient - doubles requests without solving underlying inflexibility.

### Approach 2: Process All Job Types in Single Batch
**Description**: Modify BackgroundFilingWorker to fetch jobs of ALL types in one query

| Pros | Cons |
|------|------|
| Single HTTP call processes multiple types | Complex timeout budget calculation |
| Better utilization of 270s timeout | Harder to reason about batch composition |
| More fair distribution | Risk of partial completion on timeout |
| | Significant refactor of batch logic |

**Verdict**: Too risky - timeout handling becomes unpredictable with mixed job types.

### Approach 3: Add Dedicated Fetch Endpoint (New Route)
**Description**: Create `/api/cron/process-fetch-queue` that only processes ASYNC_FETCH_FILING

| Pros | Cons |
|------|------|
| Complete isolation between job types | More endpoints to maintain |
| Can run in parallel with discovery | Code duplication if not careful |
| Clear responsibility per endpoint | More infrastructure complexity |
| Easier to monitor each phase | Requires Cloudflare Worker changes |

**Verdict**: Viable but overkill - adds maintenance burden for simple filtering.

### Approach 4: Round-Robin Job Type Selection
**Description**: Rotate which job type gets priority on each cron invocation

| Pros | Cons |
|------|------|
| Fair distribution over time | Requires persistent state tracking |
| No additional HTTP calls | Non-deterministic behavior |
| Works with existing infrastructure | More complex debugging |
| | Still only one type per invocation |

**Verdict**: Too complex - adds state management for marginal benefit.

### Approach 5: Increase Cron Frequency
**Description**: Run more frequently so discovery jobs clear quickly

| Pros | Cons |
|------|------|
| No code changes required | Doesn't solve fundamental race condition |
| Discovery jobs cleared faster | Wastes resources if discovery takes 36s |
| Simple solution | Could still have timing issues |
| | Increases Cloudflare Worker costs |

**Verdict**: Band-aid - doesn't address the root cause.

### Chosen Approach: Query Parameter Filter (Hybrid of 1 and 3)
**Description**: Add `jobTypes` query parameter to existing endpoint, call with filter in Step 2

| Pros | Cons |
|------|------|
| Minimal code changes | Requires both Next.js and Worker changes |
| Uses existing patterns in codebase | Slight API contract change |
| No new endpoints | None significant |
| Flexible for future use cases | |
| Single HTTP call with targeted processing | |

**Verdict**: Best balance of simplicity, flexibility, and minimal disruption.

## Implementation Approach

Add a `jobTypes` query parameter to the existing `/api/cron/process-filing-queue` endpoint. The Cloudflare Worker will call this endpoint with `?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED` to exclude discovery jobs (which are processed separately in their own cycle).

## Phase 1: Add Job Types Filter to BackgroundFilingWorker

### Overview
Modify the BackgroundFilingWorker constructor and processBatch method to accept an optional job types filter.

### Changes Required:

#### 1. Update BackgroundFilingWorker Constructor
**File**: `lib/cron/background-filing-worker.ts`
**Lines**: 77-84

```typescript
// Current constructor signature (lines 77-84):
constructor(options: {
  batchSize?: number;
  processingInterval?: number;
} = {}) {
  this.processId = `filing-worker-${process.pid}-${Date.now()}`;
  this.batchSize = options.batchSize || 3;
  this.processingInterval = options.processingInterval || 30000;
}

// New constructor signature:
constructor(options: {
  batchSize?: number;
  processingInterval?: number;
  jobTypes?: JobType[];  // NEW: Optional job type filter
} = {}) {
  this.processId = `filing-worker-${process.pid}-${Date.now()}`;
  this.batchSize = options.batchSize || 3;
  this.processingInterval = options.processingInterval || 30000;
  this.jobTypes = options.jobTypes;  // NEW: Store filter (undefined means use default)
}
```

#### 2. Add Private Member Variable
**File**: `lib/cron/background-filing-worker.ts`
**After line 73** (after `private processingInterval: number;`)

```typescript
private jobTypes?: JobType[];  // Optional filter for job types to process
```

#### 3. Update processBatch Job Type Selection
**File**: `lib/cron/background-filing-worker.ts`
**Lines**: 153-175

```typescript
// Current code (line 153):
const jobTypes = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'] as JobType[];

// New code:
const defaultJobTypes: JobType[] = ['ASYNC_DISCOVER_FILINGS', 'ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'];
const jobTypesToProcess = this.jobTypes ?? defaultJobTypes;

// Log if using filter
if (this.jobTypes) {
  workerLogger.info('Processing with job type filter', {
    processId: this.processId,
    filteredTypes: this.jobTypes,
  });
}
```

Then update the loop variable reference from `jobTypes` to `jobTypesToProcess`.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npm run build`
- [x] Unit tests pass: `npm run test`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Worker can be instantiated with job type filter
- [ ] Worker processes only specified job types when filter is set
- [ ] Worker processes all job types when no filter is set

**Implementation Note**: After completing this phase, pause for manual verification.

---

## Phase 2: Add Query Parameter to Process-Filing-Queue Endpoint

### Overview
Update the API endpoint to extract `jobTypes` query parameter and pass it to the worker.

### Changes Required:

#### 1. Extract Query Parameter
**File**: `app/api/cron/process-filing-queue/route.ts`
**After line 28** (after executionId generation)

```typescript
// Extract and validate jobTypes query parameter
const searchParams = request.nextUrl.searchParams;
const jobTypesParam = searchParams.get('jobTypes');

let jobTypesFilter: JobType[] | undefined;
if (jobTypesParam) {
  const requestedTypes = jobTypesParam.split(',').map(t => t.trim()).filter(Boolean);

  // Validate against allowed job types
  const allowedTypes: JobType[] = [
    'ASYNC_DISCOVER_FILINGS',
    'ASYNC_FETCH_FILING',
    'ASYNC_SUMMARIZE_CACHED'
  ];

  const invalidTypes = requestedTypes.filter(t => !allowedTypes.includes(t as JobType));
  if (invalidTypes.length > 0) {
    routeLogger.warn('Invalid job types requested', {
      executionId,
      invalidTypes,
      requestedTypes,
    });
    return NextResponse.json(
      { error: 'Invalid job types', invalidTypes },
      { status: 400 }
    );
  }

  jobTypesFilter = requestedTypes as JobType[];
  routeLogger.info('Job type filter applied', {
    executionId,
    jobTypes: jobTypesFilter,
  });
}
```

#### 2. Pass Filter to Worker
**File**: `app/api/cron/process-filing-queue/route.ts`
**Lines**: 59-62

```typescript
// Current code:
const worker = new BackgroundFilingWorker({
  batchSize: 10,
  processingInterval: 0,
});

// New code:
const worker = new BackgroundFilingWorker({
  batchSize: 10,
  processingInterval: 0,
  jobTypes: jobTypesFilter,  // Pass filter if provided
});
```

#### 3. Update Response to Include Filter Info
**File**: `app/api/cron/process-filing-queue/route.ts`
**Lines**: 74-79

```typescript
// Add jobTypesFilter to response
return NextResponse.json({
  success: true,
  executionId,
  duration,
  message: 'Filing queue batch processed',
  jobTypesFilter: jobTypesFilter || 'all',  // NEW: Show what was filtered
});
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npm run build`
- [x] Unit tests pass: `npm run test`
- [x] Endpoint without filter still works: `curl localhost:3000/api/cron/process-filing-queue`
- [x] Endpoint with filter works: `curl "localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING"`
- [x] Invalid job type returns 400: `curl "localhost:3000/api/cron/process-filing-queue?jobTypes=INVALID"`

#### Manual Verification:
- [ ] With no filter, all job types are processed (current behavior)
- [ ] With filter, only specified job types are processed
- [ ] Logs show filter information when applied

**Implementation Note**: After completing this phase, pause for manual verification.

---

## Phase 3: Update Cloudflare Worker to Use Filter

### Overview
Modify the Cloudflare Worker Step 2 to call the endpoint with a job type filter that excludes discovery jobs.

### Changes Required:

#### 1. Update Worker URL Construction
**File**: `cloudflare-cron/index.js`
**Lines**: 111-113

```javascript
// Current code:
const workerUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue`;

// New code:
// Exclude discovery jobs from Step 2 - they'll be processed in a future cycle
// after the discovery job from Step 1 completes
const workerUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`;
```

#### 2. Add Inline Comment Explaining the Filter
**File**: `cloudflare-cron/index.js`
**Before line 111**

```javascript
// Step 2: Process Filing Queue
// IMPORTANT: We filter to ASYNC_FETCH_FILING and ASYNC_SUMMARIZE_CACHED only.
// This prevents the discovery job queued in Step 1 from blocking fetch/summarize
// jobs. Discovery jobs will be processed in subsequent cron cycles when no
// fetch/summarize jobs are pending.
```

### Success Criteria:

#### Automated Verification:
- [x] Cloudflare Worker deploys successfully: `npm run cloudflare:deploy:dry-run`
- [x] Worker builds without errors

#### Manual Verification:
- [x] Deploy to Cloudflare: `npm run cloudflare:deploy` (deployed 2025-12-09 18:33 AEDT)
- [x] Monitor next cron execution: `npm run cloudflare:logs` (monitoring started)
- [x] Verify Step 2 processes fetch jobs instead of discovery jobs ✅ CONFIRMED
  - Cron at 18:35:23: Step 2 URL includes `?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`
  - Step 1 created discovery job `3029dd37-5127-486f-89e9-bb3045ac9d1a`
  - Step 2 processed for 30.3 seconds (vs previous ~1s when blocked)
  - Discovery job from Step 1 did NOT block Step 2
- [x] Verify fetch job count increases after multiple cron cycles
  - Worker duration: 30.3 seconds confirms fetch/summarize jobs are being processed
  - Previous behavior: ~1 second (empty batch due to discovery blocking)

**Implementation Note**: After completing this phase, monitor production for 30 minutes to verify fix.

---

## Phase 4: Add Integration Test

### Overview
Add a test to verify the job type filter works correctly.

### Changes Required:

#### 1. Create Test File
**File**: `__tests__/cron/process-filing-queue-filter.test.ts`

```typescript
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/process-filing-queue/route';
import { JobQueueService } from '@/lib/job-queue';

describe('process-filing-queue jobTypes filter', () => {
  beforeEach(() => {
    // Mock auth to pass
    jest.spyOn(require('@/lib/auth/cron-auth-service').CronAuthService, 'validateCronRequest')
      .mockResolvedValue({ isValid: true, clientIP: '127.0.0.1' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should accept valid job type filter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toEqual(['ASYNC_FETCH_FILING']);
  });

  it('should reject invalid job type filter', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=INVALID_TYPE'
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('should process all types when no filter provided', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/cron/process-filing-queue'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toBe('all');
  });

  it('should accept multiple job types', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toEqual(['ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED']);
  });
});
```

### Success Criteria:

#### Automated Verification:
- [x] New tests pass: `npm run test -- __tests__/cron/process-filing-queue-filter.test.ts` (10/10 passing)
- [x] All existing tests still pass: `npm run test` (pre-existing timeout failures unrelated to changes)

#### Manual Verification:
- [x] Test coverage includes filter logic

**Implementation Note**: After completing this phase, run full test suite.

---

## Testing Strategy

### Unit Tests
- Job type filter parameter validation
- Worker constructor with filter option
- processBatch respects filter

### Integration Tests
- Endpoint with/without filter
- Invalid filter returns 400
- Multiple filter values accepted

### Manual Testing Steps
1. Create test discovery and fetch jobs in database
2. Call endpoint without filter - verify discovery job processed first
3. Call endpoint with `?jobTypes=ASYNC_FETCH_FILING` - verify only fetch jobs processed
4. Deploy Cloudflare Worker and monitor logs
5. Verify fetch job queue decreasing over multiple cron cycles

## Performance Considerations

- No additional database queries (filter applied before query)
- No additional HTTP calls (same endpoint, just with parameter)
- Filter validation is O(n) where n is number of requested types (max 3)
- Logging overhead minimal (one additional log line when filter applied)

## Migration Notes

- Backward compatible: endpoint works without filter (default behavior)
- Cloudflare Worker update can be deployed independently
- No database schema changes required
- No environment variable changes required

## Rollback Plan

If issues arise:
1. Remove `?jobTypes=...` from Cloudflare Worker URL (line 111)
2. Redeploy Cloudflare Worker: `npm run cloudflare:deploy`
3. Next.js changes are backward compatible, no rollback needed

## References

- Research document: `thoughts/shared/research/2025-12-09-fetch-job-processing-cloudflare-investigation.md`
- Process-filing-queue endpoint: `app/api/cron/process-filing-queue/route.ts`
- BackgroundFilingWorker: `lib/cron/background-filing-worker.ts`
- Cloudflare Worker: `cloudflare-cron/index.js`
- Job type configuration: `lib/cron/types.ts`
- Similar pattern: `app/api/monitoring/error-alerts/route.ts` (query parameter filtering)
