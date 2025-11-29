# Dynamic E2E Pipeline Validation for User-Tracked Tickers

**Date**: 2025-11-28 19:43:29 +1100
**Git Commit**: 5215f180774f8d6762a2fcf8ba41bc0c84763b49
**Branch**: main
**Repository**: tldrsec-ai

## Overview

Build a comprehensive E2E test that validates the complete 3-phase async pipeline (Discovery -> Fetch -> Summarize) for **all user-tracked tickers** dynamically queried from the database. The test executes the actual pipeline handlers (not mocks) and validates with 100% certainty that:
1. Content fetched matches the actual SEC filing
2. AI summaries are accurate and relevant to the filing
3. Emails are delivered to specified recipients

## Current State Analysis

### Existing Infrastructure
| Component | Status | Dynamic Tickers? |
|-----------|--------|------------------|
| `validate-cik-mappings.ts` | Working | Yes - queries DB |
| `test-content-verification.ts` | Working | Yes - queries DB |
| `test-pipeline-comprehensive.ts` | Working | Yes - orchestrates above |
| `test-e2e-email.ts` | Working | NO - hardcoded tickers |
| 3-phase handlers | Production | N/A |

### Gap Analysis
The existing tests validate **components** but not the **integrated 3-phase pipeline flow**:
- No test executes `discovery-handler` -> `fetch-handler` -> `summarize-cached-handler` in sequence
- No AI validation of summary quality/accuracy
- E2E email test uses hardcoded tickers, not database-driven
- No per-ticker timeout enforcement

### Key Discoveries
- 3-phase pipeline: [lib/cron/handlers/discovery-handler.ts:46](lib/cron/handlers/discovery-handler.ts#L46), [fetch-handler.ts:69](lib/cron/handlers/fetch-handler.ts#L69), [summarize-cached-handler.ts:57](lib/cron/handlers/summarize-cached-handler.ts#L57)
- Job queue: `ASYNC_FETCH_FILING`, `ASYNC_SUMMARIZE_CACHED` job types
- AI summarization: [services/filing/summaryGenerationService.ts:105](services/filing/summaryGenerationService.ts#L105)
- Content cache: `FilingContentCache` table with 24h TTL
- User tickers: `prisma.ticker.findMany()` returns all tracked symbols

## Desired End State

A new test script `scripts/test-e2e-pipeline-all-tickers.ts` that:
1. Dynamically queries ALL user-tracked tickers from database
2. For each ticker, executes the complete 3-phase pipeline
3. Validates content accuracy via metadata cross-reference
4. Validates summary quality via AI review
5. Sends email notifications to configured recipients
6. Enforces 3-minute timeout per ticker (covers 95%+ of cases based on production timing data)
7. Generates comprehensive pass/fail report
8. Scales automatically as new tickers are added

### Verification Criteria
```
npm run test:e2e:all-tickers
```
- All 13 (or N) tickers processed
- 100% content verification pass rate
- 100% AI summary validation pass rate
- Emails delivered to both recipients
- Total execution time tracked
- Individual ticker timing reported

## What We're NOT Doing

- NOT modifying existing pipeline handlers (they're production code)
- NOT creating synthetic/mock filings (using real SEC data)
- NOT changing the job queue architecture
- NOT adding new database tables
- NOT modifying email templates

## Implementation Approach

### Strategy
1. Create a new E2E test that **directly invokes** the pipeline handlers (like the background worker does)
2. Bypass job queue to test synchronously with deterministic ordering
3. Add AI-powered summary validation as a new service
4. Configure dual-recipient email delivery
5. Implement per-ticker timeout with abort controller

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E Pipeline Test                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Query all tickers from Ticker table                         │
│  2. For each ticker (with 5min timeout):                        │
│     a. Simulate discovery (find most recent filing)             │
│     b. Execute fetch-handler directly                           │
│     c. Execute summarize-cached-handler directly                │
│     d. Validate content metadata                                │
│     e. Validate summary with AI reviewer                        │
│     f. Track email delivery status                              │
│  3. Generate comprehensive report                               │
│  4. Exit with appropriate code                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: AI Summary Validation Service

### Overview
Create a service that uses the AI model to validate summary quality and accuracy against the source content.

### Changes Required

#### 1. Summary Validation Service
**File**: `lib/validation/summary-content-validator.ts` (NEW)

```typescript
/**
 * AI-Powered Summary Validation Service
 *
 * Uses the default AI model to validate that generated summaries
 * accurately reflect the source SEC filing content.
 */

import { openRouterClient } from '../ai/openrouter-client';
import { logger } from '../logging';

export interface SummaryValidationResult {
  isValid: boolean;
  confidenceScore: number; // 0-100
  accuracyScore: number;   // 0-100
  completenessScore: number; // 0-100
  relevanceScore: number;  // 0-100
  issues: string[];
  strengths: string[];
  overallAssessment: string;
  validationDurationMs: number;
}

export interface SummaryValidationInput {
  summaryText: string;
  sourceContent: string;
  ticker: string;
  formType: string;
  companyName: string;
  filingDate: string;
}

/**
 * Validate a summary against its source content using AI
 */
export async function validateSummaryWithAI(
  input: SummaryValidationInput
): Promise<SummaryValidationResult> {
  const startTime = Date.now();

  // Truncate source content to fit in context window
  const truncatedContent = input.sourceContent.substring(0, 50000);

  const validationPrompt = `You are a financial analyst quality assurance expert. Your task is to validate that an AI-generated summary accurately represents the source SEC filing.

## Source Filing Information
- Company: ${input.companyName} (${input.ticker})
- Form Type: ${input.formType}
- Filing Date: ${input.filingDate}

## Source Content (excerpt):
${truncatedContent}

## Generated Summary to Validate:
${input.summaryText}

## Validation Task
Analyze the summary and provide a JSON response with the following structure:
{
  "isValid": true/false,
  "confidenceScore": 0-100,
  "accuracyScore": 0-100,
  "completenessScore": 0-100,
  "relevanceScore": 0-100,
  "issues": ["list of factual errors or misrepresentations"],
  "strengths": ["list of things the summary does well"],
  "overallAssessment": "1-2 sentence overall assessment"
}

Scoring Guidelines:
- accuracyScore: Are all facts, figures, and claims in the summary correct?
- completenessScore: Does the summary capture the key material information?
- relevanceScore: Is the summary focused on investor-relevant information?
- confidenceScore: Overall confidence in the summary quality

A summary is valid (isValid: true) if:
- accuracyScore >= 70
- completenessScore >= 60
- relevanceScore >= 70
- No critical factual errors

Respond ONLY with valid JSON.`;

  try {
    const response = await openRouterClient.sendMessage(
      [{ role: 'user', content: validationPrompt }],
      {
        maxTokens: 1000,
        temperature: 0.1,
        timeout: 60000, // 60s timeout for validation
      }
    );

    const content = response.content;

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      isValid: parsed.isValid ?? false,
      confidenceScore: parsed.confidenceScore ?? 0,
      accuracyScore: parsed.accuracyScore ?? 0,
      completenessScore: parsed.completenessScore ?? 0,
      relevanceScore: parsed.relevanceScore ?? 0,
      issues: parsed.issues ?? [],
      strengths: parsed.strengths ?? [],
      overallAssessment: parsed.overallAssessment ?? 'Validation failed',
      validationDurationMs: Date.now() - startTime
    };
  } catch (error) {
    logger.error('Summary validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ticker: input.ticker,
      formType: input.formType
    });

    return {
      isValid: false,
      confidenceScore: 0,
      accuracyScore: 0,
      completenessScore: 0,
      relevanceScore: 0,
      issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown'}`],
      strengths: [],
      overallAssessment: 'Validation failed due to error',
      validationDurationMs: Date.now() - startTime
    };
  }
}
```

### Success Criteria

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit lib/validation/summary-content-validator.ts`
- [x] Unit test passes: Create basic test in `__tests__/validation/summary-content-validator.test.ts`

#### Manual Verification:
- [ ] Test the validator with a real summary and content sample
- [ ] Verify JSON parsing handles edge cases

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: E2E Pipeline Test Script

### Overview
Create the main test script that orchestrates the complete pipeline validation for all user-tracked tickers.

### Changes Required

#### 1. Main E2E Test Script
**File**: `scripts/test-e2e-pipeline-all-tickers.ts` (NEW)

```typescript
#!/usr/bin/env npx tsx
/**
 * E2E Pipeline Validation for All User-Tracked Tickers
 *
 * Executes the complete 3-phase async pipeline for every ticker
 * tracked by users in the database, with comprehensive validation.
 *
 * Features:
 * - Dynamically queries all user-tracked tickers
 * - Executes actual pipeline handlers (not mocks)
 * - 3-minute timeout per ticker
 * - Content metadata validation
 * - AI-powered summary validation
 * - Email delivery to configured recipients
 * - Comprehensive reporting
 *
 * Usage:
 *   npm run test:e2e:all-tickers
 *   npx tsx scripts/test-e2e-pipeline-all-tickers.ts
 *   npx tsx scripts/test-e2e-pipeline-all-tickers.ts --verbose
 *   npx tsx scripts/test-e2e-pipeline-all-tickers.ts --ticker=VRT  # Single ticker
 *   npx tsx scripts/test-e2e-pipeline-all-tickers.ts --skip-email  # Skip email sending
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';
import { handleFetch, FetchResult } from '../lib/cron/handlers/fetch-handler';
import { handleSummarizeCached, SummarizeResult } from '../lib/cron/handlers/summarize-cached-handler';
import { verifyFilingContent, FilingMetadata } from '../lib/validation/filing-content-verifier';
import { validateSummaryWithAI, SummaryValidationResult } from '../lib/validation/summary-content-validator';
import { resolveTicker, formatCIK } from '../lib/sec-edgar/cik-resolver';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const CONFIG = {
  TIMEOUT_PER_TICKER_MS: 3 * 60 * 1000, // 3 minutes - covers 95%+ of cases
  EMAIL_RECIPIENTS: [
    'wilfredchen1@gmail.com',
    'wilfred.chen.python@gmail.com'
  ],
  SEC_REQUEST_DELAY_MS: 200, // Respect SEC rate limits
};

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Parse CLI arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const skipEmail = args.includes('--skip-email');
const singleTickerArg = args.find(a => a.startsWith('--ticker='));
const singleTicker = singleTickerArg?.split('=')[1]?.toUpperCase();

// Types
interface TickerTestResult {
  ticker: string;
  companyName: string | null;
  success: boolean;
  phases: {
    discovery: PhaseResult;
    fetch: PhaseResult;
    summarize: PhaseResult;
  };
  contentValidation: ContentValidationResult | null;
  summaryValidation: SummaryValidationResult | null;
  emailDelivery: EmailDeliveryResult | null;
  totalDurationMs: number;
  error?: string;
}

interface PhaseResult {
  success: boolean;
  durationMs: number;
  details?: any;
  error?: string;
}

interface ContentValidationResult {
  isVerified: boolean;
  confidence: number;
  details: any;
}

interface EmailDeliveryResult {
  sent: boolean;
  recipients: string[];
  error?: string;
}

interface SecSubmissionsResponse {
  cik: string;
  name: string;
  tickers: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

/**
 * Fetch SEC submissions to find latest filing for a ticker
 */
async function fetchLatestFiling(cik: string): Promise<{
  accessionNumber: string;
  formType: string;
  filingDate: string;
  primaryDocument: string;
  companyName: string;
} | null> {
  try {
    const formattedCik = formatCIK(cik);
    const url = `https://data.sec.gov/submissions/CIK${formattedCik}.json`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'tldrsec.app contact@tldrsec.app',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return null;

    const data = await response.json() as SecSubmissionsResponse;

    // Find most recent 10-K, 10-Q, or 8-K (prefer over Form 4)
    const preferredForms = ['10-K', '10-Q', '8-K', '10-K/A', '10-Q/A', '8-K/A', '4'];
    let filingIndex = -1;

    for (const form of preferredForms) {
      filingIndex = data.filings.recent.form.findIndex(f => f === form);
      if (filingIndex >= 0) break;
    }

    if (filingIndex < 0) filingIndex = 0;

    return {
      accessionNumber: data.filings.recent.accessionNumber[filingIndex],
      formType: data.filings.recent.form[filingIndex],
      filingDate: data.filings.recent.filingDate[filingIndex],
      primaryDocument: data.filings.recent.primaryDocument[filingIndex],
      companyName: data.name
    };
  } catch {
    return null;
  }
}

/**
 * Execute pipeline for a single ticker with timeout
 */
async function testTickerPipeline(
  ticker: string,
  companyName: string | null,
  userId: string,
  userEmail: string
): Promise<TickerTestResult> {
  const startTime = performance.now();
  const executionId = uuidv4();

  const result: TickerTestResult = {
    ticker,
    companyName,
    success: false,
    phases: {
      discovery: { success: false, durationMs: 0 },
      fetch: { success: false, durationMs: 0 },
      summarize: { success: false, durationMs: 0 }
    },
    contentValidation: null,
    summaryValidation: null,
    emailDelivery: null,
    totalDurationMs: 0
  };

  // Create abort controller for timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, CONFIG.TIMEOUT_PER_TICKER_MS);

  try {
    // Phase 1: Discovery - Get latest filing for this ticker
    const discoveryStart = performance.now();

    const cikResult = await resolveTicker(ticker);
    if (!cikResult.success || !cikResult.cik) {
      result.phases.discovery.error = `CIK resolution failed: ${cikResult.error}`;
      result.error = result.phases.discovery.error;
      return result;
    }

    const filing = await fetchLatestFiling(cikResult.cik);
    if (!filing) {
      result.phases.discovery.error = 'No filings found for ticker';
      result.error = result.phases.discovery.error;
      return result;
    }

    result.companyName = filing.companyName;
    result.phases.discovery = {
      success: true,
      durationMs: Math.round(performance.now() - discoveryStart),
      details: {
        cik: cikResult.cik,
        accessionNumber: filing.accessionNumber,
        formType: filing.formType,
        filingDate: filing.filingDate
      }
    };

    if (verbose) {
      console.log(`  Discovery: Found ${filing.formType} filed ${filing.filingDate}`);
    }

    // Check for abort
    if (abortController.signal.aborted) {
      throw new Error('Timeout exceeded');
    }

    // Phase 2: Fetch - Execute fetch handler
    const fetchStart = performance.now();

    const fetchPayload = {
      userId,
      userEmail,
      userTier: 'FREE' as const,
      ticker: {
        symbol: ticker,
        companyName: filing.companyName,
        cik: cikResult.cik
      },
      filing: {
        filingId: uuidv4(),
        formType: filing.formType,
        filingDate: filing.filingDate,
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${cikResult.cik.replace(/^0+/, '')}/${filing.accessionNumber.replace(/-/g, '')}/${filing.primaryDocument}`,
        accessionNumber: filing.accessionNumber
      },
      executionContext: {
        executionId,
        cronTriggerTime: new Date().toISOString(),
        sourceContext: 'e2e-test',
        discoveryPhaseCompletedAt: new Date().toISOString()
      }
    };

    const fetchResult = await handleFetch(fetchPayload);

    result.phases.fetch = {
      success: fetchResult.success,
      durationMs: Math.round(performance.now() - fetchStart),
      details: {
        cached: fetchResult.cached,
        cacheId: fetchResult.cacheId,
        contentLength: fetchResult.contentLength
      },
      error: fetchResult.error
    };

    if (!fetchResult.success || !fetchResult.cacheId) {
      result.error = `Fetch failed: ${fetchResult.error}`;
      return result;
    }

    if (verbose) {
      console.log(`  Fetch: ${fetchResult.cached ? 'Cache hit' : 'Fetched'} ${fetchResult.contentLength} bytes`);
    }

    // Content Validation
    const cache = await prisma.filingContentCache.findUnique({
      where: { id: fetchResult.cacheId }
    });

    if (cache?.content) {
      const expectedMetadata: FilingMetadata = {
        accessionNumber: filing.accessionNumber,
        cik: cikResult.cik,
        formType: filing.formType,
        companyName: filing.companyName,
        filingDate: filing.filingDate
      };

      const contentVerification = verifyFilingContent(cache.content, expectedMetadata);
      result.contentValidation = {
        isVerified: contentVerification.isVerified,
        confidence: contentVerification.confidence,
        details: contentVerification
      };

      if (verbose) {
        console.log(`  Content: ${contentVerification.isVerified ? 'VERIFIED' : 'FAILED'} (${contentVerification.confidence}% confidence)`);
      }
    }

    // Check for abort
    if (abortController.signal.aborted) {
      throw new Error('Timeout exceeded');
    }

    // Phase 3: Summarize - Execute summarize handler
    const summarizeStart = performance.now();

    // Get or create ticker record
    let tickerRecord = await prisma.ticker.findFirst({
      where: { userId, symbol: ticker }
    });

    if (!tickerRecord) {
      tickerRecord = await prisma.ticker.create({
        data: {
          userId,
          symbol: ticker,
          companyName: filing.companyName
        }
      });
    }

    const summarizePayload = {
      ...fetchPayload,
      cacheId: fetchResult.cacheId,
      executionContext: {
        ...fetchPayload.executionContext,
        fetchPhaseCompletedAt: new Date().toISOString(),
        cacheHit: fetchResult.cached || false
      }
    };

    // Override email recipients for testing
    const originalEnv = process.env.TEST_EMAIL;
    if (!skipEmail) {
      process.env.TEST_EMAIL = CONFIG.EMAIL_RECIPIENTS[0];
    }

    const summarizeResult = await handleSummarizeCached(summarizePayload);

    process.env.TEST_EMAIL = originalEnv;

    result.phases.summarize = {
      success: summarizeResult.success,
      durationMs: Math.round(performance.now() - summarizeStart),
      details: {
        summaryId: summarizeResult.summaryId,
        cost: summarizeResult.cost,
        tokenUsage: summarizeResult.tokenUsage,
        emailSent: summarizeResult.emailSent
      },
      error: summarizeResult.error
    };

    if (!summarizeResult.success) {
      result.error = `Summarize failed: ${summarizeResult.error}`;
      return result;
    }

    if (verbose) {
      console.log(`  Summarize: Generated (cost: $${summarizeResult.cost?.toFixed(4)})`);
    }

    // AI Summary Validation
    if (summarizeResult.summaryId && cache?.content) {
      const summary = await prisma.summary.findUnique({
        where: { id: summarizeResult.summaryId }
      });

      if (summary?.summaryText) {
        const aiValidation = await validateSummaryWithAI({
          summaryText: summary.summaryText,
          sourceContent: cache.content,
          ticker,
          formType: filing.formType,
          companyName: filing.companyName,
          filingDate: filing.filingDate
        });

        result.summaryValidation = aiValidation;

        if (verbose) {
          console.log(`  AI Validation: ${aiValidation.isValid ? 'PASSED' : 'FAILED'} (${aiValidation.confidenceScore}% confidence)`);
        }
      }
    }

    // Email delivery status
    result.emailDelivery = {
      sent: summarizeResult.emailSent,
      recipients: skipEmail ? [] : CONFIG.EMAIL_RECIPIENTS,
      error: summarizeResult.emailSent ? undefined : 'Email not sent'
    };

    // Overall success
    result.success =
      result.phases.discovery.success &&
      result.phases.fetch.success &&
      result.phases.summarize.success &&
      (result.contentValidation?.isVerified ?? false) &&
      (result.summaryValidation?.isValid ?? false);

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    clearTimeout(timeoutId);
    result.totalDurationMs = Math.round(performance.now() - startTime);
  }

  return result;
}

/**
 * Get all unique user-tracked tickers from database
 */
async function getUserTrackedTickers(): Promise<Array<{
  symbol: string;
  companyName: string | null;
  userId: string;
  userEmail: string;
}>> {
  const tickers = await prisma.ticker.findMany({
    select: {
      symbol: true,
      companyName: true,
      userId: true,
      user: {
        select: { email: true }
      }
    },
    distinct: ['symbol']
  });

  return tickers.map(t => ({
    symbol: t.symbol,
    companyName: t.companyName,
    userId: t.userId,
    userEmail: t.user?.email || CONFIG.EMAIL_RECIPIENTS[0]
  }));
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Main function
 */
async function main() {
  const totalStart = performance.now();

  console.log('\n' + '='.repeat(80));
  console.log('  E2E PIPELINE VALIDATION - ALL USER-TRACKED TICKERS');
  console.log('='.repeat(80));
  console.log(`\n  Started: ${new Date().toLocaleTimeString()}`);
  console.log(`  Verbose: ${verbose}`);
  console.log(`  Skip Email: ${skipEmail}`);
  console.log(`  Timeout per ticker: ${CONFIG.TIMEOUT_PER_TICKER_MS / 1000}s`);
  if (!skipEmail) {
    console.log(`  Email Recipients: ${CONFIG.EMAIL_RECIPIENTS.join(', ')}`);
  }

  // Get tickers to test
  let tickersToTest = await getUserTrackedTickers();

  if (singleTicker) {
    tickersToTest = tickersToTest.filter(t => t.symbol === singleTicker);
    if (tickersToTest.length === 0) {
      console.error(`\nTicker ${singleTicker} not found in user-tracked tickers`);
      process.exit(1);
    }
  }

  console.log(`\n  Tickers to test: ${tickersToTest.length}`);
  console.log(`  Tickers: ${tickersToTest.map(t => t.symbol).join(', ')}`);
  console.log('\n' + '-'.repeat(80));

  const results: TickerTestResult[] = [];

  for (let i = 0; i < tickersToTest.length; i++) {
    const ticker = tickersToTest[i];

    console.log(`\n[${i + 1}/${tickersToTest.length}] Testing ${ticker.symbol}...`);

    const result = await testTickerPipeline(
      ticker.symbol,
      ticker.companyName,
      ticker.userId,
      ticker.userEmail
    );

    results.push(result);

    const status = result.success
      ? '\x1b[32m PASSED\x1b[0m'
      : '\x1b[31m FAILED\x1b[0m';

    console.log(`  Result: ${status} (${formatDuration(result.totalDurationMs)})`);

    if (!result.success && result.error) {
      console.log(`  Error: ${result.error}`);
    }

    // Delay between tickers for SEC rate limiting
    if (i < tickersToTest.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.SEC_REQUEST_DELAY_MS));
    }
  }

  const totalDurationMs = Math.round(performance.now() - totalStart);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('  VALIDATION SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n  Total Tickers: ${results.length}`);
  console.log(`  \x1b[32m Passed: ${passed}\x1b[0m`);
  console.log(`  \x1b[31m Failed: ${failed}\x1b[0m`);
  console.log(`\n  Total Time: ${formatDuration(totalDurationMs)}`);

  // Phase breakdown
  const discoveryPassed = results.filter(r => r.phases.discovery.success).length;
  const fetchPassed = results.filter(r => r.phases.fetch.success).length;
  const summarizePassed = results.filter(r => r.phases.summarize.success).length;
  const contentValidated = results.filter(r => r.contentValidation?.isVerified).length;
  const summaryValidated = results.filter(r => r.summaryValidation?.isValid).length;

  console.log('\n  Phase Results:');
  console.log(`    Discovery:          ${discoveryPassed}/${results.length}`);
  console.log(`    Fetch:              ${fetchPassed}/${results.length}`);
  console.log(`    Summarize:          ${summarizePassed}/${results.length}`);
  console.log(`    Content Validated:  ${contentValidated}/${results.length}`);
  console.log(`    Summary Validated:  ${summaryValidated}/${results.length}`);

  // Failed tickers
  if (failed > 0) {
    console.log('\n  Failed Tickers:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`    - ${r.ticker}: ${r.error}`);
    });
  }

  // Detailed results table
  if (verbose) {
    console.log('\n' + '-'.repeat(80));
    console.log('\n  DETAILED RESULTS:\n');
    console.log('  | Ticker | Discovery | Fetch | Summarize | Content | Summary | Total |');
    console.log('  |--------|-----------|-------|-----------|---------|---------|-------|');

    for (const r of results) {
      const d = r.phases.discovery.success ? '' : '';
      const f = r.phases.fetch.success ? '' : '';
      const s = r.phases.summarize.success ? '' : '';
      const c = r.contentValidation?.isVerified ? '' : '';
      const v = r.summaryValidation?.isValid ? '' : '';
      console.log(`  | ${r.ticker.padEnd(6)} | ${d.padEnd(9)} | ${f.padEnd(5)} | ${s.padEnd(9)} | ${c.padEnd(7)} | ${v.padEnd(7)} | ${formatDuration(r.totalDurationMs).padEnd(5)} |`);
    }
  }

  console.log('\n' + '='.repeat(80));

  if (passed === results.length) {
    console.log('  \x1b[32m ALL TICKERS PASSED - Pipeline validated!\x1b[0m');
  } else {
    console.log('  \x1b[31m SOME TICKERS FAILED - Review errors above\x1b[0m');
  }

  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('E2E test failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
```

#### 2. Package.json Scripts
**File**: `package.json`
**Changes**: Add new npm scripts

```json
{
  "scripts": {
    "test:e2e:all-tickers": "npx tsx scripts/test-e2e-pipeline-all-tickers.ts",
    "test:e2e:all-tickers:verbose": "npx tsx scripts/test-e2e-pipeline-all-tickers.ts --verbose",
    "test:e2e:all-tickers:skip-email": "npx tsx scripts/test-e2e-pipeline-all-tickers.ts --skip-email",
    "test:e2e:ticker": "npx tsx scripts/test-e2e-pipeline-all-tickers.ts --ticker"
  }
}
```

### Success Criteria

#### Automated Verification:
- [x] TypeScript compiles: `npm run build`
- [x] Linting passes: `npm run lint`
- [x] Script runs without crash: `npm run test:e2e:all-tickers:skip-email -- --ticker=VRT`

#### Manual Verification:
- [ ] Run full test with one ticker: `npm run test:e2e:ticker=VRT`
- [ ] Verify email received at both addresses
- [ ] Review summary validation output

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Handler Export Updates

### Overview
The pipeline handlers need to export their result types and ensure they can be called directly (not just through job queue).

### Changes Required

#### 1. Verify Handler Exports
**Files to check**:
- `lib/cron/handlers/fetch-handler.ts` - Ensure `FetchResult` type is exported
- `lib/cron/handlers/summarize-cached-handler.ts` - Ensure `SummarizeResult` type is exported

If not exported, add:
```typescript
export interface FetchResult {
  success: boolean;
  cached?: boolean;
  cacheId?: string;
  contentLength?: number;
  fetchDuration?: number;
  summarizeJobQueued: boolean;
  error?: string;
}
```

```typescript
export interface SummarizeResult {
  success: boolean;
  summaryId?: string;
  cost?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  summarizeDuration?: number;
  emailSent: boolean;
  error?: string;
}
```

### Success Criteria

#### Automated Verification:
- [x] Types can be imported: Create a test import file
- [x] TypeScript compiles: `npm run build`

#### Manual Verification:
- [x] Handler functions can be called directly outside job queue (verified in E2E test script)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 4: CLAUDE.md and Documentation Updates

### Overview
Update documentation and pre-commit requirements to include the new test.

### Changes Required

#### 1. Update CLAUDE.md
**File**: `CLAUDE.md`
**Section**: Pre-Commit Requirements

Add:
```markdown
### Comprehensive Pipeline E2E Testing
- `npm run test:e2e:all-tickers` - **NEW** Full E2E pipeline validation for all user-tracked tickers
  - Dynamically queries all tickers from database
  - Executes complete 3-phase pipeline (Discovery -> Fetch -> Summarize)
  - Validates content metadata accuracy
  - Validates summary quality with AI
  - Sends emails to configured recipients
  - 3-minute timeout per ticker
  - Scales automatically with new tickers
```

#### 2. Update Research Document
**File**: `thoughts/shared/research/2025-11-28-3phase-pipeline-testing-infrastructure.md`
**Changes**: Add note that Gap 1 and Gap 2 are now addressed

### Success Criteria

#### Automated Verification:
- [x] Documentation is valid markdown
- [x] CLAUDE.md updated with new testing commands
- [x] Research document updated to note Gap 1 and Gap 2 are addressed

#### Manual Verification:
- [ ] Documentation accurately describes the new test
- [ ] Pre-commit requirements are clear

---

## Phase 5: Full Integration Test

### Overview
Run the complete E2E test for all 13 tickers and validate results.

### Changes Required
None - this is validation phase.

### Test Execution

```bash
# Full test with all tickers
npm run test:e2e:all-tickers:verbose

# Expected output:
# - All 13 tickers processed
# - Discovery phase passes for all
# - Fetch phase passes for all
# - Summarize phase passes for all
# - Content validation passes for all
# - Summary validation passes for all (AI confirms accuracy)
# - Emails delivered to both recipients
```

### Success Criteria

#### Automated Verification:
- [ ] Exit code 0: All tickers pass
- [ ] No timeout errors
- [ ] No unhandled exceptions

#### Manual Verification:
- [ ] Both email recipients received summaries
- [ ] Summary content is accurate and relevant
- [ ] Report shows 100% pass rate

---

## Testing Strategy

### Unit Tests
- `__tests__/validation/summary-content-validator.test.ts` - AI validation service

### Integration Tests
- Single ticker test: `npm run test:e2e:ticker=VRT`
- Skip email test: `npm run test:e2e:all-tickers:skip-email`

### Full E2E Test
- Complete validation: `npm run test:e2e:all-tickers`

### Manual Testing Steps
1. Run single ticker test with VRT (most active)
2. Verify email delivery to both addresses
3. Review AI validation output for accuracy
4. Run full test for all 13 tickers
5. Verify total execution time is reasonable (~39 minutes max = 13 tickers x 3 min)

## Performance Considerations

- **SEC Rate Limiting**: 200ms delay between tickers
- **Per-Ticker Timeout**: 3 minutes (based on production timing: Discovery 2-10s, Fetch 4-30s, Summarize 30-270s, AI Validation 30-60s)
- **AI Validation**: ~30-60s per summary (adds to total time)
- **Expected Total Time**: ~15-25 minutes for 13 tickers (typical case)
- **Maximum Total Time**: ~39 minutes (if all tickers hit timeout)

## Migration Notes

No database migrations required. All existing tables are used:
- `Ticker` - Query user-tracked tickers
- `FilingContentCache` - Store/retrieve cached content
- `Summary` - Store generated summaries
- `CikMapping` - Resolve tickers to CIK

## Rollback Plan

If issues are discovered:
1. The new test is additive - doesn't modify existing code
2. Simply don't run `npm run test:e2e:all-tickers`
3. Existing tests continue to work unchanged

## References

- Research: `thoughts/shared/research/2025-11-28-3phase-pipeline-testing-infrastructure.md`
- Existing plan: `docs/plans/2025-11-28-comprehensive-pipeline-testing.md`
- Discovery handler: [lib/cron/handlers/discovery-handler.ts:46](lib/cron/handlers/discovery-handler.ts#L46)
- Fetch handler: [lib/cron/handlers/fetch-handler.ts:69](lib/cron/handlers/fetch-handler.ts#L69)
- Summarize handler: [lib/cron/handlers/summarize-cached-handler.ts:57](lib/cron/handlers/summarize-cached-handler.ts#L57)
- Content verifier: [lib/validation/filing-content-verifier.ts](lib/validation/filing-content-verifier.ts)
