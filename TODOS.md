# TODOS

Tracker for follow-ups that surfaced during /ship gates but are not blocking the
current PR. Each entry includes priority, what surfaced it, and the smallest
viable next action.

## P1 — pre-existing test infrastructure (surfaced by /ship #486 baseline run)

Confirmed pre-existing on bare `origin/main` via stash + re-run (15 failed / 62 passed,
identical signature). Not caused by the X sentiment email integration.

- **`NotificationService.handleSummaryReadyEvent is not a function`** — and
  `getNotificationSubject is not a function`. Tests reference methods that no
  longer exist on the class. Either restore the methods or rewrite the tests
  against the current interface.
- **`EmailFooter` unsubscribe-link assertion returns `null`.** The test queries
  by text but the link is now built from a token-bearing href; the matcher
  needs an `href`-based lookup, not text.
- **`templates.test.ts` — `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` from
  `@react-email/render`.** Needs `NODE_OPTIONS='--experimental-vm-modules'`
  (or migration to a static-renderer test helper) so the dynamic import inside
  `@react-email/render` can resolve under Jest's VM.

**Smallest next action**: open a single `chore: fix pre-existing email test
infra` PR that addresses all three — they're cheap individually but each one
on its own is too small to ship.

## P2 — onboarding A/B variant cleanup (deferred from #495 / v0.0.25.9)

**Priority:** P2

The "tell-us-about-yourself" reminder was moved into a dedicated final step in
v0.0.25.9, which de facto retired the `inline` variant of `useOnboardingVariant`.
We chose D1=B (force flag fallback to `step4` and emit `variant: "step4-polished"`
for analytics) over D1=A (delete the variant code) so the experiment
infrastructure stays available for measurement comparison.

Once the PostHog flag `onboarding-email-notice-variant` is concluded server-side
and you're confident no returning users still hold an `inline` sessionStorage/
cookie bucket (~30 days post-rollout), delete:

- `lib/hooks/use-onboarding-variant.ts`
- `components/onboarding/inline-email-notice.tsx`
- `__tests__/components/onboarding/inline-email-notice.test.tsx`
- `inlineDisclosure` prop + render in `components/onboarding/profile-step.tsx`
- Variant fork branches in `app/(auth)/onboarding/onboarding-client.tsx`
- The `'inline'` member of the `variant` union in `lib/analytics/events.ts`
- `ONBOARDING_STEPS_BASE` / `getOnboardingSteps(variant)` in `app/(auth)/onboarding/types.ts`

**Smallest next action**: ~30 min cleanup PR after the variant assignment cookie
TTL has elapsed. Scheduled remote agent `trig_01EFRvBRh139BG16wHpt8vYz` will
auto-open the PR on 2026-06-04.

## P3 — auth pages backlog (surfaced by /autoplan + /ship for v0.0.26.1)

Deferred during `wilfred-py/auth-oauth-unified`. None block onboarding or sign-up.

- **Playwright visual regression for `/sign-in` and `/sign-up`.** Tests mock
  `@clerk/nextjs` so we can't auto-detect when Clerk's internal class names or
  layout change. Today the only safety net is manual checklist in PR bodies.
  Smallest action: install Playwright, snapshot both pages on Chromium + iOS
  Safari at three viewports, run on PR.
- **Pin `@clerk/nextjs` to an exact version** (currently `^6.19.3`). When Clerk
  bumps a minor and changes internal `appearance.elements` keys, our chrome
  overrides go stale silently. Repo-wide policy decision; not auth-only.
- **Logo + value-prop above the auth card.** Adversarial review flagged the
  page reads as generic Clerk. A one-line tagline ("SEC filings, summarized.
  Free trial, no card.") above `<SignUp>` would brand it. Out of scope for
  layout PR; pair with PostHog conversion data before/after.
- **Move `?plan` / `?ref` cookie capture to `lib/auth/captureSignupAttribution.ts`.**
  Currently inline in `app/(auth)/sign-up/.../page.tsx` with a `// CRITICAL`
  comment. A future cleanup pass might delete it as "unused effect"; a named
  util makes the campaign-attribution intent grep-able and unit-testable
  without the page render.
- **Memoize `useSearchParams()` derived strings.** The cookie-capture
  `useEffect` re-runs on every render because `searchParams` returns a new
  reference. Harmless (we set the same cookie value), but wasteful. Wrap
  `[plan, ref]` in `useMemo`.

## P3 — Dashboard counter follow-ups (deferred from /autoplan #wilfred-py/animated-minutes-counter)

Deferred during /autoplan review of the animated minutes-saved counter. These
came from the CEO/Design adversarial reviews and are out of scope for the
initial ship but worth doing later.

- ~~**Move minutes-saved stat from muted-header sub-line to a dedicated hero
  card.**~~ ✅ Superseded 2026-05-04 by full pivot: removed from dashboard
  entirely; collective platform-wide counter now lives on landing-page hero
  (Stripe-GDP-counter analog). Closes the original CEO category-mistake
  critique — marketing pattern is now on a marketing surface.
- **A/B test "minutes saved" against a forward-looking metric** ("next 10-Q
  in 4d", "3 filings in your watchlist this week"). CEO review flagged
  minutes-saved as a retrospective ego stat that doesn't drive return visits.
- **Add PostHog instrumentation on dashboard stat hover/visibility** to
  measure whether the counter actually changes user behavior (CEO
  recommendation: measure before optimizing further).
- **Add formula tooltip explaining 250 WPM assumption** — the initial
  `(est.)` suffix is shallow; deeper disclosure of the
  `(input - output) * 0.75 / 250` derivation lives behind a "?" affordance.
