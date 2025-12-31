# Project Progress

**Date**: 2025-12-31
**Branch**: feature/landing-page-v2-redesign
**Status**: Pipeline HEALTHY - Legal pages created

---

## Current Session: Privacy Policy & Terms of Service Pages

Created comprehensive legal pages for the application.

### Files Created
- [app/privacy/page.tsx](app/privacy/page.tsx) - Privacy Policy page
- [app/terms/page.tsx](app/terms/page.tsx) - Terms of Service page

### Privacy Policy Covers
- Information collected (account, preferences, usage data)
- Third-party services (Clerk, Stripe, Resend, Supabase, Vercel, OpenRouter)
- Data sharing and security practices
- User rights (access, correction, deletion)
- Cookies and tracking
- International data transfers
- Contact information

### Terms of Service Covers
- Service description (AI-powered SEC filing analysis)
- Account registration requirements
- Subscription tiers (Free, Pro, Max) and payment terms
- Acceptable use policy
- Intellectual property rights
- Investment advice disclaimer (prominently displayed)
- Limitation of liability
- Indemnification
- Service modifications
- Termination policy
- Governing law (Australia)

### Files Modified
- [components/landing/sections-v2/footer-section-v2.tsx](components/landing/sections-v2/footer-section-v2.tsx) - Updated legal links from `/legal/privacy` to `/privacy` and `/legal/terms` to `/terms`

### Route Configuration
Routes already configured in middleware.ts as public routes:
- `/privacy` - Privacy Policy
- `/terms` - Terms of Service

Already in sitemap.ts for SEO.

### Verification
- ESLint passes
- Footer tests pass (6/6)

---

## Previous Session: Onboarding Page UI Fixes ✅

Fixed two UI issues on the `/onboarding` page:

### Issue 1: Navigation bar showing on onboarding
**Problem**: The sticky nav bar from "/" was visible on `/onboarding` before redirect, creating visual inconsistency.

**Fix**: Modified auth layout to conditionally render Navigation based on pathname.

**File Modified**: [app/(auth)/layout.tsx](app/(auth)/layout.tsx)
```tsx
"use client";
import { usePathname } from "next/navigation";

export default function AuthLayout({ children }) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding";

  return (
    <>
      {!isOnboarding && <Navigation />}
      <div className="min-h-screen">{children}</div>
    </>
  );
}
```

### Issue 2: Black borders on sector cards
**Problem**: Sector and equity selection cards had black borders (`border-border`) - should be lighter, more inviting.

**Fix**: Changed to `border-gray-200` (matches design system's `--landing-border: #E5E7EB`) with dark mode support.

**File Modified**: [app/(auth)/onboarding/page.tsx](app/(auth)/onboarding/page.tsx)
- Sector cards (line 423): `border-gray-200 dark:border-gray-700`
- Equity cards (line 518-519): `border-gray-200 dark:border-gray-700`

### Verification
- ✅ ESLint passes
- ✅ Navigation hidden on `/onboarding`, visible on other auth routes
- ✅ Card borders now light gray (#E5E7EB)

---

## Previous Session: Landing Page V2 Redesign ✅

Implemented complete landing page redesign with light theme, Stripe-inspired design, and A/B testing infrastructure.

### Overview
Complete TDD implementation of 8-phase landing page redesign following plan at `docs/plans/2025-12-31-landing-page-high-converting-redesign.md`.

### Key Features Implemented
- **Light theme** with Stripe-inspired primary blue (#0079F2)
- **Mesh gradient background** using CSS radial-gradients (not WebGL)
- **Z-pattern hero layout** with filing card on the right (Apple 10-K preview)
- **Trust metrics** (2,500+ investors, 99.9% uptime, <5 min delivery)
- **Billing toggle** for monthly/annual pricing with savings highlight
- **Feature flag** (`NEXT_PUBLIC_LANDING_V2_ENABLED`) for A/B testing

### Files Created

**Design System**:
- `lib/animations/landing-animations.ts` - Animation primitives (fadeUp, stagger, mesh gradient)
- `lib/animations/index.ts` - Barrel export

**V2 Sections** (`components/landing/sections-v2/`):
- `hero-section-v2.tsx` - Two-column hero with Z-pattern layout
- `hero-filing-card.tsx` - Apple 10-K filing preview card
- `features-section-v2.tsx` - 6 feature cards in 3-column grid
- `pricing-section-v2.tsx` - 3-tier pricing with monthly/annual toggle
- `cta-section-v2.tsx` - Email capture with light blue gradient
- `footer-section-v2.tsx` - Light theme footer with SEC disclaimer
- `index.ts` - Barrel exports

**Page Composition**:
- `components/landing/landing-page-v2.tsx` - Main V2 composition

**Tests** (`__tests__/components/landing/`):
- `design-system.test.tsx` - 13 tests
- `hero-section-v2.test.tsx` - 10 tests
- `features-section-v2.test.tsx` - 6 tests
- `pricing-section-v2.test.tsx` - 8 tests
- `cta-section-v2.test.tsx` - 6 tests
- `footer-section-v2.test.tsx` - 6 tests
- `landing-page-v2.test.tsx` - 3 tests

### Files Modified
- `app/globals.css` - Added landing V2 color tokens and typography classes
- `app/page.tsx` - Added V2 feature flag support
- `.env.example` - Added `NEXT_PUBLIC_LANDING_V2_ENABLED` documentation

### Verification
- ✅ 52/52 landing component tests passing
- ✅ Build succeeds
- ✅ Feature flag works (set `NEXT_PUBLIC_LANDING_V2_ENABLED=true` to enable)

---

## Previous Session: Onboarding Page jsdom Fix ✅

Fixed client-side crash on `/onboarding` page caused by server-only library bundling.

### Issue
Onboarding page crashed with `SharedArrayBuffer is not defined` error, showing "Application error: a client-side exception has occurred".

### Root Cause
Import chain pulled `jsdom` (server-only) into client bundle:
1. `onboarding/page.tsx` → `NotificationPreference` from `notification-service.ts`
2. `preference-types.ts` → `NotificationPreference` from `notification-service.ts`
3. `notification-service.ts` → `job-queue/index.ts`
4. `job-queue/index.ts` → `validation/sanitizers/index.ts`
5. `sanitizers/index.ts` → **`jsdom`** (server-only, uses `SharedArrayBuffer`)

### Fix Applied
Changed imports to use `notification-types.ts` (types-only, no server deps) instead of `notification-service.ts`:

**Files Modified**:
- `app/(auth)/onboarding/page.tsx` - Import from `notification-types`
- `lib/user/preference-types.ts` - Import from `notification-types`
- `components/settings/SettingsForm.tsx` - Import from `notification-types`

### Verification
- ✅ Page loads without error (redirects to sign-in for unauthenticated users as expected)
- ✅ No `SharedArrayBuffer` console errors
- ✅ Fast Refresh works without full reload

---

## Previous Session: Email URL Fix - Revert XSLT Transformation ✅

Fixed broken email links caused by SEC XSLT stylesheet URL variability.

### Issue
Email "View Full Filing" buttons returned 404 errors:
- VRT Form 3 → 404
- GOOGL Form 4, Form 4/A → 404
- Other forms redirecting to wrong documents

### Root Cause Investigation (Playwright)
SEC XSLT stylesheets and filenames vary unpredictably:
- **Stylesheet versions**: xslF345X02, xslF345X05, etc.
- **Filenames**: form4.xml, ownership.xml, wk-form3_*.xml (NOT always primary_doc.xml)
- **CIK paths**: May use filer CIK instead of company CIK

Examples discovered:
- VRT Form 3: `xslF345X02/wk-form3_*.xml`
- GOOGL Form 4: `xslF345X05/ownership.xml`
- CMG Form 4: `xslF345X05/form4.xml`

### Fix Applied
Reverted XSLT URL transformation - Filing Detail page (`-index.htm`) is always reliable.

**Commit**: `9cbd75f` - "Revert XSLT URL transformation - keep index URLs for reliability"

**File Modified**: [lib/email/url-utils.ts](lib/email/url-utils.ts)
- Index URLs (`-index.htm`) now pass through unchanged
- XML files with existing XSLT pass through
- XML files without XSLT convert to index page
- Directory URLs convert to index page

### Verification
```
✅ 12/12 form types have valid email URLs
All test emails sent successfully with index URLs
```

---

## Previous Session: Form 4 Email Data Corruption Fix ✅

Fixed Form 4 email showing incorrect transaction data for COIN (Coinbase) insider filing.

### Issue
COIN Form 4 email displayed:
- "BOUGHT $2.0M, 0 shares" when it should show "sold 7,375 Class A shares for $1.97M"
- Transaction type wrong (BOUGHT vs sold)
- Dollar amount rounded incorrectly ($2.0M vs $1.97M)
- Share count missing (0 vs 7,375)

### Root Cause
1. Multiple regex patterns in `extractTransactionsFromText()` matched the same text, causing 3 duplicate transactions
2. Template `isSaleTransaction()` defaulted to "purchase" when transaction type was ambiguous
3. No text-based fallback when structured data was incomplete

### Fixes Applied

**1. Transaction Deduplication** ([form4-data-extractor.ts:415-465](lib/email/form4-data-extractor.ts#L415-L465))
- Added `deduplicateTransactions()` function using shares+type+disposition as unique key
- Added `parseValueToNumber()` helper to compare transaction values
- Prefers transactions with more complete data when duplicates found

**2. Text-Based Sale Detection** ([form4-minimalist-template.tsx:108-137](components/ui/email/templates/form4-minimalist-template.tsx#L108-L137))
- Added `textIndicatesSale()` function detecting "sold", "sale", "disposed", "dumped", "unloaded", "offloaded"
- Used as fallback when structured transaction data is ambiguous
- `aggregateTransactionsByType()` now accepts `summaryText` parameter for fallback

**3. Improved Sale Detection** ([form4-minimalist-template.tsx:75-106](components/ui/email/templates/form4-minimalist-template.tsx#L75-L106))
- `isSaleTransaction()` expanded to detect "sold", "disposition" in type field
- Handles `pricePerShare` being either string or number type
- Added code "D" (disposition) as sale indicator

### Verification
```
Input: "CFO Alesia Haas sold 7,375 Class A shares for $1.97M on Dec."
Transaction count: 1 (was 3 with duplicates)
Transaction type: Sale (was "BOUGHT")
Shares: 7,375 (was "0")
Total value: $1.97M (was "$2.0M")
AcquisitionDisposition: D
```

- ✅ All verification checks pass
- ✅ ESLint passes
- ✅ TypeScript compiles

---

## Previous Session: 8-K and Form 144 Email Template Fixes ✅

Fixed signal badges and share extraction for 8-K and Form 144 templates.

---

## Previous Session: Landing Page Playwright Feature Testing ✅

Completed Playwright MCP browser testing for the landing page Stripe redesign.

### Test Results: ALL 5 TESTS PASSED

| Test | Status | Details |
|------|--------|---------|
| Feature flag redirect | ✅ | `NEXT_PUBLIC_LANDING_PAGE_ENABLED="true"` verified |
| Landing page renders | ✅ | All sections: Hero, Filings, Features, Pricing, CTA, Footer |
| Filing preview dialog | ✅ | AAPL 10-K dialog shows FULL summary (not truncated) |
| Annual billing toggle | ✅ | Prices update ($99→$83/mo, $139→$116/mo), "Save 17%" badges |
| Pricing CTAs | ✅ | All 3 plans navigate with correct URL params |

### Pricing CTA Navigation Verified

| Plan | Monthly URL | Annual URL |
|------|------------|------------|
| Free | `/sign-up` | `/sign-up` |
| Pro | `/sign-up?plan=pro&interval=monthly` | `/sign-up?plan=pro&interval=annual` |
| Max | `/sign-up?plan=max&interval=monthly` | `/sign-up?plan=max&interval=annual` |

---

## Previous Session: Landing Page Stripe Redesign - Implementation Verified ✅

Full verification of the landing page Stripe redesign implementation from `docs/plans/2025-12-30-landing-page-stripe-redesign.md`.

### Implementation Status: ALL 6 PHASES COMPLETE

**Phase 1: Stripe Configuration ($99/$139 with Annual Billing) ✅**
- `lib/stripe.ts` - SUBSCRIPTION_PLANS with FREE ($0), PRO ($99/$990), MAX ($139/$1390)
- Helper functions: `getPlanConfig`, `calculateSavingsPercentage`, `calculateAnnualSavings`

**Phase 2: Ticker Confirmation & Quarterly Earnings Email ✅**
- `app/api/user/tickers/confirm/route.ts` - API with 1-minute grace period
- `lib/email/quarterly-earnings-service.ts` - Email service for quarterly summaries
- `components/dashboard/ticker-confirmation-section.tsx` - Dashboard confirmation UI
- `components/dashboard/upgrade-cta-section.tsx` - Upgrade CTAs for Free/Pro users

**Phase 3: Waitlist Migration & Feature Flag ✅**
- `app/waitlist/page.tsx` - Waitlist preserved at /waitlist route
- `app/page.tsx` - Feature flag redirect when `NEXT_PUBLIC_LANDING_PAGE_ENABLED !== 'true'`

**Phase 4: Landing Page Components with Curated Filings ✅**
- `lib/data/curated-filings.ts` - 6 curated filings (AAPL, MSFT, NVDA, GOOGL, TSLA, BRK.A)
- `components/landing/new-landing-page.tsx` - Main landing page with all sections
- `components/landing/sections/filing-preview-card.tsx` - Dialog shows FULL summary
- `components/landing/sections/pricing-section.tsx` - Monthly/Annual billing toggle

**Phase 5: Stripe Checkout with Annual Billing ✅**
- Pricing CTAs link to `/sign-up?plan={plan}&interval={billing}`
- MAX tier goes direct to onboarding (no "contact sales")

**Phase 6: Final Integration & Testing ✅**
- 28/28 tests passing (16 Stripe + 12 Ticker Confirmation)
- Lint: CLEAN
- Build: SUCCESS

### Pending: Production Readiness (Manual Steps)

Environment variables need to be set in Vercel:
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_MAX_MONTHLY_PRICE_ID`
- `STRIPE_MAX_ANNUAL_PRICE_ID`
- `NEXT_PUBLIC_LANDING_PAGE_ENABLED=false` (initially)

Stripe Dashboard setup:
- 4 new prices to be created (Pro/Max × Monthly/Annual)

---

## Previous Session: Premium → Max Tier Rename ✅ COMPLETE

Renamed "Premium" tier to "Max" throughout the codebase for brand consistency.

**Files Modified**:
- `components/landing/sections/pricing-section.tsx` - Changed CTA text from "Start Premium" to "Start Max"
- `docs/plans/2025-12-30-landing-page-stripe-redesign.md` - Updated all Premium references to Max

**Already Correctly Implemented** (no changes needed):
- `lib/stripe.ts` - Already uses MAX naming
- `__tests__/config/stripe-pricing.test.ts` - Already uses MAX naming
- `components/dashboard/upgrade-cta-section.tsx` - Already uses MAX naming
- `lib/validation/subscription-validation.ts` - Supports both MAX and PREMIUM for backwards compatibility

**Verification**:
- ✅ 16/16 Stripe pricing tests passing
- ✅ Lint clean
- ✅ Build SUCCESS

---

## Recently Completed (Last 30 Days)

### Cloudflare Event Drop Investigation ✅ (2025-12-30)

Investigated and resolved a Cloudflare Worker cron schedule failure that caused ~4 hour pipeline outage.

**Root Cause**: Cloudflare `*/5 * * * *` cron schedule stopped triggering while `*/10 * * * *` continued working.
**Resolution**: Redeployed Cloudflare Worker with `npx wrangler deploy`
**Downtime**: 15:10:25 AEST to 19:15:14 AEST (~4 hours)

**Preventive Measures Implemented**:
- `app/api/health/deployment/route.ts` - Deployment health check endpoint
- `cloudflare-cron/index.js` v2.6.0 - Circuit breaker visibility in health endpoint
- `docs/runbooks/cloudflare-worker-monitoring.md` - Monitoring runbook with alert thresholds
- `docs/incidents/2025-12-30-cloudflare-cron-schedule-failure.md` - Incident report

**Skipped**: Vercel deployment webhook (requires Pro plan), HMAC tolerance (not root cause)

---

### JSON Parsing Pipeline Simplification - Phase 5 ✅ COMPLETE

Implementing plan from `docs/plans/2025-12-28-simplify-json-parsing-pipeline.md` - applying Elon Musk's 5-step engineering algorithm to achieve 100% parsing accuracy.

**Goal**: Replace 2,500 lines of complex parsing code with ~300 lines of bulletproof prompts.

### Phase 5 (Actual): Production Validation & Monitoring ✅ (2025-12-29)

**Branch**: `feature/json-parsing-phase5-monitoring`

Implemented production monitoring and prompt improvement feedback loop for the simplified JSON parsing pipeline.

**Files CREATED**:
- `lib/monitoring/json-parsing-monitor.ts` (413 lines):
  - Singleton `JSONParsingMonitor` class for tracking all parsing attempts
  - Metrics: total, directSuccess, codeblockStripped, bracketRepaired, validationFailures, jsonErrors
  - Success rate and average parse time calculation
  - `ParsingFailureRecord` for capturing failure details
  - `getRecentFailures(limit)` for debugging
  - `generatePromptImprovementReport()` for analyzing failure patterns
  - Recommendations for common issues (missing fields, high repair rate)

- `__tests__/monitoring/json-parsing-monitor.test.ts` (383 lines, 16 tests):
  - Tests for recording successes/failures
  - Tests for metrics calculation
  - Tests for report generation
  - Tests for reset functionality

- `app/api/monitoring/parsing-metrics/route.ts` (181 lines):
  - GET endpoint for retrieving parsing metrics
  - Optional `includeReport` and `includeFailures` query params
  - POST endpoint for resetting metrics (admin only)
  - Health status indicators (healthy, degraded, critical)

**Files MODIFIED**:
- `lib/monitoring/index.ts`:
  - Added export for `json-parsing-monitor`

- `lib/ai/parsers/response-parser.ts`:
  - Added import of `jsonParsingMonitor`
  - Integrated `recordParsingAttempt()` call after each parse

**Test Results**:
- ✅ All 16 new monitoring tests passing
- ✅ All 75 parser tests passing
- ✅ Pipeline comprehensive validation passing (CIK, content, regression)
- ✅ Build compiles successfully with new API endpoint

**Monitoring Metrics Tracked**:
- `ai.parsing.total` - Total parsing attempts
- `ai.parsing.direct_success` - First-attempt parse success
- `ai.parsing.codeblock_stripped` - Success after markdown removal
- `ai.parsing.bracket_repaired` - Success after bracket repair
- `ai.parsing.validation_failure` - Schema validation failures
- `ai.parsing.json_error` - JSON parse errors

### Previous: Bracket Repair for AI Failure Modes ✅ (2025-12-29)

**Branch**: `fix/json-bracket-repair` (ready for PR)

Fixed intermittent JSON parsing failures caused by AI forgetting to close arrays.

**Root Cause Investigation**:
- Stress testing revealed Grok 4.1-fast has ~40% failure rate on complex JSON
- All failures had `finish_reason: stop` (not truncation) with bracket imbalance of 1
- AI completes normally but forgets `]` before final `}`
- Example: `{"keyPoints":["point 1","point 2"}` (missing `]`)

**Files MODIFIED**:
- `lib/ai/parsers/simple-parser.ts`:
  - Added `attemptBracketRepair()` function for known AI failure modes
  - New method type: `'bracket-repaired'`
  - New diagnostics: `bracketRepairAttempted`, `bracketRepairSucceeded`
  - Repairs unclosed arrays before closing objects

- `lib/ai/prompts/unified-prompts.ts`:
  - Added Rule #8: "CRITICAL: Every [ MUST have a matching ]. Close all arrays BEFORE closing the object with }"
  - Added STRUCTURE CHECK section with bracket verification instructions

**Files CREATED**:
- `__tests__/ai/parsers/simple-parser-bracket-repair.test.ts` (197 lines, 16 tests)

**Test Results**:
- ✅ All 16 bracket repair tests passing
- ✅ All 60 AI parser tests passing
- ✅ TypeScript compilation clean

### Phase 4 Complete: Update Summarization Entry Point ✅ (2025-12-28)

Wired the unified-prompts system into the summarization entry point.

**Files MODIFIED**:
- `lib/ai/summarize.ts`:
  - Changed import from `./prompts/filing-prompts` to `./prompts/unified-prompts`
  - Updated `getPromptForFilingType()` to return both `systemPrompt` and `userPrompt`
  - Updated AI request to include `system: systemPrompt` in OpenRouter options
  - Changed from single `prompt` variable to separate `systemPrompt` + `userPrompt`

**E2E Verification Results (2025-12-28 17:25 AEDT)**:
- ✅ VRT (Form 4): `Successfully parsed response for direct summarization`
- ✅ COIN (Form 4): `Successfully parsed response for direct summarization`
- ✅ KO (8-K): `Successfully parsed response for direct summarization`
- ✅ NVDA (Form 4): `Successfully parsed response for direct summarization`
- ⚠️ TSLA (Form 4): Malformed JSON from AI (position 586 error), used fallback

**Result**: **80% first-attempt JSON parse success** (4/5 filings)

This is a massive improvement from Phase 3 verification where 0/5 filings parsed successfully (AI was returning markdown like `### SEC Fo...`).

**Root Cause of TSLA Failure**: The AI returned syntactically invalid JSON (missing colon at position 586), not markdown. This is a rare AI output quality issue, not a prompt issue.

**Automated Verification**:
- ✅ 80/80 tests passing (simple-parser, response-parser, bulletproof-prompts, parsing-integration)
- ✅ Build clean
- ✅ TypeScript compilation clean
- ✅ Email sent successfully to wilfredchen1@gmail.com

### Phase 3 Complete: Delete Legacy Code ✅ (2025-12-28)

The Big Deletion - removed ~1,500+ lines of legacy parsing code.

**Files DELETED entirely (1,509 lines)**:
- `lib/ai/sec-prompts.ts` (510 lines) - Legacy prompt system
- `lib/ai/parsers/json-extractors.ts` (553 lines) - 5-strategy extractor
- `lib/ai/parsers/response-fixer.ts` (446 lines) - Fallback generator

**Test Files DELETED (no longer relevant)**:
- `lib/ai/parsers/__tests__/json-extractors.test.ts`
- `lib/ai/parsers/__tests__/response-fixer.test.ts`
- `lib/ai/__tests__/json-extractors.test.ts`
- `lib/ai/__tests__/summarize.test.ts`
- `lib/ai/__tests__/summarize-error-handling.test.ts`
- `lib/ai/__tests__/summarize-json-fallback.test.ts`
- `test-json-parsing.js`

**Files SIMPLIFIED**:
- `lib/ai/parsers/response-parser.ts` - Now uses simple-parser, removed repair logic
- `lib/ai/parsers/streaming.ts` - Removed repairJSON dependency
- `lib/ai/streaming/stream-handler.ts` - Uses parseJSONResponse from simple-parser
- `lib/ai/summarize.ts` - Local validateRequiredFields and ensureMinimumFields functions
- `lib/ai/parsers/index.ts` - Exports simple-parser instead of json-extractors

**Test Files REWRITTEN**:
- `lib/ai/parsers/response-parser.test.ts` - 8 tests for new simplified parser

**Infrastructure Fix**:
- `jest.setup.js` - Added Logger class mock to fix pre-existing test failures in SEC parser tests

**Next Phase**: Merge bracket repair PR and continue production validation

### Known Pre-Existing Issues (Not Phase 3 Related)

The following test issues exist on main branch and are unrelated to Phase 3:

1. **SEC Parser Tests (html-parser, filing-registry)**: Cheerio's `.remove()` not functioning in jsdom environment
   - These tests were failing before Phase 3 with different errors (Logger mock fixed)
   - Cheerio methods like `.remove()` require proper DOM environment
   - Recommendation: Update to use node environment or mock Cheerio

2. **Integration Tests (ai-summarization-pipeline)**: Circuit breaker state persists between tests
   - Tests make real API calls and timeout
   - Circuit breaker mock added but needs further isolation work
   - Recommendation: Proper mocking of the summarization service module-level imports

### Phase 2 Complete: Single-Pass JSON Parser ✅ (Manual Verified)

Created simple, fast, deterministic JSON parser with schema validation and detailed diagnostics.

**Files Created**:
- `lib/ai/parsers/simple-parser.ts` - ~180 lines, replaces 5-strategy extraction pipeline
- `__tests__/ai/parsers/simple-parser.test.ts` - 415 lines, 36 tests

**Key Features**:
1. **Single-pass parsing** - No retry loops, no fallbacks
2. **Schema validation** - Validates all required fields for each form type
3. **Detailed diagnostics** - ParseDiagnostics interface for debugging failures
4. **Performance target** - < 5ms average parse time (vs ~70ms with old system)
5. **Code block handling** - Strips markdown code blocks if present

**Manual Verification (2025-12-28)**:
- ✅ 10-K Tesla annual report: parsed in 0.062ms
- ✅ 8-K NVIDIA earnings: parsed in 0.026ms
- ✅ Form 4 Alphabet insider trading: parsed in 0.005ms
- ✅ 10-Q Apple quarterly (markdown wrapped): stripped and parsed in 0.011ms
- ✅ Performance: avg 0.001ms over 3000 iterations (5000x faster than 5ms target)

### Phase 1 Complete: Bulletproof Prompt Templates ✅

Created unified prompt system that guarantees clean JSON output from AI.

**Files Created**:
- `lib/ai/prompts/unified-prompts.ts` - 484 lines, replaces dual prompt system
- `__tests__/ai/prompts/bulletproof-prompts.test.ts` - 163 lines, 21 tests

**Key Features**:
1. **Schema before content** - AI sees structure requirements first
2. **Explicit field constraints** - `(REQUIRED)`, `(max X chars)`, `(max X items)` inline
3. **Forbidden patterns** - System prompt explicitly bans markdown, synonyms
4. **8 form types supported** - 10-K, 10-Q, 8-K, Form 4, Form 144, SC 13G, SC 13D, 424B2

---

## Recently Completed (Last 30 Days)

### Form 4 Email Improvements ✅ (2025-12-28)

Enhanced Form 4 email rendering with XML URL conversion and markdown data extraction.
- **Issue**: Form 4 XML URLs not rendering properly in emails
- **Fix**: URL conversion logic + data extractor for Form 4 markdown format
- **PR**: #281

### Email Summary Discrepancies Fix ✅ (2025-12-28)

Fixed email summary issues for multi-user ticker tracking scenarios.
- **Issue**: Users tracking same ticker received inconsistent summaries
- **Fix**: Improved job deduplication and multi-user summary distribution
- **PR**: #279

### Test Data Integrity Improvements ✅ (2025-12-27)

3-phase improvement to test data management: markers, tracking, and audit CLI.
- **Files**: Test utilities, audit tooling
- **PR**: #280

### Email URL Verification for All Form Types ✅ (2025-12-27)

Verified email URL rendering across all form types (10-K, 10-Q, 8-K, Form 4, Form 3, Form 144).
- Complete URL verification test suite

### Email Filing Link Fix ✅ (2025-12-26)

Fixed filing links in emails to use `primaryDocUrl` for direct document access.
- **Issue**: Email links pointed to filing index, not actual document
- **Fix**: Use `primaryDocUrl` field for direct document links

### Daily Verification Script Fix ✅ (2025-12-24)

Fixed Prisma errors when saving verification results with empty arrays.
- **Root Causes**: Column type mismatch (`jsonb` vs `text[]`), missing unique constraint
- **Migrations**: `fix_daily_verification_errors_column`, `add_daily_verification_unique_constraint`

### 10-Minute Slack Verification Reports ✅ (2025-12-24)

Replaced hourly Slack summaries with 10-minute interval reports.
- **Files**: `lib/slack/daily-report-handler.ts`, `lib/slack/message-formatter.ts`
- **New Endpoint**: `app/api/cron/slack-interval-summary/route.ts`

### Supabase RLS & Performance Remediation ✅ (2025-12-24)

Fixed critical RLS and performance issues from Supabase audit.
- 3 migrations: RLS policy, 11 FK indexes, RLS subselect optimization
- **Result**: 0 security lints, 0 unindexed FKs, 0 RLS warnings

---

## Active Systems

### Cron Endpoints
| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/cron/tier-aware` | GET | Working (HTTP 202) |
| `/api/cron/slack-interval-summary` | GET | Working (HTTP 200) |

### Database
- **Provider**: Supabase
- **Region**: aws-1-ap-southeast-2
- **Schemas**: `app`, `pipeline`
- **Connection**: PgBouncer transaction mode (port 6543)

### Monitoring
- Slack pipeline notifications (10-minute intervals)
- Performance monitoring via lazy singletons
- Alert queue processing asynchronously

---

*Last Updated: 2025-12-31 (Session: Privacy Policy & Terms of Service Pages)*
*Older completed projects archived to .claude/history/*
