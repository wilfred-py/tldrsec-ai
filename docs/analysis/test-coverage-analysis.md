# Test Coverage Analysis & Improvement Plan

**Date**: 2026-02-14
**Status**: Analysis Complete

---

## Executive Summary

The codebase has **373 test files** covering an estimated **648 source files** (~57% file-level coverage ratio). While the test infrastructure is sophisticated (Jest, React Testing Library, comprehensive mocking, multiple test tiers), there are significant coverage gaps in **critical pipeline paths**, **API routes** (32.7% tested), and **React components** (27% tested). The most concerning gaps are in the core filing pipeline, webhook handlers, and system monitoring components.

---

## Current State

### Test Infrastructure Strengths
- Mature Jest configuration with ESM support, dual environments (jsdom + node)
- Comprehensive mock system (Clerk, Prisma, Anthropic SDK, external APIs)
- Multi-tier test strategy: unit, integration, E2E, performance, security, regression
- 165+ npm test commands covering specialized domains
- Secure test utilities (`SecureTestEnvironment`, mock factories)
- Real production pipeline tests with live API calls

### Test Infrastructure Weaknesses
- No formal coverage thresholds enforced (no `coverageThreshold` in Jest config)
- Coverage reporting is opt-in (`--coverage` flag), not part of CI
- No coverage trend tracking or regression detection
- Test file organization is inconsistent (3 different patterns: `__tests__/`, colocated, `tests/`)

---

## Coverage Gap Analysis

### 1. Core Pipeline (CRITICAL PRIORITY)

The SEC filing pipeline is the core business logic: Discovery -> Fetch -> Summarize -> Email. Several key modules in this path lack dedicated tests.

| File | Coverage | Risk |
|------|----------|------|
| `lib/cron/batch-filing-processor.ts` | NONE | Batch optimization logic entirely untested |
| `lib/cron/parallel-ai-processor.ts` | NONE | Parallel AI processing untested |
| `lib/cron/budget-service.ts` | NONE | Budget enforcement untested - could overspend |
| `lib/cron/queue-monitoring.ts` | NONE | Queue health metrics untested |
| `lib/cron/handlers/fetch-handler.ts` | NONE | Phase 2 (fetch) handler untested |
| `lib/cron/filing-processor.ts` | PARTIAL | Only tested indirectly via integration |
| `lib/cron/tier-eligibility.ts` | PARTIAL | Only tested as import in integration tests |
| `lib/cron/handlers/summarize-cached-handler.ts` | PARTIAL | Only field population tested |

**Why this matters**: A bug in `batch-filing-processor.ts` or `fetch-handler.ts` could silently break the entire pipeline without any test catching it. Budget service bugs could lead to unconstrained API spending.

**Recommended tests**:
- Unit tests for `batch-filing-processor.ts`: batch size calculation, partial failure handling, retry logic
- Unit tests for `parallel-ai-processor.ts`: concurrency limits, error isolation between parallel tasks, timeout handling
- Unit tests for `budget-service.ts`: budget threshold enforcement, over-budget prevention, budget reset logic
- Unit tests for `fetch-handler.ts`: successful fetch flow, SEC API error handling, content validation, retry on transient failures
- Unit tests for `queue-monitoring.ts`: metric calculation, threshold alerting, health status determination

---

### 2. API Routes (HIGH PRIORITY)

**Overall: 16/49 routes tested (32.7%)**

Completely untested domains (0% coverage):

| Domain | Routes | Risk |
|--------|--------|------|
| **Webhook** (`/api/webhook/clerk`, `/api/webhook/stripe`) | 3 routes | Payment/auth lifecycle events could silently fail |
| **Email** (`/api/email/summary`, `/api/email/welcome`) | 2 routes | Email delivery failures undetected |
| **Monitoring** (`/api/monitoring/dlq-status`, `/api/monitoring/retry-rates`) | 2 routes | Monitoring endpoints could return wrong data |
| **System** (`/api/system/health`, `/api/system/processing-metrics`) | 2 routes | Health checks could report false positives |
| **Waitlist** (`/api/waitlist/count`, `/api/waitlist/subscribe`) | 2 routes | User acquisition funnel untested |
| **Billing** (`/api/billing/portal`) | 1 route | Billing portal access untested |
| **Slack** (`/api/slack/events`) | 1 route | Slack event verification untested |

Partially tested domains:

| Domain | Tested/Total | Key Gaps |
|--------|-------------|----------|
| **Cron** | 4/13 (31%) | `process-filing-queue`, `cleanup-locks`, `queue-status`, `final-backup`, `backup-trigger`, `check-trial-expiration`, `update-daily-count`, `slack-daily-report`, `slack-hourly-summary` all untested |
| **Health** | 1/4 (25%) | `environment`, `deployment`, base `health` route untested |
| **User** | 4/6 (67%) | `onboarding-status`, `tickers/[id]` untested |
| **Onboarding** | 1/3 (33%) | `merge-pending`, `save-pending` untested |

**Recommended tests (highest impact first)**:
- `app/api/webhook/stripe/route.ts`: Verify signature validation, event type routing, idempotency, error handling for payment events
- `app/api/webhook/clerk/route.ts`: Verify Svix signature validation, user.created/updated/deleted event handling
- `app/api/email/summary/route.ts`: Auth check, summary lookup, email rendering, Resend API call, error handling
- `app/api/cron/process-filing-queue/route.ts`: HMAC auth, queue processing, job status transitions
- `app/api/monitoring/dlq-status/route.ts`: Correct DLQ count, error pattern aggregation
- `app/api/health/environment/route.ts`: Env var presence checking, secret redaction

---

### 3. React Components (MEDIUM-HIGH PRIORITY)

**Overall: 25/93 components tested (27%)**

Critical untested components with complex business logic:

| Component | Complexity | Why It Needs Tests |
|-----------|-----------|-------------------|
| `dashboard/pipeline-health-panel.tsx` | HIGH | Fetches `/api/health/pipeline` every 30s, stuck job detection, multi-metric aggregation |
| `dashboard/system-health-banner.tsx` | HIGH | 3-state status management, conditional visibility, dynamic messages |
| `dashboard/filing-status-indicator.tsx` | HIGH | Polls per-ticker status every 2 min, 4-state rendering |
| `dashboard/processing-status.tsx` | HIGH | Threshold-based health calculation, progress bar logic |
| `dashboard/ticker-settings-dropdown.tsx` | HIGH | 20+ toggle preferences, batch updates, change tracking |
| `onboarding/tutorial-modal.tsx` | HIGH | 11-substep wizard, progress persistence, navigation state |
| `ui/error-boundary.tsx` | CRITICAL | Application-wide error handling, recovery mechanism |
| `billing/subscription-plans.tsx` | HIGH | Stripe integration, plan switching, loading states |

**Recommended tests**:
- `error-boundary.tsx`: Error capture, fallback rendering, recovery via re-render, nested error propagation
- `pipeline-health-panel.tsx`: API response rendering, stuck job alerts, degraded/healthy/critical states
- `system-health-banner.tsx`: Banner visibility per status, auto-refresh, dismissal
- `ticker-settings-dropdown.tsx`: Preference toggle state management, batch save, cancel/reset behavior
- `tutorial-modal.tsx`: Step navigation, progress calculation, completion callback, keyboard navigation

---

### 4. SEC Edgar Client (HIGH PRIORITY)

| File | Coverage | Risk |
|------|----------|------|
| `lib/sec-edgar/cik-resolver.ts` | NONE | CIK resolution bugs break all ticker tracking |
| `lib/sec-edgar/environment-aware-fetcher.ts` | NONE | Environment-specific fetch failures undetected |
| `lib/sec-edgar/client.ts` | PARTIAL | Only tested indirectly via validation tests |
| `lib/sec-edgar/ticker-monitoring.ts` | PARTIAL | Referenced in 12+ integration tests but no unit tests |

**Recommended tests**:
- `cik-resolver.ts`: Ticker-to-CIK lookup, cache behavior, fallback for unknown tickers, batch resolution
- `environment-aware-fetcher.ts`: Local vs production fetch strategies, fallback chain, timeout handling
- `client.ts`: API response parsing, rate limit handling, retry on 429/503, pagination

---

### 5. Auth & Trial System (MEDIUM PRIORITY)

| File | Coverage | Risk |
|------|----------|------|
| `lib/auth/trial-service.ts` | NONE | Trial expiration logic untested |
| `lib/auth/unified-auth-system.ts` | NONE | Core auth system untested |

**Recommended tests**:
- `trial-service.ts`: Trial start/expiration dates, grace period handling, trial-to-paid conversion
- `unified-auth-system.ts`: Auth state resolution, role-based access, session validation

---

### 6. Job Queue System (MEDIUM PRIORITY)

| File | Coverage | Risk |
|------|----------|------|
| `lib/job-queue/progress-checkpoint.ts` | NONE | Progress tracking untested |
| `lib/job-queue/worker.ts` | PARTIAL | Only mocked, never directly tested |
| `lib/job-queue/dead-letter-queue.ts` | PARTIAL | Only tested through DLQ cleanup API |
| `lib/job-queue/lock-service.ts` | PARTIAL | Referenced in cleanup tests only |

**Recommended tests**:
- `progress-checkpoint.ts`: Checkpoint creation, resume from checkpoint, checkpoint cleanup
- `worker.ts`: Job execution lifecycle, timeout handling, error propagation, graceful shutdown
- `dead-letter-queue.ts`: DLQ entry creation, retry from DLQ, max retry enforcement, DLQ cleanup

---

### 7. Slack Integration (LOW-MEDIUM PRIORITY)

| File | Coverage | Risk |
|------|----------|------|
| `lib/slack/message-formatter.ts` | NONE | Malformed Slack messages |
| `lib/slack/alert-rules.ts` | NONE | Alert rules could fire incorrectly |
| `lib/slack/webhook-service.ts` | PARTIAL | Only mocked in other tests |

---

## Infrastructure Improvements

### 1. Add Coverage Thresholds to Jest Config

Add minimum coverage requirements to prevent regression:

```javascript
// jest.config.mjs
coverageThreshold: {
  global: {
    branches: 40,
    functions: 45,
    lines: 50,
    statements: 50,
  },
  // Higher thresholds for critical modules
  './lib/cron/': {
    branches: 60,
    functions: 70,
    lines: 70,
  },
  './lib/job-queue/': {
    branches: 60,
    functions: 70,
    lines: 70,
  },
}
```

### 2. Add Coverage Reporting to CI

Run `npm test -- --coverage` in CI and fail the build if thresholds aren't met. Publish HTML coverage reports as build artifacts.

### 3. Standardize Test File Organization

Adopt a single convention. Recommended: colocated `__tests__/` directories adjacent to source files. This makes it obvious when a module lacks tests.

### 4. Add Integration Test for Full Pipeline Path

Currently the E2E test (`npm run test:e2e`) tests the happy path with live APIs. Add a mock-based integration test that exercises:
```
Discovery Handler -> Fetch Handler -> Summarize Handler -> Email Queue -> Notification
```
with controlled inputs to test error paths, partial failures, and retry behavior without requiring live API calls.

---

## Prioritized Implementation Order

### Phase 1: Pipeline Safety Net (Highest Impact)
1. `lib/cron/fetch-handler.ts` - Unit tests
2. `lib/cron/batch-filing-processor.ts` - Unit tests
3. `lib/cron/budget-service.ts` - Unit tests
4. `app/api/webhook/stripe/route.ts` - Route tests
5. `app/api/webhook/clerk/route.ts` - Route tests

### Phase 2: Monitoring & Observability
6. `lib/sec-edgar/cik-resolver.ts` - Unit tests
7. `components/ui/error-boundary.tsx` - Component tests
8. `app/api/email/summary/route.ts` - Route tests
9. `app/api/monitoring/dlq-status/route.ts` - Route tests
10. `lib/cron/queue-monitoring.ts` - Unit tests

### Phase 3: User-Facing Reliability
11. `components/dashboard/pipeline-health-panel.tsx` - Component tests
12. `components/dashboard/system-health-banner.tsx` - Component tests
13. `components/dashboard/ticker-settings-dropdown.tsx` - Component tests
14. `components/onboarding/tutorial-modal.tsx` - Component tests
15. `lib/auth/trial-service.ts` - Unit tests

### Phase 4: Completeness & Infrastructure
16. `lib/cron/parallel-ai-processor.ts` - Unit tests
17. `lib/job-queue/worker.ts` - Unit tests
18. `lib/job-queue/progress-checkpoint.ts` - Unit tests
19. Remaining untested cron routes (8 routes)
20. Jest coverage thresholds + CI integration

---

## Metrics to Track

After implementing improvements, measure:
- **Line coverage %**: Target 60% global, 75% for `lib/cron/` and `lib/job-queue/`
- **Branch coverage %**: Target 50% global, 65% for critical paths
- **Untested route count**: Target < 10 (from current 33)
- **Untested component count**: Target < 30 (from current 68, focusing on those with business logic)
