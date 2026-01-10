# Project Progress

**Date**: 2026-01-10
**Branch**: main
**Status**: Pipeline Successfully Redeployed - Backlog Processing Restored

---

## Current Session: Pipeline Redeployment & Backlog Recovery (2026-01-10)

Successfully resolved critical pipeline stall affecting 400+ pending jobs. Both Vercel and Cloudflare Worker redeployed to restore processing.

**Root Cause**: Pipeline processing endpoints weren't picking up pending jobs, causing 12:30 PM AEST event drop with 231+ stuck jobs.

**Solution**: 
- ✅ Vercel redeployment with latest code
- ✅ Cloudflare Worker redeployment (version c177792f)
- ✅ Pipeline restoration - jobs actively processing

**Current Status**: 1 job processing, fresh completion at 03:21:47 UTC, 402 pending jobs being processed systematically.

---

## Recently Completed: Summary Generation Quality Improvement

### Phase 5: Missing Extractors (SC 13G, SC 13D, 424B2) ✅ (2026-01-09)

**Goal**: Add data extractors for SC 13G (passive ownership), SC 13D (activist ownership), and 424B2 (prospectus supplement).

**Changes Made**:
1. Created 3 new data extractors:
   - `lib/email/sc13g-data-extractor.ts` - Passive beneficial ownership (>5%) extraction
   - `lib/email/sc13d-data-extractor.ts` - Activist beneficial ownership extraction with activist intent detection
   - `lib/email/424b2-data-extractor.ts` - Prospectus supplement (debt/equity/structured notes)

2. Key extraction features:
   - **SC 13G**: filerName, ownershipPercentage, sharesOwned, filingPurpose, isAmendment
   - **SC 13D**: filerName, ownershipPercentage, purpose, intentions[], isActivist, isGroupFiling
   - **424B2**: offeringType, offeringAmount, interestRate, maturityDate, linkedTo, underwriters[]

3. Updated `lib/email/extractor-registry.ts` (now supports 16 form types with aliases)

**Files Added**:
- `lib/email/sc13g-data-extractor.ts` (~240 lines)
- `lib/email/sc13d-data-extractor.ts` (~360 lines)
- `lib/email/424b2-data-extractor.ts` (~425 lines)
- `__tests__/email/extractors/sc13g-data-extractor.test.ts` (15 tests)
- `__tests__/email/extractors/sc13d-data-extractor.test.ts` (17 tests)
- `__tests__/email/extractors/424b2-data-extractor.test.ts` (16 tests)

**Verification**: ✅ 48 Phase 5 tests passing, 149 total extractor tests

**Next Step**: Plan complete - all phases implemented

### Fix Orphaned Filings Pipeline ✅ VERIFIED AND WORKING (2026-01-09)

**Plan**: [2026-01-08-fix-orphaned-filings-pipeline.md](docs/plans/2026-01-08-fix-orphaned-filings-pipeline.md)

**Root Cause**: Discovery handler only checked RSS feeds, not `processed=false` entries in RssFilingCheck table. When 3-phase pipeline is enabled, legacy backlog processing code is never reached.

**Fix**: Added STEP 3.5 to discovery-handler.ts - calls `getUnprocessedFilings(50)` after RSS check, merges with RSS results (deduplicating by accessionNumber), and marks filings as processed after job creation.

**Schema Fixes Applied During Verification**:
- Added `scheduledFor: new Date()` - Required field in JobQueue schema
- Changed `maxAttempts` → `maxRetries` - Correct field name per schema

**Files Modified**:
- `lib/cron/handlers/discovery-handler.ts` - Unprocessed filing recovery + schema field fixes

---

*Last Updated: 2026-01-10 (Pipeline Redeployment Complete)*
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*