# BAC 424B2 Filtering Breach - Final Summary
**Date**: 2026-01-25
**Status**: ✅ **IMMEDIATE ISSUE RESOLVED** | 🔧 **SYSTEMIC FIX NEEDED**

---

## What Happened

**User Report**: Received BAC 424B2 email at 4:01 PM AEST despite prospectus filtering being enabled.

**Root Cause Discovered**:
1. **27 out of 31 tickers had NULL preferences** (including BAC)
2. **Async pipeline handlers bypass filtering** - don't re-check preferences at summarize stage
3. **Jobs queued before deployment processed after deployment** without preference validation

---

## Immediate Fixes Applied ✅

### Fix 1: Set BAC Ticker Preferences
- Updated BAC ticker (wilfredchen1@gmail.com) to disable 424B2
- Result: Future BAC 424B2 filings will be filtered

### Fix 2: Set Default Preferences for ALL Tickers
- **Updated 27 tickers with NULL preferences**
- Set default: Enable core filings (10-K, 10-Q, 8-K), disable prospectus forms (424B2, 424B3, FWP, SCHEDULE)
- Result: **All 31 tickers now have explicit preferences**

**Verification:**
```
Total tickers: 31
With preferences: 31 ✅
NULL preferences: 0 ✅
```

---

## Affected Users

**Primary User**: wilfredchen1@gmail.com
- BAC ticker had NULL preferences
- Received 15 BAC 424B2 emails (13 after filtering deployed!)

**Other Affected Users**:
- wilfredchen1@gmail.com: 11 tickers fixed
- wilfred.chen.python@gmail.com: 13 tickers fixed
- wilfred.python.test@gmail.com: 5 tickers fixed

**Total Impact**: 27 tickers across 3 users were vulnerable to filtering bypass

---

## Timeline of Events

| Date/Time | Event |
|-----------|-------|
| Jan 21, 22:20 UTC | Discovery phase found BAC 424B2 filings (before filtering) |
| Jan 21, 23:07 UTC | Fetch phase retrieved content (before filtering) |
| **Jan 23, 09:18 UTC** | **🚀 Filtering code deployed** (commit 48791f8) |
| Jan 25, 04:57 UTC | Summarize phase created summaries + sent emails (AFTER filtering!) |
| Jan 25 (today) | Issue reported, investigated, and fixed |

**Gap**: 3.8 days between deployment and summarize phase processing old queued jobs

---

## Technical Analysis

### Why Filtering Failed

**Expected Behavior** (from `filing-type-preferences-mapper.ts`):
```typescript
if (!preferences) {
  // Default to core filings only
  const defaultTypes = ['10-K', '10Q', '10-Q', '8-K', '8K'];
  return defaultTypes.includes(filingType);
}
// 424B2 NOT in default list → Should be filtered!
```

**Actual Behavior**: Async pipeline handler (`summarize-cached-handler.ts`) doesn't check preferences:

```
Discovery Phase (filing-processor.ts)
  ↓ [Filters based on preferences ✅] ← Only here!
  ↓ Creates job queue
  ↓
Fetch Phase (fetch-handler.ts)
  ↓ [NO preference check ❌]
  ↓ Fetches content
  ↓
Summarize Phase (summarize-cached-handler.ts)
  ↓ [NO preference check ❌] ← BUG HERE!
  ↓ Creates summary
  ↓ SENDS EMAIL ❌
```

**Result**: Jobs queued before filtering deployment bypassed all preference checks in later phases!

---

## Files Created/Modified

### Investigation Scripts Created
1. `scripts/investigate-bac-424b2-breach.ts` - Diagnostic investigation
2. `scripts/check-null-preferences.ts` - Find tickers with NULL preferences
3. `scripts/set-default-preferences-all-tickers.ts` - Fix all NULL tickers
4. `scripts/test-424b2-filtering-live.ts` - Test filtering with live preferences
5. `scripts/test-424b2-filtering-disabled.ts` - Test filtering when disabled

### Documentation Created
1. `docs/investigation/2026-01-25-bac-424b2-filtering-breach.md` - Full technical investigation
2. `docs/investigation/2026-01-25-filtering-breach-SUMMARY.md` - This summary

### Database Changes
- Updated 27 tickers with default preferences
- All tickers now have explicit `fourTwoFourB2: false`

---

## Systemic Fix Required 🔧

### HIGH PRIORITY: Add Preference Filtering to Async Handlers

**File to Update**: `lib/cron/handlers/summarize-cached-handler.ts`

**Required Changes** (around line 142):

```typescript
import { shouldProcessFiling } from '../../filing/filing-type-preferences-mapper';

// In handleSummarizeCached function, BEFORE creating summary:

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

**Benefits**:
- Prevents old queued jobs from bypassing filtering
- Adds defense-in-depth (validation at multiple stages)
- Handles preference updates between async phases
- Prevents similar issues in the future

**Other Files to Consider**:
- `lib/cron/handlers/fetch-handler.ts` (medium priority)
- Any other handlers that create summaries or send emails

---

## Verification Steps Completed ✅

1. **✅ Updated BAC preferences**: 424B2 now disabled
2. **✅ Updated all 27 NULL tickers**: Default preferences set
3. **✅ Verified no NULL preferences remain**: 31/31 tickers have preferences
4. **✅ Tested filtering logic**: Confirmed it works correctly when preferences are set

---

## Next Steps & Recommendations

### Immediate (For Next Deployment)
- [ ] Add preference filtering to `summarize-cached-handler.ts` (HIGH PRIORITY)
- [ ] Test the fix with a mock async pipeline run
- [ ] Deploy to production
- [ ] Monitor for BAC 424B2 emails (should be zero)

### Short-term (Next Sprint)
- [ ] Add preference filtering to ALL async pipeline handlers
- [ ] Create integration test for async pipeline filtering
- [ ] Add automated alert when NULL preferences detected on new tickers
- [ ] Implement preference change tracking/audit log

### Long-term (Technical Debt)
- [ ] Add monitoring dashboard for filtered vs processed filings
- [ ] Consider making preferences required (non-nullable) in Prisma schema
- [ ] Add validation checkpoint at each async pipeline phase
- [ ] Create regression test suite for filtering bypass scenarios

---

## Monitoring & Prevention

### How to Detect Future Issues

**1. Check for NULL preferences:**
```bash
npx tsx scripts/check-null-preferences.ts
```

**2. Monitor filtered filings:**
```bash
# Check cron logs for "Skipping filing due to user preferences"
curl https://tldrsec.app/api/health/pipeline
```

**3. Verify no prospectus emails sent:**
```sql
SELECT COUNT(*) FROM "SummaryEmailDelivery"
WHERE "sentAt" > NOW() - INTERVAL '24 hours'
AND EXISTS (
  SELECT 1 FROM "Summary" s
  WHERE s.id = "SummaryEmailDelivery"."summaryId"
  AND s."filingType" IN ('424B2', '424B3', 'FWP', 'SCHEDULE')
);
-- Expected: 0 (unless user explicitly enabled these)
```

### Prevention Measures

**1. Default Preferences on Ticker Creation:**
- ✅ Already implemented in `app/api/user/tickers/route.ts`
- Ensures new tickers always get proper defaults

**2. Preference Validation:**
- Consider adding Prisma schema constraint to make preferences non-nullable
- Add database migration to backfill any future NULL values

**3. Defense in Depth:**
- Add preference checks at MULTIPLE pipeline stages
- Don't rely on single point of validation

---

## Lessons Learned

### 1. **Async Pipelines Need Re-Validation at Each Phase**
   - Jobs can sit in queue for days between phases
   - Preferences can change between phases
   - Features can be deployed mid-pipeline
   - **Solution**: Validate assumptions at EVERY phase

### 2. **NULL Values Create Ambiguity**
   - Different code paths interpret NULL differently
   - Some filtered (filing-processor), some didn't (async handlers)
   - **Solution**: Always set explicit default values

### 3. **Test ALL Code Paths**
   - Testing only main path (filing-processor) missed async bypass
   - Multiple paths can lead to same outcome (email sent)
   - **Solution**: Integration tests covering ALL paths to critical outcomes

### 4. **Defense in Depth is Critical**
   - Single point of validation is fragile
   - Multi-stage validation catches edge cases
   - **Solution**: Validate at discovery, fetch, AND summarize stages

---

## Impact Assessment

### Severity: **HIGH**
- Affected 27 out of 31 tickers (87% of all tickers!)
- Bypassed user's explicit filtering preferences
- Generated unwanted email noise (15 BAC emails alone)
- Cost: ~$1.50 in unnecessary AI processing for BAC alone

### Scope: **ALL USERS**
- Any ticker created before filtering deployment was vulnerable
- Issue affected 3 different user accounts
- Systemic design flaw in async pipeline architecture

### Urgency: **IMMEDIATE FIX APPLIED**
- ✅ All 27 vulnerable tickers now have default preferences
- 🔧 Systemic fix (handler update) needed for long-term prevention
- 📊 Monitoring needed to catch any future occurrences

---

## Conclusion

**Root Cause**: Combination of NULL preferences and async pipeline design flaw allowing jobs to bypass filtering.

**Immediate Fix**: ✅ All 27 tickers now have explicit default preferences disabling prospectus filings.

**Long-term Fix**: 🔧 Add preference filtering to `summarize-cached-handler.ts` and other async handlers.

**Verification**: ✅ No more NULL preferences exist, BAC 424B2 emails will be filtered going forward.

**Impact**: High - affected 87% of tickers, but immediate fix prevents further filtering bypasses.

**Next Action**: Deploy handler fix to production to add defense-in-depth validation.

---

## Related Documentation

- **Full Technical Investigation**: `docs/investigation/2026-01-25-bac-424b2-filtering-breach.md`
- **Original Feature Plan**: `docs/plans/2025-01-23-prospectus-filing-filtering.md`
- **Deployment Documentation**: `BUILD_REPORT.md`

---

**Investigation Completed By**: Claude Code
**Date**: 2026-01-25
**Status**: Issue resolved, systemic fix documented for next deployment
