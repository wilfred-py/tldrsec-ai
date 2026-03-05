# Onboarding & Tutorial Flow Overhaul

## Context

The current onboarding flow has several gaps: ticker limit is 5 (should be 3 for FREE tier), onboarding/tutorial can be skipped, there's no animated transition between onboarding and dashboard, toast notifications are used for completion feedback (underwhelming), and there's no cached summary delivery for new users. This overhaul creates a polished, unskippable onboarding + tutorial experience with playful animations and immediate value delivery via cached summaries.

## Summary of Changes

1. **Onboarding flow**: 2 steps (sectors -> tickers), max 3 tickers, unskippable, with company logos via Clearbit
2. **Progress bar**: Brand-colored gradient using `--landing-primary` (#0079F2) to `--landing-gradient-end` (#8B5CF6)
3. **Transition screen**: Animated text cycling messages instead of toasts
4. **Tutorial**: Unskippable dashboard walkthrough, final step explains email summaries
5. **Cached summary delivery**: After tutorial, find & email top 2 summaries per ticker from existing data
6. **Confetti celebration**: react-confetti on tutorial completion

---

## Task 1: Update Onboarding Flow (Ticker Limit + Company Logos + Enhanced Search) [DONE]

### Files to modify:
- `app/(auth)/onboarding/onboarding-client.tsx` - Main onboarding UI

### Changes:

**1a. Change ticker limit from 5 to 3**
- Lines 219, 502 hardcode `5` - replace with `THREE_TIER_LIMITS.FREE` (= 3)
- Import `THREE_TIER_LIMITS` from `@/lib/subscription/three-tier-limits`
- Update "5 companies" text references to "3 tickers"

**1b. Add company logos via Clearbit** *(Review: skip hardcoded mapping file - Issue #4)*
- Create `components/ui/company-logo.tsx` - reusable logo component
  - Primary: `https://logo.clearbit.com/{domain}` (free, high-quality)
  - Fallback: styled first-letter avatar (colored circle like Slack)
  - Props: `symbol`, `companyName`, `size` (sm/md/lg)
  - Use `loading="lazy"` on images to prevent bulk external requests *(Review: Issue #13)*
  - Show letter avatar immediately, swap to Clearbit logo on load via `onError` fallback
- ~~Create `lib/company-logos.ts` - ticker-to-domain mapping~~ **REMOVED** *(Review: Issue #4)*
  - Instead: derive domain from company name heuristic (`{sanitized-company-name}.com`)
  - Letter avatar fallback handles all misses
- Show logos in the equity selection grid alongside company name/symbol

**1c. Enhance ticker search in Step 2** *(Review: dual-search UX - Issue #14)*
- Currently searches only within hardcoded sector lists
- Add API-backed search that hits `/api/companies/search` endpoint (already exists)
- Sector-matching results appear first **immediately**, then API search results append below
- Show "searching more..." indicator while API request is in-flight *(Review: Issue #14)*
- Debounced (300ms) input with loading indicator
- Reference: `components/dashboard/company-search.tsx` for existing search pattern

**1d. Make onboarding unskippable**
- No skip button currently exists (good) - just ensure no escape routes
- Remove `toast.success('Onboarding completed successfully!')` from line 301 - transition screen replaces this

---

## Task 2: Brand-Colored Progress Bar [DONE]

### Files to modify:
- `app/(auth)/onboarding/onboarding-client.tsx` - Apply brand styling
- `components/ui/progress.tsx` - May need className passthrough for indicator

### Changes: *(Review: DRY via single variant - Issue #5)*
- Add `variant="brand"` prop to `components/ui/progress.tsx` that applies gradient `bg-gradient-to-r from-[#0079F2] to-[#8B5CF6]` to the indicator
- Define the brand gradient as a shared Tailwind utility class in `app/globals.css` (single source of truth)
- The existing `<Progress>` wraps `@radix-ui/react-progress`
- Use `variant="brand"` in both `onboarding-client.tsx` and `tutorial-guide.tsx` (DRY)

---

## Task 3: Animated Transition Screen [DONE]

### Files to modify:
- `app/(auth)/onboarding/onboarding-client.tsx` - Replace `isSubmitting` screen (lines 364-373)

### New file:
- `components/onboarding/onboarding-transition.tsx`

### Design: *(Review: completion-based, not timer-based - Issue #2)*
- Full viewport, centered, brand gradient background
- Messages cycle as real operations complete (not fixed timer):
  1. "saving your preferences..." (while `completeOnboardingBatched` runs)
  2. "setting up tickers..." (after preferences saved)
  3. "preparing your dashboard..." (after tickers confirmed)
  4. "ready!" (all done)
- **Minimum display time: ~2 seconds** (don't flash too fast on fast connections)
- **No fixed 6-second delay** - redirect as soon as operations complete + minimum time elapsed
- Animation: Framer Motion `AnimatePresence` + `motion.div` for text swap (fade + slight upward slide)
- Pulsing dots after each message (CSS animation, 3 dots cycling opacity)
- Uses `framer-motion` (already installed: v12.23.24)

### Trigger: *(Review: keep error toast for failures - Issue #7)*
- After `completeOnboardingBatched` succeeds, set `showTransition = true` instead of showing success toast
- **Keep `toast.error()` for failures** - transition is success-path only
- Transition component handles the redirect via `window.location.href = '/dashboard'`

---

## Task 4: Make Tutorial Unskippable [DONE]

### Files to modify:
- `components/onboarding/tutorial-guide.tsx`
- `components/dashboard/dashboard-client.tsx`

### Changes to tutorial-guide.tsx:
- Remove `handleSkipTutorial` function (lines 298-312)
- Remove X close button (line 395-397: `<Button variant="ghost" size="icon" ... onClick={handleSkipTutorial}>`)
- Remove skip-related toast messages
- Keep the overlay (`bg-black/50 z-[9998]`) to block background interactions
- Only way to dismiss: complete all 7 steps

### Changes to dashboard-client.tsx: *(Review: keep tutorialProgress localStorage - Issue #3)*
- Lines 122-127: Change tutorial logic to always show if `!tutorialCompleted`
  - Remove `localStorage.getItem("hasSeenTutorial")` check
  - Remove `localStorage.setItem("hasSeenTutorial", "true")`
  - **Keep `localStorage.getItem("tutorialProgress")`** for step resume on browser refresh
  - Simplify trigger to: `if (!tutorialCompleted) { setShowTutorial(true); }`
  - Tutorial step position still restorable from localStorage on refresh (7-step unskippable + accidental refresh = don't restart from step 1)

### Update final tutorial step (step 7 in tutorial-guide.tsx):
- Change description to: "You'll receive AI-powered summaries of SEC filings for your tracked companies directly to your email. We'll send you the most relevant summaries shortly!"
- Remove Yes/No email choice buttons (`handleEmailSummariesResponse`)
- Replace with single "Complete Tutorial" button
- On click: trigger `completeTutorial()` which fires confetti + sends cached summaries in background

---

## Task 5: Cached Summary Delivery (Search + Rank + Email) [DONE]

### New files:
- `lib/onboarding/cached-summary-delivery.ts` - Core ranking & delivery logic
- `app/api/onboarding/deliver-summaries/route.ts` - POST endpoint

### Ranking Algorithm (Composite Score):
```
score = (typeWeight * 0.4) + (normalizedQuality * 0.3) + (recencyScore * 0.3)

typeWeight (normalized to 0-100):
  10-K    = 100
  10-Q    = 90
  8-K     = 70
  DEF 14A = 65
  Form 4  = 40
  Other   = 30

normalizedQuality:
  Summary.qualityScore (0-100), default 50 if null

recencyScore:
  100 * max(0, 1 - (daysSinceFiling / 365))
  (today = 100, 6 months ago = ~50, 1 year+ = 0)
```

### Flow: *(Review: explicit edge case handling - Issue #6; fix await bug - Issue #8)*
1. Tutorial completes -> `POST /api/onboarding/deliver-summaries` called (fire-and-forget from client)
2. Endpoint authenticates via Clerk, gets user's tickers
   - **Edge case: no email address** → return `{ error: "no_email" }` early
3. For each ticker symbol:
   a. Query `Summary` table across ALL users' tickers with that symbol (ticker-centric, not user-scoped)
   b. Filter: `summaryText IS NOT NULL AND processingStatus = 'COMPLETED'`
   c. Calculate composite score for each (extract as pure function for testability)
   d. Select top 2 per ticker
4. **Edge case: zero summaries found** → return `{ delivered: 0, reason: "no_cached_summaries" }`, skip email
5. Send single digest email with all selected summaries
   - **Use `await` on `getEmailTemplate()`** (existing code has missing await bug - don't propagate)
   - **Edge case: email delivery fails** → log error, return `{ delivered: 0, reason: "email_failed" }` (don't throw)
6. Use existing `getEmailTemplate(EmailType.DIGEST, ...)` from `lib/email/templates.ts`
7. Track delivery via `SummaryEmailDelivery` (existing model with `[userId, summaryId]` unique)

### Database query:
```typescript
// For each ticker symbol, find best cached summaries across all users
const summaries = await prisma.summary.findMany({
  where: {
    ticker: { symbol: tickerSymbol },
    summaryText: { not: null },
    processingStatus: 'COMPLETED',
  },
  include: { ticker: true },
  orderBy: { filingDate: 'desc' },
  take: 20, // Get top candidates, rank in app layer
});
```

### Reference files:
- `lib/email/summary-service.ts` - `sendLatestSummariesEmail()` pattern (lines 87-220)
- `lib/validation/quality-gate.ts` - Quality scoring reference
- `services/filings/database/filingDatabase.ts` - DB query patterns
- `prisma/schema.prisma` - Summary model (qualityScore field at line ~130)

---

## Task 6: Confetti Enhancement [DONE]

### Files to modify:
- `components/onboarding/tutorial-guide.tsx`

### Changes:
- Increase `particleCount` from 100 to 200 (line 479)
- Increase tutorial dismiss delay from 3000ms to 5000ms (line 252-255)
- Ensure confetti fires after the final "Complete Tutorial" click, not during email step

---

## Task 7: Wire Everything Together [DONE]

### End-to-end flow:
```
1. User signs up -> redirected to /onboarding (auth required)
2. Step 1: Select sectors (unskippable, brand progress bar)
3. Step 2: Search & select up to 3 tickers
   - Sector results rank first in search
   - Company logos (Clearbit + letter fallback)
   - Brand gradient progress bar
4. Click "Complete Setup"
5. Animated transition screen (completion-based, ~2s minimum):
   "saving your preferences..."
   "setting up tickers..."
   "preparing your dashboard..."
   "ready!"
6. Redirect to /dashboard
7. Tutorial starts immediately (unskippable, 7 steps)
   - Steps walk through dashboard features
   - Final step: "We'll email your summaries"
8. Click "Complete Tutorial"
9. Confetti! (5s, 200 particles)
10. Background: POST /api/onboarding/deliver-summaries
    - Finds cached summaries across all users
    - Ranks by composite score
    - Emails top 2 per ticker as digest
```

---

## Files Changed Summary

| Action | File | Description |
|--------|------|-------------|
| Modify | `app/(auth)/onboarding/onboarding-client.tsx` | Ticker limit 3, logos, enhanced search, transition trigger, keep error toast |
| Create | `components/ui/company-logo.tsx` | Reusable company logo (Clearbit + letter fallback + lazy loading) |
| ~~Create~~ | ~~`lib/company-logos.ts`~~ | **REMOVED** - use heuristic domain derivation instead |
| Create | `components/onboarding/onboarding-transition.tsx` | Completion-based transition screen (~2s min) |
| Modify | `components/onboarding/tutorial-guide.tsx` | Unskippable, update final step, enhanced confetti |
| Modify | `components/dashboard/dashboard-client.tsx` | Always show tutorial, remove hasSeenTutorial, keep tutorialProgress |
| Create | `lib/onboarding/cached-summary-delivery.ts` | Ranking algorithm (pure function) + delivery logic |
| Create | `app/api/onboarding/deliver-summaries/route.ts` | POST endpoint with explicit edge case handling |
| Modify | `components/ui/progress.tsx` | Brand gradient `variant="brand"` (DRY) |

---

## Verification Plan *(Updated per review)*

### New Test Files Required (Review: Issues #9, #10, #11, #12)
| Test File | Covers |
|-----------|--------|
| `__tests__/components/onboarding/onboarding-client.test.tsx` | Ticker limit (3 not 5), search behavior, transition trigger on success/error |
| `__tests__/components/onboarding/tutorial-guide.test.tsx` | No skip button, step progression, confetti trigger, final step single-button |
| `__tests__/api/onboarding/deliver-summaries.test.ts` | Ranking algorithm (pure fn), auth, zero summaries, email failure, no email |
| `__tests__/components/ui/company-logo.test.tsx` | Image load, onError fallback to letter avatar, missing domain |

### Existing Tests to Update (Review: Issue #11)
- `__tests__/components/dashboard/dashboard-inline-integration.test.tsx` - Remove `localStorage.setItem('hasSeenTutorial', 'true')` from `beforeEach`, verify tutorial shows when `tutorialCompleted=false`
- `__tests__/components/dashboard/dashboard-table-integration.test.tsx` - Same localStorage cleanup

### Test Commands
1. **Lint & unit tests**: `npm run lint` + `npm run test`
2. **Onboarding tests**: `npm run test:onboarding` (manual integration script - verify flow end-to-end)
3. **Manual E2E**:
   - Create new user account
   - Verify 2-step onboarding: sectors -> tickers (max 3, logos visible with lazy loading)
   - Verify brand gradient progress bar (same gradient in both onboarding and tutorial)
   - Verify completion-based transition screen (~2s min, not fixed 6s)
   - Verify error toast still shows on onboarding save failure
   - Verify tutorial auto-starts on dashboard (unskippable, no X button)
   - Verify tutorial resumes on correct step after browser refresh
   - Verify confetti on tutorial completion (200 particles, 5s)
   - Verify summary digest email received (or graceful skip if no cached summaries)
4. **Existing suite**: `npm run test:pipeline:comprehensive`

---

## Review Notes

**Reviewed**: 2026-03-02 | **Review type**: BIG CHANGE (4 sections, 14 issues)

### Architecture Decisions
| # | Issue | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Cross-user summary access | Keep as-is | Pipeline is ticker-centric; SEC data is public |
| 2 | 6-second forced transition | Completion-based, ~2s min | Respect user time; show real progress not artificial delay |
| 3 | Tutorial resume after localStorage removal | Keep `tutorialProgress` localStorage | 7-step unskippable + accidental refresh should resume, not restart |
| 4 | Clearbit + hardcoded mapping file | Skip mapping file | Derive domains from heuristic; letter-avatar fallback. Eliminates maintenance |

### Code Quality Decisions
| # | Issue | Decision | Rationale |
|---|-------|----------|-----------|
| 5 | Brand gradient in 3+ places | `variant="brand"` on Progress component | DRY - single source of truth |
| 6 | Cached delivery edge cases | Explicit handling for all paths | Zero summaries, email failure, no email - all handled |
| 7 | Transition error path | Keep error toast, transition is success-only | Don't remove error handling when replacing success feedback |
| 8 | Missing `await` on `getEmailTemplate` | Fix in new code, note existing bug | Don't propagate known async bugs |

### Test Decisions
| # | Issue | Decision | Rationale |
|---|-------|----------|-----------|
| 9 | No tests for modified components | Add dedicated test files | onboarding-client + tutorial-guide need coverage |
| 10 | No tests for new API endpoint | Unit + integration tests | Ranking algorithm is pure testable logic |
| 11 | Dashboard integration tests stale | Update active tests | Remove hasSeenTutorial mock, verify new tutorial logic |
| 12 | Company logo error handling | Test all fallback paths | Image onError is #1 broken-logo source |

### Performance Decisions
| # | Issue | Decision | Rationale |
|---|-------|----------|-----------|
| 13 | Bulk Clearbit image requests | Lazy load + letter avatar placeholder | Progressive enhancement, no 40 concurrent requests |
| 14 | Dual search UI flicker | Static results first + "searching more..." indicator | Explicit UX > content shift surprise |

---

## Unresolved Questions

None - all key decisions clarified with user and review.
