# Project Progress

**Date**: 2025-12-31
**Branch**: feature/gmail-inbox-hero-improvements
**Status**: Pipeline HEALTHY - Gmail Inbox Hero Phase 4 Complete

---

## Current Session: Gmail Inbox Hero - Phase 4 ✅ (2025-12-31)

Continued UX refinements for the interactive Gmail-style inbox hero section.

### Phase 4 Changes
1. **Dynamic "just now" timestamps** - Newly delivered emails show "just now", then "1 min ago", "2 min ago" etc.
2. **Timer optimization** - Changed from 1-second updates to 60-second updates to prevent re-render interference
3. **Max email limit reduced** - Capped inbox at 8 emails (from 10) for cleaner display
4. **Increased inbox width** - Expanded to max 1000px (from 800px) for ~80% subject line visibility
5. **Click-to-close summary** - Clicking empty whitespace below emails closes the summary panel
6. **Skeleton loading on refresh** - Replaced spinning icon with skeleton loader matching email row structure

### Files Modified
- `components/landing/sections-v2/gmail-inbox-hero.tsx` - All Phase 4 improvements

### Technical Details
- `deliveryTimestamps` Map tracks when each email was delivered
- `currentTime` state updates every 60 seconds (not every second)
- `formatSecondsAgo()` helper formats timestamps: "just now" → "1 min ago" → "X min ago"
- Skeleton loader uses `INITIAL_EMAIL_COUNT` and `EMAIL_ROW_HEIGHT` constants for consistency

### Verification
- ✅ TypeScript compiles cleanly
- ✅ Email delivery works without interference from timer updates

---

## Previous Session: Gmail Inbox Hero - Phase 3 ✅ (2025-12-31)

Final UX refinements for the interactive Gmail-style inbox hero section.

**Changes**: Fixed 5-second delivery interval, pause delivery when summary open, column alignment fixes, X button to clear selection, TypeScript interface fix
**File**: `components/landing/sections-v2/gmail-inbox-hero.tsx`

---

## Previous Session: Gmail Inbox Hero - Phase 2 ✅ (2025-12-31)

Enhanced UX and responsiveness improvements.

**Changes**: Faster delivery (1-8s random), viewport-responsive sizing, expand/collapse, overlay summary panel, fixed email row heights
**File**: `components/landing/sections-v2/gmail-inbox-hero.tsx`

---

## Previous Session: Gmail Inbox Hero - Phase 1 ✅ (2025-12-31)

Initial implementation combining "Summaries that Actually Matter" section with hero.

**Changes**: Spring animations (0.8s), larger container (560px), date sorting, CTA fix (/sign-in), select all checkbox, read/unread state, dynamic delivery (1-30s), unread badge sync
**File**: `components/landing/sections-v2/gmail-inbox-hero.tsx` - 15 curated real summaries, EmailRow + EmailDetailPanel components

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

*Last Updated: 2025-12-31 (Session: Gmail Inbox Hero Phase 4 Complete)*
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*
