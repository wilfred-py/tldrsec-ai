# ADR-0007: Onboarding Fallback Notice stays as its own module

Date: 2026-06-25
Status: accepted

## Context

The autonomous architecture review routine considered folding
`lib/email/onboarding-fallback-service.ts` (93 LOC) inline into its
sole production caller, `app/(auth)/onboarding/actions.ts`
(`saveUserPreferences`). The fit looked obvious on the surface: one
production caller, no second-caller demand, a `sendOnboardingFallbackNotice`
function with a single role (send the "we're watching your tickers"
fallback email when no cached cross-user summaries exist for any of the
user's tracked tickers).

The candidate matches the silhouette of recent successful inlines —
Why It Matters Guard (PR #616), Ticker Grounding Guard (PR #625),
Numeric Grounding Guard (PR #644), Enrichment Flags (PR #674),
StalenessDetector → StalenessBanner (PR #645). All five pulled
"extracted-for-testability" pure functions with exactly one production
caller into that caller, deleting the standalone unit tests and
relying on existing integration tests at the deepened module's
interface.

## Decision

**Do not inline.** `lib/email/onboarding-fallback-service.ts` stays
where it is, with its current interface (`sendOnboardingFallbackNotice`)
and its current test surface
(`__tests__/lib/email/onboarding-fallback-service.test.ts`).

## Reasons (load-bearing)

### 1. The integration-test prerequisite from ADR-0006 does not hold

ADR-0006 made the rule explicit: an inline is safe **only** when
integration tests at the destination seam already cover the inlined
behaviour. The Why It Matters / Ticker Grounding / Numeric Grounding
inlines all relied on
`__tests__/lib/ai/summarize-grounding-wireup.test.ts` — a pre-existing
integration test at the Summarize seam that already exercised the
guards before any inline.

For `sendOnboardingFallbackNotice`, the destination is the
`saveUserPreferences` server action. There is **no integration test
at the action seam** that covers the fallback path. The repo's
existing `__tests__/mocks/server-actions-mock.ts` is a stub that the
client tests use to bypass the action entirely; it asserts nothing
about the fallback behaviour. The existing
`__tests__/lib/email/onboarding-fallback-service.test.ts` (211 LOC,
16 test cases) is the only place this behaviour is verified —
idempotency on `User.onboardingFirstEmailSentAt`, subject-line
truncation (≤3 tickers verbatim, >3 tickers with "+N" overflow,
empty list → generic copy), template selection
(`EmailType.ONBOARDING_FALLBACK_NOTICE`), tag emission
(`type:onboarding-fallback-notice`), send-failure / internal-error
error-path semantics. Inlining and deleting those 16 cases would
drop real coverage to zero.

### 2. Server actions are heavy to test at their seam

Recreating those 16 cases at the `saveUserPreferences` seam requires
mocking the full Clerk `auth()` + `currentUser()` + `clerkClient`
surface, `revalidatePath`, `next/server`'s `after`, the Prisma client,
and the full `deliverFirstOnboardingEmail` upstream path that gates
the fallback. The Summarize-seam integration tests cited in ADR-0006
mock only Prisma + the OpenRouter client + `posthog-server` — a much
smaller substrate. The cost-benefit that justifies the Summarize-seam
inlines does not transfer.

### 3. The destination is not a deep module

The successful inlines all folded into a **deep module** (Summarize,
StalenessBanner) where adding ~40-90 LOC of guard logic raised the
caller's depth marginally and left the caller still testable through
one interface. The destination here is a 535 LOC Next.js server
action that already pulls in Clerk, Stripe reconciliation, ticker
seeding, preference normalisation, and the cached-summary delivery
path. Inlining a 93 LOC standalone email-send function would grow it
to ~625 LOC without raising depth — the action's interface stays the
same (a single `saveUserPreferences(preferences)` entry point); the
implementation just thickens. That's depth-without-leverage, the
inverse of the deepening pattern.

### 4. The current seam is not a hypothetical seam

`lib/email/onboarding-fallback-service.ts` has exactly one production
adapter — the dynamic import in `actions.ts`. Under LANGUAGE.md
"one adapter = hypothetical seam", that is normally enough to
collapse. But the test file is the second adapter that establishes
the seam as real, and the test file's leverage is high: 16 distinct
behavioural assertions per ~90 LOC of implementation. Deleting that
adapter strips the only place those assertions live.

## Consequences

- **CONTEXT.md** does not need a "Onboarding Fallback Notice" entry
  yet — the function remains a one-caller utility, not a domain-named
  module. If a second caller emerges (e.g. an admin "resend fallback"
  endpoint, or the cron pipeline filling fallback gaps), the seam
  becomes a textbook two-adapter case and should be widened, not
  collapsed.
- Future architecture reviews should not re-suggest the inline
  without one of the following changing:
  1. An integration test at the `saveUserPreferences` seam covers
     the fallback path with idempotency + subject-truncation +
     template-selection + error-path coverage equivalent to the
     current `__tests__/lib/email/onboarding-fallback-service.test.ts`
     suite.
  2. A second non-test caller emerges — at which point the deepening
     to do is widening the interface, not folding it inline.
- The dynamic-import call in `actions.ts` stays. It carries a real
  benefit (the email-rendering tree only loads on the fallback path,
  not on every `saveUserPreferences` invocation) that's lost when
  static-imported into the route bundle.

## Cross-reference

- **ADR-0006** (Financial Content Gate stays modular) — the precedent
  this ADR mirrors. The decisive test there was identical: an inline
  would have deleted a unit-test suite without an equivalent
  integration-level test at the destination seam, and the destination's
  testing substrate is heavier than the unit harness. Same shape, same
  rejection logic.
- **ADR-0002** (Inline Analysis-Depth Scoring) — the affirmative
  precedent for one-caller inlines, decisive because
  `calculateCompositeScore` integration tests at the Summarize-level
  composite already exercised the inlined scoring. The same factor
  does not hold here.
- **CONTEXT.md** "Why It Matters Guard", "Ticker Grounding Guard",
  "Numeric Grounding Guard", "Historical Context", "Enrichment Flags",
  "Staleness Banner" — the inlined-coercion-into-deep-module pattern
  this ADR consciously deviates from.
