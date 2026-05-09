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

## P2 — Grok 4.3 migration follow-ups (deferred from /autoplan #wilfred-py/grok-4-3-upgrade)

Deferred during /autoplan adversarial review of the Grok 4.3 migration. These
came from the CEO/Eng phases and are out of scope for the deadline-driven ship
(xAI retired all prior Grok models 2026-05-15) but worth doing soon.

- **Vendor abstraction layer (`lib/ai/provider.ts`).** The migration entrenched
  single-vendor lock-in. Wrap all AI calls behind a `ModelProvider` interface
  so the next forced migration (or a vendor-diversification spike) becomes a
  config flip, not a 25-file rewrite. CEO Phase 1 flagged this as a critical
  strategic risk.
- **Spike one alternate-vendor benchmark on a 50-filing eval.** OpenAI
  gpt-4o-mini ($0.15/$0.60 per M) and Anthropic Haiku 4.5 ($1/$5) are 8× and
  comparable to grok-4.3 on input cost respectively. We never benchmarked them
  before committing to a 4-5× cost increase. Half-day of work; potential
  $thousands/month savings if Grok 4.3 isn't materially better on SEC summary
  quality.
- **Multi-vendor fallback chain via OpenRouter.** OpenRouter already abstracts
  Anthropic/OpenAI behind the same client. With current single-element chain,
  one Grok 4.3 outage during a 13D filing storm = 4-hour pipeline outage. ~2
  hours to wire a secondary vendor as the chain's second link.
- **50-filing pre/post quality eval.** This PR shipped on a 5-call dev smoke
  test; we don't actually know if grok-4.3 regresses on Form 4 transaction
  codes, 10-K narrative compression, or sentiment scoring. Build a golden-set
  diff harness (sample 50 recently-emailed summaries, regenerate on grok-4.3,
  human-rate on a 5-point rubric).
- **`lib/error-handling/model-fallback.ts` mislabel cleanup.** Line 54 labels
  `claude-sonnet-4-20250514` as "Claude 3 Opus" with $15/$75 (Opus) prices.
  Either correct the label/prices or delete the entire `ClaudeModels` map (we
  don't use it; everything runs on xAI Grok now). Used by
  `__tests__/error-handling/model-fallback.test.ts` so requires test update.
- **Cost-impact dashboard.** The Grok 4.3 migration is a 4.17× input / 5.0×
  output cost increase. Pull last 30 days of `lib/ai/cost-tracker.ts` data,
  project new monthly burn, and post the delta to PostHog/Slack so the next
  unit-economics review has a number, not a vibe.
- **xAI deadline-extension request.** When xAI next does a hard kill date,
  email enterprise support requesting a 30-day extension before assuming the
  deadline is fixed. Free option, ~1 minute. Track as a runbook item.
