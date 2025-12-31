# Project Progress

**Date**: 2025-12-31
**Branch**: feature/gmail-inbox-hero-improvements
**Status**: Pipeline HEALTHY - Gmail Inbox Hero improvements in progress

---

## Current Session: Gmail Inbox Hero Improvements

Enhancing the interactive Gmail-style inbox hero section on the landing page.

### Changes Implemented
1. **Slower Animation from Distance** - Spring animation (0.8s, stiffness: 100, damping: 15)
   - Initial emails: `x: -120, y: 80` (slide from distance)
   - New deliveries: `y: -100` (drop from above like mailbox)

2. **Larger Container** - Increased from 420px to 560px

3. **Sort by Date** - Emails sorted by descending date (newest first)

4. **CTA Fix** - Changed link from `/onboarding` to `/sign-in`

5. **Select All Checkbox** - Full functionality with indeterminate state

6. **Read/Unread State** - Track clicked emails; visual distinction (unread = blue tint)

7. **Dynamic Delivery Animation** - Start with 3 emails, add new one every 1-30s (random) until 10 max

8. **"X new" Badge Sync** - Shows actual unread count

### Files Modified
- `components/landing/sections-v2/gmail-inbox-hero.tsx` - All improvements

### Verification
- ✅ Build succeeds
- ✅ ESLint passes for our file

---

## Previous Session: Gmail Inbox Hero - Initial Implementation ✅ (2025-12-31)

Combined "Summaries that Actually Matter" section with hero, creating interactive Gmail-style inbox UI.

**Files Created**:
- `components/landing/sections-v2/gmail-inbox-hero.tsx` - 15 curated real summaries, EmailRow + EmailDetailPanel components

**Top 5 Curated Summaries**: TSLA ($1tn pay vote), GOOGL ($17.5B bonds), NVDA (Jensen Huang sales), CMG (Q3 traffic), VRT (AI infrastructure)

---

## Previous Session: Privacy Policy & Terms of Service ✅ (2025-12-31)

**Files Created**: `app/privacy/page.tsx`, `app/terms/page.tsx`
**Files Modified**: `components/landing/sections-v2/footer-section-v2.tsx` (updated legal links)

---

## Previous Session: Onboarding Page UI Fixes ✅ (2025-12-31)

1. **Nav bar hidden on onboarding** - Modified `app/(auth)/layout.tsx` to conditionally render Navigation
2. **Lighter card borders** - Changed to `border-gray-200` in `app/(auth)/onboarding/page.tsx`

---

## Previous Session: Landing Page V2 Redesign ✅ (2025-12-31)

Complete 8-phase TDD implementation with light theme, Stripe-inspired design, A/B testing.

**Key Features**: Light theme (#0079F2), mesh gradient, Z-pattern hero, billing toggle
**Files Created**: 8 new components in `components/landing/sections-v2/`, animations in `lib/animations/`
**Tests**: 52/52 passing

---

## Previous Session: Onboarding Page jsdom Fix ✅ (2025-12-31)

**Issue**: `SharedArrayBuffer is not defined` crash from jsdom being bundled into client
**Fix**: Changed imports to use `notification-types.ts` instead of `notification-service.ts`

---

## Previous Session: Email URL Fix - Revert XSLT ✅ (2025-12-31)

**Issue**: Filing links returned 404 due to SEC XSLT stylesheet variability
**Fix**: Reverted to `-index.htm` URLs which are always reliable
**File**: `lib/email/url-utils.ts`

---

## Previous Session: Form 4 Email Data Corruption Fix ✅ (2025-12-31)

**Issue**: COIN Form 4 showed "BOUGHT $2.0M, 0 shares" instead of "sold 7,375 shares for $1.97M"
**Fixes**: Transaction deduplication, text-based sale detection, improved `isSaleTransaction()`
**Files**: `lib/email/form4-data-extractor.ts`, `components/ui/email/templates/form4-minimalist-template.tsx`

---

## Recently Completed (Last 30 Days)

### Cloudflare Event Drop Investigation ✅ (2025-12-30)
4-hour pipeline outage from cron schedule failure. Fixed with `wrangler deploy`.
**Preventive measures**: Health endpoint, circuit breaker visibility, monitoring runbook.

### JSON Parsing Pipeline Simplification ✅ (2025-12-28 to 2025-12-29)
Replaced 2,500 lines of parsing code with ~300 lines of bulletproof prompts.
- Phase 1: Unified prompts (`lib/ai/prompts/unified-prompts.ts`)
- Phase 2: Simple parser (`lib/ai/parsers/simple-parser.ts`)
- Phase 3: Deleted 1,500+ lines legacy code
- Phase 4: Wired into summarization entry point (80% first-attempt success)
- Phase 5: Production monitoring (`lib/monitoring/json-parsing-monitor.ts`)

### Form 4 Email Improvements ✅ (2025-12-28)
XML URL conversion + markdown data extractor. PR #281.

### Email Summary Discrepancies Fix ✅ (2025-12-28)
Multi-user ticker tracking fixes. PR #279.

### Test Data Integrity Improvements ✅ (2025-12-27)
3-phase: markers, tracking, audit CLI. PR #280.

### Email URL Verification ✅ (2025-12-27)
Verified all form types (10-K, 10-Q, 8-K, Form 4, Form 3, Form 144).

### Email Filing Link Fix ✅ (2025-12-26)
Use `primaryDocUrl` for direct document links.

### Daily Verification Script Fix ✅ (2025-12-24)
Prisma serialization fix, migrations for column type and unique constraint.

### 10-Minute Slack Verification Reports ✅ (2025-12-24)
Replaced hourly Slack summaries with 10-minute intervals.

### Supabase RLS & Performance Remediation ✅ (2025-12-24)
3 migrations: RLS policy, 11 FK indexes, RLS subselect optimization.

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
- JSON parsing metrics endpoint
- Alert queue processing asynchronously

---

*Last Updated: 2025-12-31 (Session: Gmail Inbox Hero Improvements)*
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*
