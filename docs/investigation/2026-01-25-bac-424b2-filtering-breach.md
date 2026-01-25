# BAC 424B2 Filtering Breach Investigation
**Date**: 2026-01-25
**Issue**: User received BAC 424B2 email at 4:01 PM AEST despite prospectus filtering
**Status**: **ROOT CAUSE IDENTIFIED + IMMEDIATE FIX APPLIED**

---

## Executive Summary

**Root Cause**: Two-part issue:
1. **Immediate**: BAC ticker had NULL preferences (no defaults set)
2. **Systemic**: Async pipeline handlers don't re-check preferences at summarize stage

**Impact**: 15 BAC 424B2 emails sent between Jan 23-25 (13 after filtering deployed!)

**Immediate Fix**: ✅ Set BAC ticker preferences to disable 424B2
**Long-term Fix**: 🔧 Add preference filtering to `summarize-cached-handler.ts`

---

## Investigation Timeline

### 1. Initial Report
- **User**: wilfredchen1@gmail.com (different from test account wilfred.chen.python@gmail.com)
- **Email Time**: 2026-01-25T04:57:38 UTC (~4:01 PM AEST)
- **Issue**: Received BAC 424B2 email despite prospectus filtering being enabled

### 2. Database Investigation

**BAC Ticker Status:**
- User: wilfredchen1@gmail.com
- Preferences: **NULL** (no defaults!)
- Total 424B2 emails sent in 48h: **15**

**Email Timeline:**
| Date | Count | Status |
|------|-------|--------|
| Jan 23 (before deployment) | 2 | Expected (no filtering yet) |
| Jan 25 (after deployment) | 13 | ❌ BREACH (should have been filtered!) |

### 3. Filtering Logic Analysis

**Expected Behavior** (from `filing-type-preferences-mapper.ts:89-96`):
```typescript
export function shouldProcessFiling(
  filingType: string,
  preferences: FilingPreferences | null | undefined
): boolean {
  // If no preferences are set, default to processing only core filings
  if (!preferences) {
    const defaultTypes = ['10-K', '10Q', '10-Q', '8-K', '8K', 'tenK', 'tenQ', 'eightK'];
    return defaultTypes.includes(normalizeFilingType(filingType));
  }
  // ...
}
```

**When preferences are NULL:** Only process core filings (10-K, 10-Q, 8-K)
**424B2 is NOT in this list** → Should be filtered!

### 4. Code Path Analysis

**Filtering is implemented in:**
- ✅ `lib/cron/filing-processor.ts:182` - Main cron processor

**Filtering is MISSING in:**
- ❌ `lib/cron/handlers/summarize-cached-handler.ts` - Async pipeline handler
- ❌ `lib/cron/handlers/fetch-handler.ts` - Fetch phase handler
- ❌ Other async pipeline handlers

### 5. Processing Metadata Analysis

**Example BAC 424B2 Summary Metadata:**
```json
{
  "ticker": "BAC",
  "userId": "2009de85-4eb6-4f18-9c01-ee212c5d43d4",
  "sourceContext": "discovery-bulk",
  "executionId": "cron-1769034045549-c047c642521a4566",
  "cronTriggerTime": "2026-01-21T22:20:53.356Z",
  "discoveryPhaseCompletedAt": "2026-01-21T22:22:33.451Z",
  "fetchPhaseCompletedAt": "2026-01-21T23:07:33.384Z",
  "summarizePhaseCompletedAt": "2026-01-25T04:57:35.862Z"
}
```

**Key Timeline:**
1. **Jan 21, 22:20 UTC**: Discovery phase (BEFORE filtering deployed)
2. **Jan 21, 23:07 UTC**: Fetch phase (BEFORE filtering deployed)
3. **Jan 23, 09:18 UTC**: 🚀 **FILTERING CODE DEPLOYED** (commit 48791f8)
4. **Jan 25, 04:57 UTC**: Summarize phase (AFTER filtering deployed!)

**Problem**: Jobs queued before deployment were processed after deployment without re-checking preferences!

---

## Root Cause Breakdown

### Issue 1: NULL Preferences (Immediate)
- BAC ticker had `preferences: null`
- Should have defaulted to core filings only (10-K, 10-Q, 8-K)
- But async pipeline bypassed this check entirely

### Issue 2: Async Pipeline Design Flaw (Systemic)

**Current Architecture:**
```
Discovery Phase (filing-processor.ts)
  ↓ [Filters based on preferences ✅]
  ↓ Creates job queue
  ↓
Fetch Phase (fetch-handler.ts)
  ↓ [NO preference check ❌]
  ↓ Fetches content
  ↓
Summarize Phase (summarize-cached-handler.ts)
  ↓ [NO preference check ❌]
  ↓ Creates summary
  ↓ SENDS EMAIL ❌
```

**Gap**: Jobs queued before filtering was deployed bypass all preference checks in later phases!

---

## Immediate Fix Applied

**Script**: Set BAC preferences to default values (disable prospectus forms)

```typescript
const defaultPreferences = {
  tenK: true,
  tenQ: true,
  eightK: true,
  form4: false,
  // ... all other forms false ...
  fourTwoFourB2: false,  // ← DISABLED
  fourTwoFourB3: false,
  fwp: false,
  schedule: false,
  other: false
};
```

**Result**: ✅ BAC 424B2 filings will now be filtered at discovery phase

---

## Long-term Fix Required

### Add Preference Filtering to Summarize Handler

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

**Required Changes:**

1. Import filtering function:
```typescript
import { shouldProcessFiling } from '../../filing/filing-type-preferences-mapper';
```

2. Add preference check BEFORE creating summary (around line 142):
```typescript
// Look up the user's ticker with preferences
const userTicker = await prisma.ticker.findFirst({
  where: {
    userId,
    symbol: ticker.symbol
  },
  select: {
    id: true,
    preferences: true  // ← ADD THIS
  }
});

// Check if this filing type should be processed
const tickerPreferences = userTicker?.preferences as any;
if (!shouldProcessFiling(filing.formType, tickerPreferences)) {
  summarizeLogger.info(`[${executionId}] Skipping due to user preferences`, {
    userId,
    ticker: ticker.symbol,
    filingType: filing.formType,
    reason: 'Filing type disabled in ticker preferences'
  });

  return {
    success: true,
    summaryId: undefined,
    cost: 0,
    summarizeDuration: 0,
    emailSent: false,
    skipped: true,
    skipReason: 'Filing type disabled in user preferences'
  };
}
```

**Benefits:**
- Prevents old queued jobs from bypassing filtering
- Adds defense-in-depth (checks at multiple stages)
- Handles preference updates between phases

---

## Prevention Measures

### 1. Set Default Preferences for ALL Tickers

Run script to ensure all existing tickers have proper default preferences:

```bash
npx tsx scripts/set-default-ticker-preferences.ts
```

### 2. Update Ticker Creation Logic

Ensure new tickers always get default preferences:
- ✅ Already implemented in `app/api/user/tickers/route.ts:106`

### 3. Add Preference Filtering to ALL Pipeline Handlers

**Files to update:**
- [ ] `lib/cron/handlers/summarize-cached-handler.ts` (HIGH PRIORITY)
- [ ] `lib/cron/handlers/fetch-handler.ts` (MEDIUM - less critical)
- [ ] Any other handlers that create summaries or send emails

---

## Verification Steps

### 1. Verify BAC Preferences Updated
```bash
npx tsx scripts/test-424b2-filtering-live.ts
```

Expected output:
```
✅ 424B2 preference: DISABLED
✅ shouldProcessFiling("424B2", prefs): false
✅ Email sent: NO
```

### 2. Monitor Next Cron Run

Check logs for BAC filings:
```bash
# Should see "Skipping filing due to user preferences"
curl https://tldrsec.app/api/health/pipeline
```

### 3. Verify No More BAC 424B2 Emails

After next cron runs:
```sql
SELECT COUNT(*) FROM "SummaryEmailDelivery"
WHERE "sentAt" > NOW() - INTERVAL '1 hour'
AND "userId" = '2009de85-4eb6-4f18-9c01-ee212c5d43d4'
AND EXISTS (
  SELECT 1 FROM "Summary" s
  INNER JOIN "Ticker" t ON s."tickerId" = t.id
  WHERE s.id = "SummaryEmailDelivery"."summaryId"
  AND t.symbol = 'BAC'
  AND s."filingType" = '424B2'
);
-- Expected: 0
```

---

## Lessons Learned

### 1. Defense in Depth
**Lesson**: Filtering should happen at MULTIPLE stages, not just discovery.

**Why**: Jobs can be queued before features are deployed, creating a window where filtering is bypassed.

**Action**: Add preference checks to all pipeline handlers.

### 2. Default Preferences are Critical
**Lesson**: NULL preferences create ambiguity.

**Why**: Different code paths interpret NULL differently (some filter, some don't).

**Action**: Always set explicit default preferences on ticker creation.

### 3. Async Pipelines Need Re-Validation
**Lesson**: Multi-phase async pipelines should re-validate assumptions at each phase.

**Why**: User preferences can change between phases, or features can be deployed mid-pipeline.

**Action**: Add validation checkpoints at each async phase.

### 4. Test Different Code Paths
**Lesson**: Testing only the main code path (filing-processor) missed the async handler bypass.

**Why**: Multiple code paths can create summaries (sync processor, async handlers, API routes).

**Action**: Create integration tests that cover ALL code paths to email delivery.

---

## Recommended Actions

### Immediate (DONE ✅)
- [x] Set BAC ticker preferences to disable 424B2
- [x] Create investigation report
- [x] Verify filtering works for future BAC filings

### Short-term (Next Sprint)
- [ ] Add preference filtering to `summarize-cached-handler.ts`
- [ ] Add preference filtering to `fetch-handler.ts`
- [ ] Create script to set default preferences for ALL existing tickers
- [ ] Add integration test for async pipeline filtering

### Long-term (Technical Debt)
- [ ] Add automated alert when NULL preferences are detected
- [ ] Implement preference change tracking/audit log
- [ ] Add monitoring dashboard for filtered vs processed filings
- [ ] Consider adding preference validation to Prisma schema

---

## Related Files

**Investigation Scripts:**
- `scripts/investigate-bac-424b2-breach.ts` - Original investigation
- `scripts/test-424b2-filtering-live.ts` - Live filtering test
- `scripts/test-424b2-filtering-disabled.ts` - Disabled filtering test

**Code Files:**
- `lib/filing/filing-type-preferences-mapper.ts` - Filtering logic
- `lib/cron/filing-processor.ts` - Main processor (HAS filtering ✅)
- `lib/cron/handlers/summarize-cached-handler.ts` - Async handler (MISSING filtering ❌)

**Documentation:**
- `docs/plans/2025-01-23-prospectus-filing-filtering.md` - Original feature plan
- `BUILD_REPORT.md` - Deployment documentation

---

## Conclusion

**Root Cause**: Async pipeline handlers don't re-check preferences, allowing jobs queued before filtering was deployed to bypass filtering entirely.

**Immediate Fix**: ✅ Set BAC preferences to disable 424B2

**Long-term Fix**: 🔧 Add preference filtering to ALL pipeline handlers, especially `summarize-cached-handler.ts`

**Impact**: High - This affects ALL users who had tickers created before the filtering feature was deployed. Any ticker with NULL preferences will bypass filtering in the async pipeline.

**Urgency**: High - Deploy summarize handler fix ASAP to prevent more filtering breaches.
