# Current Progress: tldrsec-ai Pipeline Operations

## Current Status
**Date**: 2026-01-03
**Branch**: feature/premium-pricing-update-199-349
**Status**: ✅ COMPLETE - Premium Pricing Update ($199 Pro / $349 Max)

---

## Current Session: Premium Pricing Update ($199 Pro / $349 Max)

### Completed: Premium Pricing Update ✅ COMPLETE (2026-01-03)

**Plan**: [2026-01-02-premium-pricing-update-199-349.md](docs/plans/2026-01-02-premium-pricing-update-199-349.md)

**Overview**: Updated pricing tiers from $99/$139 to $199/$349 with enhanced value proposition (25 tickers for Pro, ALL filing types).

**All Phases Completed**:
- ✅ **Phase 1**: Core pricing configuration updated in `lib/stripe.ts`
  - Pro: $199/mo, $1990/yr, 25 tickers, ALL filing types
  - Max: $349/mo, $3490/yr, unlimited tickers, ALL filing types
  - 21 pricing tests pass
- ✅ **Phase 2**: Billing page refactored to use centralized SUBSCRIPTION_PLANS
  - Removed duplicate AVAILABLE_PLANS constant (had wrong pricing $9/$29/$139)
  - Created `getBillingPlans()` helper using SUBSCRIPTION_PLANS
  - Verified: $0/$199/$349 displays correctly on landing and billing pages
- ✅ **Phase 3**: Regression testing and documentation
  - Updated `docs/stripe-setup-guide.md` with new pricing
  - Updated `DEPLOYMENT_GUIDE.md` with new pricing
  - Updated `app/api/user/subscription/route.ts` comment
  - All pricing tests pass (21/21)

**Files Modified**:
- `lib/stripe.ts:58-91` - Updated SUBSCRIPTION_PLANS with new pricing
- `__tests__/config/stripe-pricing.test.ts` - Updated test expectations
- `app/dashboard/billing/page.tsx` - Refactored to use SUBSCRIPTION_PLANS
- `docs/stripe-setup-guide.md` - Updated pricing documentation
- `DEPLOYMENT_GUIDE.md` - Updated pricing documentation
- `app/api/user/subscription/route.ts` - Updated comment

---

## Previous Session: Passwordless Onboarding Implementation

### Phase 2 Complete - EmailStep Component & 3-Step Flow ✅ COMPLETE (2026-01-01)

**Plan**: [2026-01-01-passwordless-onboarding-implementation.md](docs/plans/2026-01-01-passwordless-onboarding-implementation.md)

**Overview**: Implementing passwordless onboarding flow where users complete sector/ticker selection BEFORE authentication. Users input email as final step, then redirect to Clerk for sign-up.

**Completed Phases**:
- ✅ **Phase 1**: PendingOnboarding database model created and tested (5/5 tests pass)
- ✅ **Phase 2**: EmailStep component created, onboarding page updated to 3-step flow

**Phase 1 - Database Model**:
- Created `PendingOnboarding` model in Prisma schema
- Fields: `id`, `email` (unique), `sectors[]`, `tickers` (JSON), `createdAt`, `expiresAt`
- Migration applied to production database
- Tests: `npm run test:db:pending` (5/5 passing)

**Phase 2 - EmailStep Component & UI**:
- Created `components/onboarding/email-step.tsx` - Standalone email input component
- Created `__tests__/components/onboarding-email-step.test.tsx` - 9 tests (all passing)
- Updated `app/(auth)/onboarding/page.tsx`:
  - Changed from 2-step to 3-step flow
  - Progress calculation: 0% → 33% → 66% → 100%
  - Step 2 button: "Get Started" → "Continue"
  - Added Step 3 with EmailStep component

**Files Modified**:
- `prisma/schema.prisma` - Added PendingOnboarding model
- `components/onboarding/email-step.tsx` - New EmailStep component
- `__tests__/components/onboarding-email-step.test.tsx` - 9 component tests
- `__tests__/db/pending-onboarding.test.ts` - 5 database integration tests
- `app/(auth)/onboarding/page.tsx` - Updated to 3-step flow
- `jest.config.mjs` - Added setupFiles for dotenv loading
- `__tests__/setup-integration.js` - New setup file for env loading
- `package.json` - Added `test:db` and `test:db:pending` scripts

**Pending Phases**:
- [ ] Phase 3: Make onboarding public, add check-email API
- [ ] Phase 4: Save pending onboarding API, Clerk redirect
- [ ] Phase 5: Clerk webhook integration for pending data merge
- [ ] Phase 6: Welcome summary delivery
- [ ] Phase 7: Existing user merge modal
- [ ] Phase 8: Cleanup cron job

**Verification**:
- ✅ EmailStep tests: 9/9 passing
- ✅ PendingOnboarding DB tests: 5/5 passing
- ✅ Build passes
- ✅ Lint passes

---

## Recently Completed

### Gmail Inbox Hero Responsive Fix ✅ COMPLETE (2026-01-01)

**Issue**: Gmail inbox hero component overflowing viewport on mobile, appearing as square instead of landscape rectangle.

**Root Cause**: Fixed width calculation (`min(95vw, max(500px, 60vw))`) and tall height constraints (`clamp(300px, 50vh, 560px)`) caused overflow and square appearance.

**Fixes Applied**:
1. **Container sizing** - Changed to `width: 100%` with `maxWidth: min(95vw, 900px)`
2. **Landscape ratio** - Reduced height to `clamp(220px, 35vh, 340px)` for wide-than-tall appearance
3. **Mobile-first email rows** - Responsive padding (`px-2 sm:px-4`), gaps (`gap-2 sm:gap-3`)
4. **Hidden elements on mobile** - Unread indicator, filing badge, time column hidden on small screens
5. **Compact header/toolbar/footer** - Smaller fonts, padding, hidden archive/delete buttons on mobile
6. **Responsive skeleton loader** - Matching responsive widths for loading state

**Files Modified**:
- `components/landing/sections-v2/gmail-inbox-hero.tsx` - All responsive changes

**Verification**: ✅ Lint passes, no errors

---

### Active: Dashboard Landing V2 Redesign ⏳ IN PROGRESS (2026-01-01)

**Issue**: Dashboard UI needs to visually align with Landing Page V2 design system.

**Implementation Progress**:
- ✅ Phase 1: Sidebar Navigation Styling - Already complete (uses `--landing-primary` CSS variables)
- ✅ Phase 2: Dashboard Layout Background - Applied `--landing-bg` to main content area, `--landing-border` to sidebar
- ✅ Phase 3: Dashboard Card Components - Updated `DashboardCard` and `dashboard-client.tsx` to use `landing-card` class
- ✅ Phase 4: Billing Page Styling - Updated skeleton colors, recommended plan border (blue ring), badge colors

**Files Modified**:
- `app/dashboard/layout.tsx` - Added Landing V2 background colors
- `components/layout/sidebar.tsx` - Added Landing V2 border color
- `components/dashboard/card.tsx` - Changed to use `landing-card` class
- `components/dashboard/dashboard-client.tsx` - Replaced Card with `landing-card` div
- `app/dashboard/billing/page.tsx` - Updated skeleton/plan colors to Landing V2

**Verification**: ✅ Build passes, ✅ Lint passes, awaiting manual verification

---

### Previous: Admin Status API Route Fix ✅ COMPLETE (2026-01-01)

**Issue**: Console error on `/dashboard` - 404 on `/api/user/admin-status` endpoint.

**Root Cause**: The route file was disabled (`route.ts.disabled`) but the `useAdminStatus` hook was still trying to fetch it.

**Fix Applied**:
- Renamed `app/api/user/admin-status/route.ts.disabled` to `route.ts` to re-enable the endpoint
- Verified dependencies exist: `validateAdminAccess` from `@/lib/auth/admin-security`, `logger` from `@/lib/logging`
- Lint passes with no errors

**Files Modified**:
- `app/api/user/admin-status/route.ts` - Re-enabled (renamed from `.disabled`)

**Verification**: ✅ Lint passes, route enabled

---

### Previous: Pricing Section Layout Shift Fix ✅ COMPLETE (2026-01-01)

**Issue**: Pricing section toggle causing layout shifts when switching between monthly/annual billing. Toggle slider also appearing on wrong side (right instead of left) on initial load.

**Root Cause**:
- Price container width changed with different digit counts ($99 vs $990 vs $1,390)
- Savings badge appearing/disappearing caused horizontal shift
- Toggle knob using `translate-x-8` which exceeded container bounds
- Monthly equivalent text height animation caused vertical shift

**Fixes Applied**:
1. **Fixed-width digits container** - Added `minWidth: '5.5ch'` to accommodate up to "1,390" (5 characters)
2. **Fixed-width individual digits** - Each digit has `width: 0.6em` (or `0.35em` for comma)
3. **Fixed-width suffix** - Added `minWidth: '4.5rem'` for "/year" or "/month"
4. **Savings badge on separate line** - Moved to own row with fixed `h-5` height
5. **Toggle positioning fix** - Changed from `w-14 h-7` to `w-12 h-6`, knob from `translate-x-8`/`translate-x-1` to `translate-x-6`/`translate-x-0`
6. **Fixed height price container** - Changed from `min-h-[72px]` to fixed `h-[88px]`
7. **Opacity-only animations** - Monthly equivalent text uses opacity-only, no height animation

**Files Modified**:
- `components/landing/sections-v2/animated-price.tsx` - Fixed-width containers, savings badge on separate line
- `components/landing/sections-v2/pricing-section-v2.tsx` - Toggle sizing fix, fixed height containers

**Verification**: ✅ Lint passes, toggle starts on LEFT (monthly), no layout shifts

---

### Previous: Pricing Section Grok-Style Redesign ✅ COMPLETE (2025-12-31)

**Issue**: Pricing section toggle and display needed modernization inspired by Grok's subscription page.

**Changes**:
1. **Grok-style toggle** - Custom toggle button with "Save with yearly billing" label
2. **Annual pricing display** - Shows full annual price ($990 USD/year) with "Save X%" badge in orange
3. **Monthly equivalent** - Helper text showing "$83/mo billed annually"
4. **Updated card layout** - Popular badge inline, CTA after price, "Everything in Free/Pro" footer
5. **Copy updates** - "Current Plan" (disabled), "Upgrade to Pro", "Upgrade to Max"
6. **AnimatedPrice component** - Grok-inspired individual digit animation with direction awareness

**Files Modified**:
- `components/landing/sections-v2/pricing-section-v2.tsx` - Complete Grok-inspired redesign
- `components/landing/sections-v2/animated-price.tsx` - New animated price component

**Verification**: ✅ Lint passes, no errors

---

### Previous: Schedule 13G/D Email Link Fix ✅ COMPLETE (2025-12-31)

**Issue**: Four UI/UX issues with SEC filing summary pages:
1. 13G filing shows "SCHEDULE" instead of "SCHEDULE 13G" - poor UX
2. Border around summary div too prominent
3. Text misaligned with header text
4. Filing link redirects to index page instead of actual filing document

**Root Cause**:
- `formatFilingType()` function didn't handle Schedule 13G/D variants
- Database stores filings as "SCHEDULE" without the "13G" suffix
- Email URLs for Schedule 13G/D pointed to `-index.htm` (filing detail pages) instead of XSLT-rendered documents
- SEC Schedule 13G/D filings use specific stylesheets at `xslSCHEDULE_13G_X01/primary_doc.xml`

**Fixes Applied**:
1. **Added Schedule 13G/D to formatFilingType()** - Both `summary-card.tsx` and `app/summary/[id]/page.tsx` now handle Schedule 13G/D variants
2. **Removed summary div border** - Changed from `bg-white rounded-lg shadow p-6` to `rounded-lg p-6`
3. **Added text alignment padding** - Added `pl-10` to align text with header
4. **Smart URL conversion for Schedule 13 filings** - Updated `getSecFilingViewerUrl()` to:
   - Detect Schedule 13G/D filings via `isSchedule13Type()` helper
   - Convert `-index.htm` URLs to `xslSCHEDULE_13G_X01/primary_doc.xml` format
   - Added stylesheet directory mapping in `getXsltStylesheetDir()`

**Files Modified**:
- `lib/email/url-utils.ts` - Added Schedule 13G/D stylesheet support, `isSchedule13Type()` helper, index-to-document URL conversion
- `app/summary/[id]/page.tsx` - Added `formatFilingType()`, imported `getSecFilingViewerUrl`, removed border, added alignment
- `components/summary/summary-card.tsx` - Added Schedule 13G/D cases to `formatFilingType()`

**Verification**: ✅ Test emails sent, ✅ URLs return 200 status, ✅ User confirmed "working now"

---

### Previous: PREMIUM → MAX Tier Rename ✅ COMPLETE (2025-12-30)

**Issue**: Rename "Premium" tier to "Max" tier across the codebase for consistency with new pricing structure ($0 Free / $99 Pro / $139 Max).

**Fixes Applied**:
1. **Updated pricing-section.tsx** - Changed PlanKey type, planIcons, planGradients, planBorders mappings from PREMIUM to MAX
2. **Updated upgrade-cta-section.tsx** - Changed currentPlan type and UI text ("Go Max", "Start Max - $139/mo")
3. **Updated subscription-plans.tsx** - Updated getPlanPrice mapping (MAX: '$139')
4. **Updated rbac.ts** - Renamed UserRole.PREMIUM_USER to UserRole.MAX_USER, updated permission matrix
5. **Updated subscription-validation.ts** - Added MAX to Zod enums for backwards compatibility
6. **Updated subscriptionService.ts** - Added MAX mapping to tier mappings
7. **Updated stripe-pricing.test.ts** - Renamed test suite from "Premium Tier" to "Max Tier"
8. **Updated secure-test-utils.ts** - Updated mock UserRole

**Files Modified**:
- `components/landing/sections/pricing-section.tsx`
- `components/dashboard/upgrade-cta-section.tsx`
- `components/billing/subscription-plans.tsx`
- `lib/security/rbac.ts`
- `lib/validation/subscription-validation.ts`
- `services/filings/enhanced/subscriptionService.ts`
- `__tests__/config/stripe-pricing.test.ts`
- `__tests__/utils/secure-test-utils.ts`

**Verification**: ✅ Build passes, ✅ 16 Stripe pricing tests pass

---

### Previous: Form 144 Email Metrics Enhancement ✅ COMPLETE (2025-12-30)

**Issue**: Form 144 email metrics cards showing only estimated value, not shares. Also missing "Amount of Securities Beneficially Owned Following Reported Transaction(s)" field.

**Fixes Applied**:
1. **Redesigned metrics cards** - Now shows 2 side-by-side cards: "Shares to Sell" and "Estimated Value" (both equally prominent)
2. **Added remaining holdings display** - New card showing "Shares Remaining After Sale" when available
3. **Enhanced AI schema** - Added `remainingHoldings` field to Form 144 extraction schema
4. **Updated extraction guidance** - AI now explicitly extracts "Amount of Securities Beneficially Owned Following Transaction"
5. **Added data extractor patterns** - New `extractRemainingHoldings()` function with 7 regex patterns

**Files Modified**:
- `lib/ai/prompts/unified-prompts.ts:303-306` - Added `remainingHoldings` schema field + extraction guidance
- `lib/email/form144-data-extractor.ts:20,38,74,340-367` - Added interface field + extraction function
- `components/ui/email/templates/form144-minimalist-template.tsx:180,294-443` - Redesigned metrics cards layout

**New Layout**:
```
┌─────────────────────┐  ┌─────────────────────┐
│ SHARES TO SELL      │  │ ESTIMATED VALUE     │
│ 40,000              │  │ $9.9M               │
│ @ $248/share        │  │ 15% of holdings     │
└─────────────────────┘  └─────────────────────┘

┌─────────────────────────────────────────────┐
│ SHARES REMAINING AFTER SALE                 │
│ 1,500,000                                   │
│ Amount of Securities Beneficially Owned...  │
└─────────────────────────────────────────────┘
```

**Verification**: ✅ Lint passes, code compiles

---

### Previous: Email Filing URL Exhibit Exclusion Fix ✅ COMPLETE (2025-12-30)

**Issue**: Email filing links pointing to wrong documents:
1. 10-K redirected to exhibit file (`d13958dex21.htm`) instead of main document
2. Form 4 redirected to filing detail page (index) instead of XML document

**Root Cause**: `extractPrimaryDocumentUrl()` in fetch-handler.ts was selecting exhibit files alphabetically before main documents. It simply picked the first HTM file that wasn't an index.

**Fix Applied**:
1. Added `isExhibitFile()` helper - Detects exhibit patterns via regex (`ex21`, `exh31`, `dex21`, `-ex31`, `exhibit`)
2. Added `isMainDocument()` helper - Identifies main documents (ticker-YYYYMMDD.htm pattern)
3. Implemented priority-based selection:
   - Priority 1: Main document pattern (non-exhibit)
   - Priority 2: Any non-exhibit HTM file
   - Priority 3: Fallback to first HTM (may be exhibit)

**Files Modified**:
- `lib/cron/handlers/fetch-handler.ts:556-605` - New extraction logic with exhibit exclusion

**Verification**:
- ✅ Tested extraction with real SEC 8-K filing - correctly selected `d13958d8k.htm` over `d13958dex21.htm`
- ✅ 6 test emails sent for all form types
- ✅ Fix applies to NEW filings (existing incorrect URLs remain until cache expires)

---

### Previous: Cloudflare Cron Trigger Restoration & Backfill ✅ COMPLETE (2025-12-30)

**Issue**: SEC filing pipeline was not discovering new filings - 0 filings discovered in last 24 hours vs 35 on SEC EDGAR.

**Root Cause**: Cloudflare Worker cron triggers stopped firing after Dec 27 deployment. TickerMonitoring `lastChecked` timestamps showed most tickers hadn't been checked since Dec 4 (26 days stale).

**Fix Applied**:
1. **Redeployed Cloudflare Worker** with `npx wrangler deploy`
2. **Deployed cron triggers explicitly** with `npx wrangler triggers deploy` (15-min propagation)
3. **Verified via wrangler tail** - cron firing at 01:55 UTC, full 5-step pipeline executing
4. **Created backfill script** for 379 unprocessed RssFilingCheck records
5. **Fixed schema error** in backfill script (`maxAttempts` → `maxRetries`)
6. **Ran backfill** - created 413 fetch jobs for tracked tickers (VRT, COIN, TSLA, etc.)

**Files Created/Modified**:
- `scripts/backfill-unprocessed-filings.ts` - NEW: Backfill script for missed filings
- `cloudflare-cron/wrangler.toml` - Verified cron config (*/5, */10, 0 22 * * *)

**Pipeline Status After Fix**:
- 408 pending fetch jobs (down from 413)
- 4 new summaries created today (VRT, COIN)
- Emails sent for new summaries
- Est. backlog clearance: ~68 hours at current rate

**Verification**:
- ✅ Cron triggers firing (confirmed via wrangler tail)
- ✅ Jobs processing (completed count increasing)
- ✅ Summaries being created (4 new today)
- ✅ Emails being sent

---

### Previous: Form 4 Email Value Display & Mobile-First Fix ✅ COMPLETE (2025-12-30)

**Issue**: TSLA Form 4 email showing:
1. SOLD transaction showing $0 instead of $25.6M
2. Gift container too large relative to sale container
3. Gift showing "15,242 shares" instead of dollar value ($0)

**Root Causes**:
- `aggregateTransactionsByType()` was using `totalValue` even when it was $0 (missing value from AI)
- Gift transactions displayed shares instead of dollar value
- Containers used fixed widths that didn't scale well on mobile

**Fixes Applied**:
1. **Improved value calculation** - When `totalValue` is $0 for non-gift transactions, calculate from `shares * price` instead
2. **Unified value display** - All transaction types (sale, gift, purchase) now show dollar value as primary, shares as secondary
3. **Mobile-first responsive design** - Percentage-based widths (48% for 2 items, 31% for 3 items), reduced padding (16px)
4. **Enhanced data extraction** - New pattern to extract "fetching $X million" from AI summaries

**Files Modified**:
- `components/ui/email/templates/form4-minimalist-template.tsx` - Value calculation fix, display unification, responsive layout
- `lib/email/form4-data-extractor.ts` - Added `saleWithTotalPatterns` for explicit total value extraction

**Verification**:
- ✅ Build compiles successfully
- ✅ All 6 form type test emails sent (10-K, 10-Q, 144, Form 3, Form 4, 8-K)
- ✅ URL verification passed for all form types

---

### Previous: Form 4 Multi-Transaction Cards & Links Fix ✅ COMPLETE (2025-12-30)

**Issue**: Two Form 4 email issues reported:
1. Multi-transaction cards not showing for Form 4s with multiple transactions
2. Filing links not redirecting to actual filing documents

**Root Cause 1 (Multi-Transaction)**: `summaryJSON` data containing transactions array was being discarded by setting `rawData: undefined` in FilingSummaryResult. The email template expected `data?.transactions` but received empty object.

**Root Cause 2 (Template Type Error)**: Form 4 template assumed `tx.shares` was always a string (for `.replace()`), but AI models sometimes return numbers.

**Fixes Applied**:
1. **Pass summaryJSON through rawData** - Modified `filingSummaryService.ts` line 567 to pass `rawData: { summaryJSON: summaryJSON.summaryJSON }` instead of `undefined`
2. **Include rawData in cached summaries** - Modified `filingDatabase.ts` to include `rawData: summaryJSON ? { summaryJSON } : undefined` when retrieving cached summaries
3. **Add parseNumericValue() helper** - New robust parser handles both string ("1,234", "$1.5M") and number types
4. **Update TransactionData interface** - Changed `shares`, `pricePerShare`, `totalValue` from `string` to `string | number`

**Files Modified**:
- `services/filings/summaries/filingSummaryService.ts` - Pass rawData with summaryJSON
- `services/filings/database/filingDatabase.ts` - Include rawData and filingUrl in cached results
- `components/ui/email/templates/form4-minimalist-template.tsx` - Type-safe numeric parsing

**Verification**:
- ✅ Build passes
- ✅ URL utils tests pass (16/16)
- ✅ E2E test passes - 5/5 summaries generated, email sent successfully

---

### Previous: Cloudflare Cron Trigger Fix ✅ COMPLETE (2025-12-29)

**Branch**: `fix/cloudflare-cron-trigger-restoration`

Fixed Cloudflare Worker cron triggers that stopped executing after Dec 27 deployment. Added monitoring to detect future failures.

**Root Cause**: Cron triggers became detached from Worker after deployment - required explicit `wrangler triggers deploy`.

**Fix Applied (Phase 2)**:
- Redeployed worker with `npx wrangler deploy` (version 2fe93112)
- Explicitly deployed triggers with `npx wrangler triggers deploy`
- Verified 64+ jobs created post-deployment

**Monitoring Added (Phase 5)**:
- Added `/health` endpoint at `https://cloudflare-cron.wilfred-chen-python.workers.dev/health`
- Returns JSON with heartbeat status, staleness detection, worker version
- Added `[HEARTBEAT]` logging for diagnostics via `wrangler tail`
- Version bump to `2.5.0-stable`

**Files Modified**:
- `cloudflare-cron/index.js` - Health endpoint + heartbeat logging
- `cloudflare-cron/wrangler.toml` - Version bump to 2.5.0-stable
- `docs/plans/2025-12-29-cloudflare-cron-trigger-fix.md` - Implementation complete

**Verification**:
- ✅ 65+ jobs created since initial deployment (04:23 UTC)
- ✅ Health endpoint responding with monitoring data
- ✅ All cron schedules active: `*/5`, `*/10`, `0 22 * * *`

---

### Previous: Email Summary Quality Improvements ✅ COMPLETE (2025-12-29)

**Branch**: `fix/email-summary-quality-improvements`

Addressed 4 email quality issues with SEC filing summaries:

1. **Markdown Prevention in AI Output**
   - Problem: AI summaries contained `####` and `###` markdown that appeared as artifacts in emails
   - Solution: Added explicit markdown prohibition rules to SYSTEM_PROMPT in unified-prompts.ts
   - Added newsletter-style writing guidance (Morning Brew/Bloomberg tone)
   - File: `lib/ai/prompts/unified-prompts.ts`

2. **Smart XML URL Construction**
   - Problem: Form 3/144 XML filing links led to raw XML files without styling
   - Solution: Detect XML files without XSLT stylesheets and inject proper stylesheet paths
   - Form 3/4/5: Use `xslF345X05` stylesheet
   - Form 144: Use `xsl144X01` stylesheet
   - Files: `lib/email/url-utils.ts`, 6 email templates updated

3. **8-K Schema Enhancement**
   - Problem: 8-K summaries missing sentiment analysis and key highlights
   - Solution: Added `sentiment` (enum), `keyHighlights` (array), `managementCommentary`, `forwardGuidance` fields
   - Enhanced extraction guidance for specific Item numbers (2.02, 7.01, 8.01, 5.02)
   - Files: `lib/ai/prompts/unified-prompts.ts`, `lib/email/templates.ts`

**Tests Added**: 28 new tests (unified-prompts-formatting, url-utils, 8k-schema)
**Verification**: ✅ 64 tests passing, ✅ Build compiles, ✅ Lint passes

---

### Previous: Form 4 Email Template Fixes ✅ COMPLETE (2025-12-29)

**Branch**: `feature/json-parsing-phase5-monitoring`

Fixed 5 issues with Form 4 email templates identified during E2E testing:

1. **Filing URLs - Direct Document Links**
   - Problem: "View Full Filing" links went to `-index.html` instead of actual documents
   - Solution: Updated `getSecFilingViewerUrl()` to pass through XML/HTML URLs directly
   - File: `lib/email/url-utils.ts`

2. **NVDA Summary Truncation Fix**
   - Problem: Headline showed only "NVDA Director Mark A." (truncated)
   - Solution: Use full summary when headline is < 30 chars
   - File: `components/ui/email/templates/form4-minimalist-template.tsx`

3. **VRT Raw JSON in Summary** (Prior session fix)
   - Problem: Fallback displayed raw JSON instead of formatted text
   - Solution: Extract summary field from malformed JSON using regex
   - File: `lib/ai/summarize.ts`

4. **Gift Transaction Display - Purple Styling**
   - Problem: Gifts showed as "SOLD" with red background
   - Solution: Added `isGiftTransaction()` helper and purple color scheme (🎁 #7C3AED)
   - File: `components/ui/email/templates/form4-minimalist-template.tsx`

5. **Multi-Transaction Display (Sale + Gift)**
   - Problem: Only first transaction shown in graphic div
   - Solution: Redesigned to show up to 2 transactions side-by-side
   - File: `components/ui/email/templates/form4-minimalist-template.tsx`

**Verification**: ✅ Lint passes, ✅ E2E test passes (5/5 tickers, email sent)

---

### Previous: JSON Bracket Repair ✅ COMPLETE (2025-12-29)

**Branch**: `fix/json-bracket-repair` (merged)

Fixed intermittent JSON parsing failures caused by AI models forgetting to close arrays before closing objects.

**Root Cause**: Grok 4.1-fast has ~40% failure rate producing malformed JSON where it forgets `]` before final `}`.

**Solution**:
- Added `attemptBracketRepair()` function in `lib/ai/parsers/simple-parser.ts`
- Enhanced system prompt with explicit bracket closing instructions
- 16 comprehensive tests covering repair scenarios

**Test Results**: All 60 AI parser tests passing.

---

## Quick Reference

### User-Tracked Tickers (13 total)
COIN, KO, VRT, AAPL, AMZN, BRK-B, CMG, GOOG, GOOGL, NFLX, NVDA, TSLA, V

### Key Commands
```bash
# Daily Pipeline Verification
npm run verify:daily                      # Verify yesterday + remediate
npm run verify:daily:no-remediation       # Dry-run

# Comprehensive Pipeline Testing
npm run test:pipeline:comprehensive       # Full validation (~28s)
npm run test:e2e:all-tickers:skip-email   # E2E without email

# Log Monitoring
cd cloudflare-cron && npx wrangler tail --format=pretty

# Cloudflare Worker Deployment
npm run cloudflare:deploy                 # Deploy to production
npm run cloudflare:status                 # Check deployment status
```

### Pipeline Architecture
**5-Step Cron Pipeline** (every 10 minutes via Cloudflare Worker):
1. **Step 0**: Cleanup expired locks (`/api/cron/cleanup-locks`)
2. **Step 1**: Discover new filings (`/api/cron/tier-aware?step=discover`)
3. **Step 1.5**: Process discovery jobs (`/api/cron/tier-aware?step=discover-jobs`)
4. **Step 2**: Fetch filing content (`/api/cron/tier-aware?step=fetch`)
5. **Step 3**: Generate summaries (`/api/cron/tier-aware?step=summarize`)

**Key Files**:
- `cloudflare-cron/index.js` - Cron orchestrator
- `lib/cron/handlers/discovery-handler.ts` - Filing discovery
- `lib/cron/handlers/summarize-cached-handler.ts` - AI summarization
- `lib/job-queue/index.ts` - Job queue with raw SQL fixes
- `lib/job-queue/lock-service.ts` - Distributed locking

---

## Archive Index (Detailed History)

| Week | Archive | Highlights |
|------|---------|------------|
| Dec 22-31 | [22-Dec-2025.md](.claude/history/2025/Dec/22-Dec-2025.md) | Supabase cutover, email link fixes, test data integrity |
| Dec 15-18 | [15-Dec-2025.md](.claude/history/2025/Dec/15-Dec-2025.md) | Slack bot, lock cleanup, discovery fixes |
| Dec 9-14 | [08-Dec-2025.md](.claude/history/2025/Dec/08-Dec-2025.md) | Prisma bug fix, orphaned jobs, cascade delete |
| Dec 1-8 | [01-Dec-2025.md](.claude/history/2025/Dec/01-Dec-2025.md) | Email phases 1-3, daily verification |
| Nov 10-16 | [10-Nov-2025.md](.claude/history/2025/Nov/10-Nov-2025.md) | Landing page, debug PR system |
| Nov 3-9 | [03-Nov-2025.md](.claude/history/2025/Nov/03-Nov-2025.md) | Security fixes, CI/CD |
| Oct 27-Nov 2 | [27-Oct-2025.md](.claude/history/2025/Oct/27-Oct-2025.md) | Newsletter, security, MCP |

---

**Last Updated**: 2026-01-03 08:15 AEDT (context compaction performed)
**Repository**: tldrsec-ai

*See TIMELINE.md for master timeline and quick navigation*
