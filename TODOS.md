# TODOS

Tracker for follow-ups that surfaced during /ship gates but are not blocking the
current PR. Each entry includes priority, what surfaced it, and the smallest
viable next action.

## ✅ P0 — xSentiment payload silently dropped before DB persistence (FIXED 2026-05-09 on `wilfred-py/sentiment-citations`)

**Root cause**: `storeSummary` in `services/filings/database/filingDatabase.ts`
constructed `summaryJSON` for the DB column from a fixed scalar field set
(`accessionNumber`, `keyPoints`, `model`, `cost`, etc.) and never included
`xSentiment`. All three caller-services (`filingSummaryService.ts`,
`enhancedFilingSummaryService.ts`) were passing scalars from `summarizeFiling`'s
return object but not the nested `summaryJSON.summaryJSON.xSentiment` field
that carries the F3-validated payload.

**Fix shipped** (3 files):
- `services/filings/database/filingDatabase.ts:248-253` — `storeSummary`
  conditionally includes `metadata.xSentiment` on the persisted summaryJSON
  (mirrors the existing `failureReason` pattern).
- `services/filings/summaries/filingSummaryService.ts` — 3 call sites
  (success + 2 fallback paths) now thread
  `summaryJSON.summaryJSON?.xSentiment` via metadata.
- `services/filings/summaries/enhancedFilingSummaryService.ts` — success +
  parser-fallback paths same.

**Verification**: real-pipeline test against TSLA 10-K/10-Q/8-K confirms
the persisted `Summary.summaryJSON` now has 16 keys (15 + xSentiment), with
inline `[N]` markers in `factClaims` and `discussionSynthesis`. Re-sent emails
to `wilfredchen1@gmail.com` rendered 25 inline citation anchors total from
real Grok output. Resend IDs `953334e6-...`, `edf47c5f-...`, `f07d9148-...`.

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
## P2 — sentiment-citations follow-ups (surfaced by /autoplan on `wilfred-py/sentiment-citations`, 2026-05-06)

Bundled "scope C" PR ships Track 1 (coverage to 5 templates) + Track 2 (inline `[N]`
citations). The autoplan adversarial review surfaced these as out of scope but
worth doing next:

- **Form-type-aware sentiment prompts.** CEO C3 + Design D1: Form 4 should
  anchor sentiment on the specific insider transaction, not general ticker
  buzz. DEF 14A should use a support/opposition direction taxonomy, not
  bullish/bearish. Form 144 / S-3 may not warrant sentiment at all.
- **Click-through telemetry on Sources footer.** CEO C1 evidence-first
  request: instrument the existing `<a>` tags so we can decide whether the
  footer is actually useful before doubling down on per-claim provenance.
- **Information-overload redesign.** Design D3: synthesis paragraph + bullets
  + inline markers + footer is 4 layers of provenance for the same fact. Pick
  two. Refactor is its own PR.
- **13D template migration to minimalist + sentiment wiring.** Today's
  `13d-template.tsx` is the older non-minimalist style; bring it onto the
  minimalist component surface, then wire sentiment.
- **Per-prompt eval suite for X sentiment.** No fixture-based regression
  evals exist today — the pipeline relies on F3 + counters. Add a small
  fixture set so prompt changes can be regression-tested.
- **Embedded tweet preview cards.** 12-month feature — pull preview metadata
  from x.com OEmbed API (or static thumbnails) so users see the source
  without leaving inbox.
- **Apple Mail dark-mode review.** Existing tokens may invert poorly; do a
  dedicated visual review of all 8 template + section combinations once
  Track 1 + Track 2 ship.
- **factClaims-empty + opinion-only payload handling (adversarial #2).**
  `shouldRenderXSentiment` now hard-rejects when `factClaims.length === 0`,
  which silently drops payloads where the model legitimately returned
  synthesis + opinionClaims + valid citations but no facts. Cost is spent on
  `x_search` and the section never renders. Better: render synthesis-only
  block (drop the bullet sub-block) when factClaims empty but synthesis +
  citations are valid. UX redesign — tracked here so the conservative current
  guard isn't load-bearing.
- **Document the 10-citation cap to the model (adversarial #3).**
  `MAX_CITATIONS = 10` in the validator; the prompt in
  `lib/ai/x-sentiment-provider.ts:113-148` doesn't tell the model. If Grok
  emits index `[11]` or higher, validator drops it silently. Add "max 10
  sources; do not cite indices above 10" to the prompt to keep model output
  in lockstep with the cap.
- **Don't expose `MARKER_REGEX` via `_internal` (adversarial #4).** Tests can
  use `.test()`/`.exec()` on the shared `/g` regex, mutating `lastIndex` and
  flaking concurrent `splitTextOnMarkers` calls. Either drop from `_internal`
  exports or convert to a getter that returns a fresh regex instance.
- **Add `rel="noopener noreferrer"` to citation anchors (adversarial #6).**
  `XSentimentSection.tsx:51` renders `<a>` without `rel`; webmail clients add
  implicit `target="_blank"` which leaves a reverse-tabnabbing surface
  against x.com. Cheap fix.
- **Verify `monitoring.incrementCounter` in `XSentimentBlock` doesn't double
  on react-email re-render (adversarial #7).** Confirm `react-email/render` is
  single-pass for production. If it does retry/render twice in any code path,
  counter doubles silently. Move to call-site or guard with a render-time
  marker.
