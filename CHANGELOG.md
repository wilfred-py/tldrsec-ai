# Changelog

All notable changes to this project will be documented in this file.

## [0.0.40.1] - 2026-06-04

### Removed
- `lib/hooks/use-onboarding-variant.ts` — deleted; the PostHog flag
  `onboarding-email-notice-variant` was never created, variant resolution
  always hit the 500ms fallback to `step4`, and the 30-day `ob_variant`
  cookie TTL has now elapsed so no returning users remain bucketed in
  `inline`. All A/B infrastructure is gone.
- `components/onboarding/inline-email-notice.tsx` — Variant B component
  (inline disclosure inside ProfileStep AUM sub-step) deleted.
- `__tests__/components/onboarding/inline-email-notice.test.tsx` — tests
  for the deleted component deleted.

### Changed
- `app/(auth)/onboarding/onboarding-client.tsx` — removed `useOnboardingVariant`
  hook, `!resolved` skeleton guard, `inlineDisclosure` wiring, and Variant B
  branch in `handleProfileComplete`. Step 4 (ConfirmStep) now renders
  unconditionally. `handleCompleteOnboarding` no longer accepts a
  `profileOverride` argument.
- `components/onboarding/profile-step.tsx` — removed `inlineDisclosure`
  optional prop and its render slot below the AUM radios.
- `app/(auth)/onboarding/types.ts` — replaced `ONBOARDING_STEPS_BASE`,
  `ONBOARDING_STEPS_WITH_CONFIRM`, `getOnboardingSteps`, and
  `OnboardingVariantKey` with a single `ONBOARDING_STEPS` constant (4 steps).
- `lib/analytics/events.ts` — removed `ONBOARDING_VARIANT_ASSIGNED` event;
  narrowed `ONBOARDING_COMPLETED.variant` to `'step4-polished'` and
  `step_count` to `4`.
- Tests updated to match: variant mocks removed, 3-step and inline-variant
  test blocks deleted.

This completes the deferred P2 cleanup from PR #495 (v0.0.25.9).

## [0.0.40.0] - 2026-06-01

### Added
- `lib/analytics/events.ts`: six new events that close the visibility gap
  between `$pageview` on `/sign-up` and `$identify` after Clerk completes.
  Today the funnel goes dark inside the Clerk widget — no telemetry until
  the user successfully signs in. New events:
  - `signup_page_arrived` (server-side, fires before any client JS — catches
    visitors even when the browser SDK is blocked or never loads)
  - `signup_widget_rendered` (Clerk form DOM observed)
  - `signup_email_entered` (first keystroke in email field)
  - `signup_password_entered` (first keystroke in password field)
  - `signup_submitted` (form submit; carries whether email/password were
    entered to split bot-style submit-without-typing from real form fills)
  - `signup_failed` (Clerk error text rendered; de-duped on the same error
    text to avoid spamming on retry keystrokes)
- `app/(auth)/sign-up/[[...sign-up]]/page.tsx`: server component that fires
  `signup_page_arrived` on root `/sign-up` arrivals only (skips
  `verify-email` and `sso-callback` continuation sub-routes so the funnel
  top isn't inflated). Captures `sub`, `utm_*`, `plan`, `ref`, `referer`,
  `user_agent`. Uses `next/server`'s `after()` to flush PostHog after the
  HTML has streamed.
- `app/(auth)/sign-up/[[...sign-up]]/signup-client.tsx`: new client child
  containing the existing campaign-cookie logic plus a MutationObserver
  that attaches DOM listeners to Clerk form fields. Each instrumentation
  event fires at most once per mount (except submit and failed, where
  retries are meaningful signal).
- `lib/analytics/distinct-id.ts`: extracted `resolveDistinctId` and
  `anonymousDistinctId` from `landing-flags.ts` so the sign-up server
  component reuses the same anon-id scheme. PostHog can now join landing
  exposure → sign-up arrival for the same anonymous visitor before Clerk
  identify runs.

### Changed
- `lib/analytics/landing-flags.ts`: delegates to the shared distinct-id
  module instead of inlining the resolver. Behaviour unchanged.

## [0.0.39.0] - 2026-05-28

### Fixed
- `app/api/unsubscribe/route.ts`: previously wrote `{ unsubscribed: true }` to a
  column that does not exist on `newsletter_subscribers` (real column is
  `unsubscribed_at` timestamptz). Any request to this endpoint hit a silent
  PostgREST error and was never marked unsubscribed. Investigation of the
  launch-2026-05 send found 9 real Chrome users landed on `/unsubscribe` on
  launch day with zero rows updated in the DB.
- `lib/email/email-link-tokens.ts`: `generateUnsubscribeUrl` now points at
  `/api/unsubscribe` instead of `/unsubscribe`. The page route had no POST
  handler, so Gmail/Yahoo RFC 8058 one-click POSTs (paired with the
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header on every send)
  returned 405 Method Not Allowed. Native inbox unsubscribe was non-functional
  for all 124 launch recipients.
- `app/unsubscribe/page.tsx`: removed the second "Confirm Unsubscribe" click.
  The page now auto-executes the unsubscribe action on mount, matching the
  industry-standard single-click expectation. Pre-fix: 9 page views, 0
  completions (100% abandonment at the confirm step).
- `app/unsubscribe/actions.ts`: server action now lowercases + trims the
  email decoded from the token before lookup, matching the normalization
  `/api/unsubscribe` applies and what the waitlist insert stores.

### Added
- `app/api/unsubscribe/route.ts`: `POST` handler for RFC 8058 one-click.
  Returns 200 with no body (no redirect — mail clients won't follow).
- `EVENTS.UNSUBSCRIBE_COMPLETED`: PostHog event fired from the page on
  successful unsubscribe so the funnel (page view → action success → DB
  write) becomes observable going forward.
- `__tests__/api/unsubscribe.test.ts`: GET + POST coverage, regression guard
  asserting the route writes `unsubscribed_at` (not `unsubscribed`), and
  email casing normalization.

## [0.0.38.0] - 2026-05-26

Wires the cron trigger + dedup infrastructure for the Wed 27 May 2026 VRT
10-Q broadcast and the Wed 3 Jun 2026 Lifetime $499 follow-up — sends to
124 waitlist subscribers (8 EU / 116 US). Until this PR, no automated
trigger existed for either campaign; routine reminders fired but nothing
actually called `POST /api/admin/campaign/send`.

### Added
- `.github/workflows/launch-broadcast.yml`: four-schedule launch cron with
  workflow_dispatch fallback. Wed 27 May VRT (EU 07:30 UTC, US 11:00 UTC)
  curls the bearer-auth admin route; Wed 3 Jun Lifetime (same windows)
  runs `scripts/founding/send-founding-batch.ts` in CI. Year-guard prevents
  re-fire on 27 May 2027+. HTTP 409 (idempotency dup) treated as success.
- `lib/supabase/migrations/create-founding-sends.sql`: per-email dedup
  store for the Lifetime script. Replaces the local `sent.jsonl` (which
  doesn't survive CI runs or workstation crashes). PRIMARY KEY (email)
  blocks re-send; failed rows upsert on retry.
- PostHog event lifecycle: `email_sent`, `email_bounced`, `email_complained`
  now fire from the Resend webhook handler. Closes the "no leading-edge
  events in PostHog" gap so launch open-rate dashboards work end-to-end.

### Changed
- `scripts/founding/send-founding-batch.ts`: dedup moved from local jsonl
  to Supabase `founding_sends` table. Local jsonl still appended as a
  best-effort forensic trail. Same script signature; CI-friendly.
- `app/api/webhook/route.ts`: bounce / complaint events now forward to
  PostHog alongside the existing newsletter_subscribers suppression write,
  so the funnel-failure dashboard has bounce metadata without a Resend
  round-trip.

### Out-of-PR (applied to prod outside this PR)
- PR #584's three pending SQL migrations applied (page_analytics anon-policy
  drop, _prisma_migrations RLS, search_path pin).
- `founding_sends` table created in prod Supabase.
- Resend webhook `f6897df7-d0b7-4511-9cc1-be748dd909a1` configured to POST
  sent/delivered/opened/clicked/bounced/complained to
  `https://tldrsec.app/api/webhook?provider=resend`.
- `RESEND_WEBHOOK_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` set in Vercel prod
  env (marked sensitive). `SUPABASE_SECRET_KEY` (legacy fallback) synced
  to the same value. Five GH Actions secrets added: `LAUNCH_CRON_TOKEN`,
  `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `EMAIL_DEFAULT_REPLY_TO`.

### Known follow-up
- Lifetime script has no transactional pre-claim between SELECT and
  per-row upsert. Two parallel CI runs (manual + scheduled in the same
  region) could theoretically double-send. Mitigated by the workflow's
  concurrency group within trigger-type but not across types. Will fold
  into a follow-up PR if the 3 Jun send hits the race.

## [0.0.37.0] - 2026-05-25

Fixes the NVDA 2026-05-20 "no extractable financial metrics" failure and
the underlying class of bug. The summarization pipeline was passing raw
inline-XBRL HTML directly to the LLM for every 10-Q/10-K filing since 2019.
The model saw `<ix:nonFraction>81600</ix:nonFraction>` tag soup instead of
"$81,600 Revenue" and produced a give-up summary admitting the data was
unavailable. Confirmed blast radius across the last 30 days: 5 shipped
summaries (3 NVDA, 1 PLTR, 1 GS), all 10-Q.

### Added
- iXBRL preprocessing in `cleanHtmlContent`: strips `<ix:hidden>` blocks,
  unwraps `<ix:nonFraction>` / `<ix:nonNumeric>` / `<ix:continuation>` to
  preserve visible values, removes XBRL/XLink namespace schema noise.
- Markdown heading promotion: SEC's de-facto section headers ("PART I",
  "Item 1.", "Item 1A.") are now promoted to `#` / `##` so downstream
  section-aware code can split on them.
- Section extractor (`lib/parsers/sec-section-extractor.ts`): segments
  cleaned text into canonical `SECFilingSection` buckets. Form-type aware:
  10-Q Item 1 = Financial Statements; 10-K Item 1 = Business Overview.
- Priority-budget prompt builder: `buildSectionedPrompt()` assembles
  section content in priority order. Financial Statements always survives
  budget pressure; truncates from low-priority sections first.
- `FilingContentCache.cleanedContent` + `cleanedAt` columns store the
  iXBRL-cleaned text alongside raw HTML for downstream reuse.
- Self-healing cleanedContent read: when null (pre-deploy rows), the
  summarizer cleans on-the-fly and writes back. Behaves as a write-through cache.
- Bad-phrase post-LLM gate: catches "no extractable", "are unavailable",
  etc. in summary text and fails the gate even when `financialHighlights` populates.
- ADR-0005 documents HTML iXBRL parsing as primary, with the SEC
  Companyfacts JSON API reserved for a future numeric validation gate.
- `scripts/backfill-bad-summaries.ts` discovery + dry-run for identifying
  shipped summaries that need re-processing.

### Changed
- Pre-LLM content gate (`hasFinancialStatementSignal`) now requires the
  statement-title signal for strict-financial forms (10-K, 10-Q, 20-F,
  6-K, amendments). The 3-of-5 generic threshold could be satisfied by
  iXBRL noise alone.
- Minimal-content trap eliminated for strict-financial forms: the
  summarizer no longer falls through to the metadata-only prompt that
  told the LLM to "acknowledge limited information available" — the exact
  source of the NVDA failure language. Now throws `INSUFFICIENT_CONTENT`.
- `AI_INSUFFICIENT_CONTENT` is now non-retriable on the cache-read path.
  Cache returns the same bytes on retry — retries wasted budget.
- 8 SEC fetcher User-Agent strings standardized to
  `tldrSEC support@tldrsec.app` (SEC's preferred "Name email" format).
- New `Extractable` and `SEC Section` entries in `CONTEXT.md` glossary.

### Fixed
- 10-Q Part II "Item 1. Legal Proceedings" was being incorrectly routed
  to Financial Statements by the section extractor's catchall pattern.
  Now matched by an explicit `/Item\s+1\.\s*Legal/` rule.
- `processingErrorCode` vocabulary centralized via `PROCESSING_ERROR_CODES`
  constant in `lib/db/summary-status.ts`.

## [0.0.36.0] - 2026-05-21

Launches the Founding Lifetime Seat offer: 25 one-time $499 payments grant
permanent MAX-tier access. Hits 124 waitlist members in two regional batches
on Wednesday morning. Includes the full Stripe integration, the entitlement
model, the user-resolution backstop (auto-create placeholder rows so the
122 of 124 waitlist members without Clerk accounts can pay without manual
reconciliation), and an account-takeover guard on the Clerk webhook.

### Added
- New private offer page at `/founding` with live seat counter and three states (primary, last-3-seats urgent, sold-out)
- New checkout route `/api/checkout/founding` with server-side 25-seat gate (returns 410 Gone when sold out) and waitlist allowlist check (`newsletter_subscribers` membership required)
- New post-checkout page `/founding/success` with Clerk signup CTA
- New Stripe webhook handlers: `handlePaymentModeCheckout` for one-time Founding payments with auto-create placeholder User if email is not yet in `User`, `handleChargeRefunded` for 30-day refund revocation (guarded against partial refunds)
- New `User.foundingMember: Boolean` schema field plus migration
- New `LIFETIME_NEVER_EXPIRES` sentinel constant plus `isLifetimeSentinel()` helper
- New `syncLifetimeSeat()` and `revokeLifetimeSeat()` atomic transactional helpers
- New `scripts/founding/send-founding-batch.ts` for one-to-one Resend sends (region-split by email domain heuristic, idempotency via local `sent.jsonl`, dry-run mode)
- New `scripts/founding/revoke-lifetime-seat.ts` manual revoke escape hatch
- New `scripts/founding/pre-populate-waitlist-users.ts` alternative path (not used for the launch, kept for future cohorts)
- New PostHog events `LIFETIME_SEAT_CLAIMED` and `LIFETIME_SEAT_REVOKED`
- New env var `STRIPE_FOUNDING_LIFETIME_PRICE_ID` (the one-time $499 Stripe Price under the dedicated "tldrSEC Lifetime" Product)

### Changed
- Clerk webhook (`handleClerkWebhook` `user.created`) now links Clerk identity onto a pre-existing User row only when `authProvider='pending'` (account-takeover guard) and uses lowercased email lookup to match how all other code paths store the email
- `handleSubscriptionCreated` plus `syncSubscriptionFromStripeData` refuse to overwrite a Lifetime Seat sentinel row, preserving lifetime entitlement if a holder ever triggers a regular subscription flow
- `/api/user/route.ts` POST (subscribe) rejects callers who already hold a Lifetime Seat with 409 plus "Lifetime Seat active" message
- Billing page (`app/dashboard/billing/page.tsx`) renders "Lifetime access. Never expires." for Lifetime holders instead of "Renews on December 31, 9999"
- `getPlanTypeFromPriceId` maps the Founding lifetime priceId to `'MAX'` (the cohort gets MAX features)
- x_sentiment ticker allowlist expanded from ~107 (S&P 100) to 505 (S&P 500 plus BRK.A and WBA grandfathered) so older retail investors tracking mid/large caps outside the top 100 get enrichment too
- `/founding` checkout no longer reuses Stripe customers by email (always creates a fresh Customer to avoid attaching payments to the wrong account)
- `/founding` checkout `success_url` origin pinned to `NEXT_PUBLIC_SITE_URL` to close a Host-header phishing redirect vector
- ADR-0004 documents the entire entitlement model, sentinel pattern, refund revocation flow, and the rationale for choosing a dedicated "tldrSEC Lifetime" Stripe Product

### Fixed
- Stripe webhook URL was misconfigured at `https://tldrsec.app/api/webhook/stripe` (returned 404) instead of `https://tldrsec.app/api/webhook?provider=stripe`. Updated via Stripe CLI. Without this fix, every Founding payment would have completed in Stripe and silently failed to update the database.
- `charge.refunded` event was not subscribed; added to the webhook's enabled events so the new revoke path actually fires
- Partial refunds no longer trigger full Lifetime Seat revocation
- `/api/checkout/founding` 500 responses no longer leak raw Stripe and Prisma error messages

## [0.0.35.2] - 2026-05-21

Polish pass on the 2026-05 waitlist launch hero after Wilf's visual critique
on the v0.0.35.0 template. Wednesday send was cancelled; new target TBD.

### Changed

- `Form10QMinimalistTemplate` — moved founder note to AFTER the SEC link
  + materiality rationale, moved the X sentiment block to AFTER the SEC
  link rationale (so the analyst content closes first and sentiment lands
  as its own section), left-aligned the launch CTA button, reduced padding
  after Why-It-Matters and after the SEC link block, increased breathing
  room between the CTA and the founder signoff. SEC link now flows through
  `getSecFilingViewerUrl()` so it routes to the actual filing rather than
  the EDGAR search results page (regression of the `ce087d2e` fix from
  campaign + production paths into this template's inline SEC link).
- `PillDelta` — YoY/QoQ pill values no longer pad trailing zeros. `+30%`
  stays `+30%`, `+3.8%` stays `+3.8%`, `0%` stays `0%`. Integers no longer
  display as `X.00%`. Real fractional precision preserved.
- `XSentimentSection` — `renderTextWithCitations` now honors inline
  `**bold**` markdown in the discussion synthesis (Bloomberg-style lead
  bolding). Strong runs render as `<strong>`. Citation markers and bold
  runs compose cleanly.
- 2026-05 launch fixture — replaced "Full-Year EPS Guide" scorecard row
  (which only said "raised") with **Adj Op Profit** ($551M Latest, $347M
  Previous, +59.2% YoY, -17.5% QoQ — direct dollar measure of earnings
  power, better long-term correlate). Scorecard deltas now use 1-decimal
  precision computed from real Q1 2026 / Q1 2025 / Q4 2025 actuals. WIM
  + summary prose rewritten with Bloomberg-style bold paragraph leads
  and explicit `+`/`-` signs on every delta so inline pills color
  correctly. X sentiment synthesis rewritten with `**Bulls**` / `**Bears**`
  / `**Sell-side**` lead bolding. Twitter references removed (X is X).
  Founder note trimmed (multibagger paragraph dropped) with more
  paragraphing for skim-ability.

## [0.0.35.1] - 2026-05-20

Adds the Stripe documentation skills to `.agents/skills/` so AI coding agents
working in this repo have inline guidance for Stripe integration decisions
(API selection, Connect, billing, security) and Stripe API/SDK upgrades.
Tooling-only — no runtime or product changes.

### Added

- `.agents/skills/stripe-best-practices/` — Stripe integration guidance
  (Checkout vs PaymentIntents, Connect Accounts v2, billing/subscriptions,
  Treasury, restricted keys, webhook security).
- `.agents/skills/stripe-projects/` — provisioning Stripe services via
  projects.dev.
- `.agents/skills/upgrade-stripe/` — Stripe API version and SDK upgrade
  playbook.
- `skills-lock.json` — manifest tracking the three installed skills and
  their content hashes, sourced from `docs.stripe.com` via the `skills` CLI.

## [0.0.35.0] - 2026-05-17

Waitlist launch infrastructure for the Wed 2026-05-20 broadcast to 124
subscribers. The admin send route gains a region-mode path so the cron-fired
EU + US batches can target geo-classified subscribers without disturbing the
existing cohort-mode flow. A new launch-hero renderer composes the VRT Q1 2026
10-Q summary with a left-aligned founder note via the new
`founderNoteVariant: 'letter'` prop. Onboarding replies now route to the
founder inbox instead of a black-hole `no-reply` alias.

### Added

- **Region-mode send** in `app/api/admin/campaign/send/route.ts` — POST
  `{ region: 'us' | 'eu', emailNumber, dryRun? }` filters subscribers in-memory
  via `classifyRegion()` and slots `campaign_sends.cohort_id` under
  `region-us` / `region-eu` so the existing
  `UNIQUE (campaign_id, cohort_id, email_id, variant)` idempotency constraint
  still applies. Cohort-mode (legacy) is untouched.
- **Region classifier** (`lib/email/region-classifier.ts`) — deterministic
  TLD + regional-domain bucketing for the 124-subscriber waitlist. Defaults
  to US for ambiguous gmail/yahoo, EU for `.co.uk`, `.de`, `.fr`, `btinternet`,
  `gmx.de`, `googlemail.com`, and 11 other regional domains.
- **`LAUNCH_ARMED` env-flag gate + Bearer-token cron auth path** on the send
  route. Cron-fired sends authenticate via `Authorization: Bearer
  $LAUNCH_CRON_TOKEN` and no-op until `LAUNCH_ARMED=true` is set in Vercel
  prod. Admin-clicked sends bypass the gate (the click is the arm). Constant-
  time token compare via `crypto.timingSafeEqual`.
- **`founderNoteVariant: 'letter'`** prop on `CampaignDemoTemplate`. Splits
  `founderNote` on blank lines into multi-paragraph left-aligned 14px prose;
  preserves `\n` within a paragraph as `<br>` so the
  `Founder, tldrSEC` / `Wilf` signoff renders on two lines.
- **VRT Q1 2026 10-Q launch payload** (`lib/email/__fixtures__/launch-2026-05-vrt.ts`)
  and **launch-hero renderer** (`lib/email/launch-hero-renderer.ts`). Locked
  subject: `"The AI 10-Q most investors missed: Vertiv's backlog doubled to
  $15B"`. Numbers verified against Vertiv's Q1 2026 press release.
- **`FOUNDER_REPLY_TO` constant** in `lib/email/config.ts`. Single source of
  truth for `wilf@tldrsec.app`, referenced from the resend config default,
  both welcome-service paths, and the route's `reply_to`.
- **91 new tests:** region-classifier (54), region-send + cron-auth (14),
  launch-hero renderer (6), reply-to regression (5), founderNoteVariant (6),
  plus content fact-check tests.

### Changed

- `EMAIL_DEFAULT_REPLY_TO` env fallback in `lib/email/config.ts` now defaults
  to `wilf@tldrsec.app` (was `no-reply@tldrsec.app`). Replies to onboarding
  and campaign emails now land in a real inbox.
- `welcome-service.ts` sets `replyTo` explicitly on both `queueWelcomeEmail`
  and `sendWelcomeEmail` so the founder reply address survives any future
  config rollback.
- From address branding in the admin send route updated to `tldrSEC` (was
  `TLDRSec`) to match the canonical spelling everywhere else.

### Fixed

- Onboarding welcome emails previously bounced any reply because the route
  fell through to `no-reply@tldrsec.app`. Replies now reach the founder inbox.

## [0.0.34.0] - 2026-05-17

The earnings mini deep-dive — PR1 of the rollout — lands. 10-K and 10-Q
summary emails now classify overall materiality, surface a story-first
synthesis, route web-search enrichment to earnings filings, and ship a
fully redesigned scorecard + segment-chart visualization layer. All
behavior is gated behind the `enable_earnings_mini_deep_dive` PostHog
flag — off everywhere by default, so production emails are unchanged
until the flag flips on for a cohort.

### Added
- **Materiality signal on 10-K / 10-Q summary emails.** Each annual/quarterly summary classifies overall materiality as `high | medium | low | noise` with a 40-400 char rationale. Renders as a colored badge in the email header (amber / indigo / slate), with a one-click `mailto:materiality-feedback@tldrsec.com` link below for quality reporting. The rubric is symmetric — large beats are as material as large misses — to avoid asymmetric-classifier failure modes that systematically underweight positive surprises.
- **Materiality calibration harness** at `scripts/materiality-calibration/`. Reproducible 3-step pipeline: stratified 30-filing sampling from `pipeline.FilingContentCache`, Opus-labeled ground truth, and a runner that scores the production rubric (grok-4.3) and emits a confusion matrix with a 75% accuracy gate. Production rubric passes at 76.7% (23/30). Total iteration cost: $1.92.
- **Per-form `whyItMatters` prompt** consolidates the email's interpretive section into one 200-1000 char multi-paragraph synthesis (`WHY_IT_MATTERS_PROPERTY_10K`, `WHY_IT_MATTERS_PROPERTY_10Q`). The prompt forbids metric restatement, requires forward-looking risks to be folded INTO the prose (not enumerated), and instructs the model to compare voices across the filing's narrative, X-sentiment, and web-search enrichment context. Worked BAD vs GOOD examples in the extraction guidance show the desired tone.
- **Web-search enrichment routed to 10-K / 10-Q** via `ENRICHMENT_FORM_TYPES`. The existing `runEnrichment` orchestrator (45s budget, ~$0.003/filing) now fires on earnings filings for MAX-tier allowlisted tickers. Previously the routing excluded them, leaving the WIM property's "use web-search context" instruction dead code for the exact forms it targeted.
- **`MetricPill` chip component** (`sections/PillDelta.tsx`) wraps prior and current scorecard values in grey and white pill chips respectively, matching the scorecard's visual register on every cell instead of just the YoY delta column.
- **`wrapPercentsInPills` helper** (`lib/email/pill-pct.ts`) post-processes markdown HTML to wrap every percentage token (`+X%`, `-X%`, `X%`, `Xpp`) in colored chip spans — green for positive deltas, red for negative, neutral grey for unsigned magnitudes. Applied to summary prose, story narratives, watch-for items, and the WIM block so prose reads with the same skim semantics as the scorecard.
- **Shared `PillDelta` component** (`sections/PillDelta.tsx`) extracted from inline 10-Q template code so both 10-K and 10-Q render scorecard pills via the same module.
- **44 + 6 tests across 4 new suites.** Schema parsing, materiality extraction defaults, badge rendering, per-form WIM swap (300+, 1000-char cap), flag-strip contract. All 100+ PR1-related tests green.

### Changed
- **Story-first email layout.** Summary prose now leads the body (moved out from below the materiality badge); the Earnings / Annual Scorecard sits below; segment mix follows for 10-K; X-sentiment lives standalone; "Why It Matters" closes the body as a full-width black-bar section with multi-paragraph markdown rendering. The "What to Watch" section is removed — forward-looking risks fold into the WIM synthesis instead. Bottom of the email carries the SEC filing link (plain blue hyperlink), materiality rationale + "Wrong call?" feedback, then the CTA button.
- **10-K scorecard redesigned to mirror the 10-Q "Earnings Scorecard" layout.** Full-width black-bar header reading "Annual Scorecard", 4-column right-aligned table (Metric | Previous | Latest | YoY), no inline arrows. Alternating row backgrounds, 2dp value formatting.
- **10-Q scorecard gains a dedicated `Previous` column** to the left of `Latest`. Previously the prior value rendered inline within the Latest cell as `[muted] → [current]`, which broke vertical alignment across rows.
- **Segment-mix bar chart.** Dual-bar visualization: a current-year bar on top (full segment color, accent border on the left) and a prior-year bar below in neutral grey (`#E5E7EB`) with the segment's accent color as a thin left border, signifying the previous year's revenue. Bar widths use per-segment sqrt slots with within-slot linear ratio against `current / (1 + growth%)`, so the gap between current and prior bars is the YoY revenue jump rendered as a delta. Percentage labels render inside every bar (no longer skipped for small segments). Growth pill is right-aligned at the row edge.
- **CTA button** reads "Want more filings like this?" and links to `tldrsec.app/?utm_source=email&utm_campaign=filing_summary`. The SEC filing link is rendered separately as a blue hyperlink above the rationale block (no longer the primary CTA).
- **Materiality rationale moved to the bottom** (just above the EmailFooter CTA). Top of the email now carries only the badge, leaving more vertical space for the summary lede.
- **`whyItMatters` schema cap bumped 180 → 1000 chars** (for 10-K / 10-Q under the flag) to accommodate 2-3 paragraph synthesis output. Legacy 180-char cap stays for all other form types.

### Fixed
- **`wrapPercentsInPills` regex never matched any prose `%` token.** The regex ended with `\b` (word boundary) after the unit group, but `%` is a non-word character so a following space or punctuation produced no boundary — every prose pill silently failed. Replaced with `(?![a-zA-Z])` lookahead. Rendered emails now ship 27+ colored prose pills per body where previously they shipped 1 (scorecard only).

### Notes
- **No production behavior change without the flag.** `enable_earnings_mini_deep_dive` is off everywhere by default. The schema swap (per-form WIM property, materiality property) and extraction-guidance blocks are stripped in `generateFilingPrompt` when the flag is off, so off-flag filings produce exactly the same prompt as before and the templates render with the legacy WIM defaults. PR2 / PR3 of the rollout will ramp the flag.
- **Single-layer flag gate.** The schema-strip is the load-bearing contract — if the field doesn't enter the JSON, the render path's noise default takes over for free. Three-layer gating (schema, prompt, render) would create three places to drift apart; the flag-gate test suite asserts the schema strip is sufficient.

## [0.0.33.0] - 2026-05-17

### Fixed
- **Form 4 emails now show every indirect-holding entity instead of silently truncating to three.** Investors reviewing Meta's COO Form 4 (2026-05-13) were missing two of five ownership entities, including the largest position (an 85,189-share family trust). The Ownership breakdown table in the minimalist Form 4 email was hard-capped at three entries via `getOwnershipBreakdown(...).slice(0, 3)`. Cap removed; every distinct `(form, nature)` entity now renders. Regression test added with the full five-entity Meta scenario. (`components/ui/email/templates/form4-minimalist-template.tsx`, `__tests__/email/form4-template-rendering.test.ts`)
- **`HOLDINGS: X → Y (Z%)` row now computes Z deterministically from X and Y.** The LLM-supplied `percentageChange` used an unreliable denominator (Meta example: reported `-18.50%` from `total disposed across all tables ÷ (post-direct + total-disposed)`, instead of the direct-stake change of `-11.90%`). `normalizeForm4Data` now derives `percentageChange` from `previousStake` and `newStake` whenever both are present, so the percentage matches the two numbers the email actually renders. (`lib/email/form4-field-normalizer.ts`, `__tests__/email/form4-field-normalizer.test.ts`)

## [0.0.32.2] - 2026-05-17

### Added
- **`scripts/send-pr1-test-email.ts` is now tracked in the repo.** The PR1 materiality-badge test-send harness was previously local-only in one Conductor workspace, so re-sending the canonical NVDA 10-K + CMG 10-Q test emails required hunting down the right machine. The script is now allowlisted in `.gitignore` and ships with the repo — anyone with `.env.local` can re-render and re-send the PR1 fixtures.

### Changed
- **PR1 test emails no longer surface the "summary was delayed" banner.** The PR1 fixtures use real (older) NVDA and CMG filing dates so the materiality pill, financial scorecard, and X-sentiment data stay grounded — but the consequence was every test inbox showed an amber "This summary was delayed — the filing was originally filed N days ago" warning that pulled attention away from the summary. `send-pr1-test-email.ts` now runs `stripStalenessBanner()` on the rendered HTML before sending, scoped to the script only. Production templates (`10k-/10q-/8k-/form4-minimalist`) are untouched and real customer emails still surface the staleness warning.

## [0.0.32.1] - 2026-05-16

### Added
- **`/grill-with-docs` Claude Code skill** at `.claude/skills/grill-with-docs/SKILL.md`. Interactive plan stress-test that sits between `/office-hours` and `/autoplan`: walks the design tree one question at a time, challenges fuzzy or conflicting terminology against the repo's domain glossary, cross-references claims with the actual code, and updates `CONTEXT.md` inline as terms get resolved. Offers an ADR only when the change is hard to reverse, surprising without context, and the result of a real trade-off. Adapted from Matt Pocock's open-source skill ([source](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs)) to reference the repo's existing `CONTEXT.md` and `docs/adr/README.md` formats instead of bundling Pocock's CONTEXT/ADR format files, so the autonomous architecture review routine and this skill write the same shape of entry.
- **Skill routing entry in `CLAUDE.md`.** One line in the Skill routing section so `/grill-with-docs` is the recognized hop between idea-shaping and execution-planning.

## [0.0.32.0] - 2026-05-13

### Changed
- **Dashboard and summary pages now stream.** Clicking into a summary used to show 3-4 seconds of skeleton cards before any real content appeared; navigating back to the dashboard took ~5 seconds. Both routes now render their shell (breadcrumb, header, navigation) in ~50ms while the heavy data fetches stream in via React Suspense. Back-nav within 10 seconds hits the Router Cache and returns instantly. Suspense boundaries gain `aria-live="polite"` + `role="status"` so screen readers announce streamed content arrival.

### Fixed
- **Production was running without security headers.** `next.config.ts` existed but had no `export default`, leaving Next.js to load `next.config.js` instead. The `.ts` file's intended features — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy: strict-origin-when-cross-origin` on `/api/*`; `Cache-Control: no-store` on `/api/cron/*`; production `console.log` stripping via `compiler.removeConsole`; the `DEPLOYMENT_PLATFORM` env — were all silently dead. Merged everything into the canonical `next.config.js` and deleted `next.config.ts`. Documented in `CLAUDE.md` item #18 to prevent regression.
- **Editing or removing a ticker no longer leaves stale dashboard data.** `app/api/user/tickers/[id]/route.ts` PATCH and DELETE now call `revalidatePath('/dashboard')` (POST already did), so any change to the user's ticker list invalidates the Router Cache immediately instead of waiting up to 10 seconds.

### Added
- **Router Cache TTLs (`experimental.staleTimes`).** Set `dynamic: 10, static: 180` in `next.config.js`. Back-navigation to dynamic dashboard pages within 10 seconds now serves cached HTML while Next revalidates in the background. 10s (not 30s) accommodates the SEC filing cadence — filings cluster at market open/close, so a longer window would feel stale during earnings.
- **Per-page `force-dynamic` on dashboard routes.** Belt-and-suspenders defense in depth on the 4 sub-pages that need it (root, settings, summaries, billing). The layout retains `force-dynamic` (required — `DashboardShell` renders `<MinimalHeader>` which calls Clerk's `useUser()`, blowing up during static prerender without `ClerkProvider`). Router Cache for back-nav comes from `staleTimes`, which works regardless of whether the layout is build-time or request-time rendered.

## [0.0.31.1] - 2026-05-15

### Fixed
- **Filing preferences save was silently failing for every onboarded user.** Toggling switches on `/dashboard/settings` and clicking Save returned a generic error toast (or appeared to spin and do nothing) instead of persisting. Root cause: `handleGetPreferences` and `handlePatchPreferences` in `app/api/user/route.ts` passed Clerk's user id (`user_xxx`) directly to `prisma.user.findUnique({ where: { id: clerkId } })`, but `User.id` is a generated UUID; the Clerk id lives in `User.authProviderId`. Every save threw "User not found" inside `PreferenceService`. Fix: new `resolveDbUserId()` helper resolves Clerk id → DB user id via `findFirst({ OR: [{id},{authProviderId}], deletedAt: null })`, matching the pattern already used by `handleGetSubscription`. Returns 404 instead of leaking the resolution failure as a 500.
- **Billing portal returned a misleading "No billing information found" 404 for the same user class.** `handlePostBillingPortal` had the identical bug: `prisma.userSubscription.findUnique({ where: { userId: clerkId } })` queries a foreign key to `User.id` (UUID), so onboarded users with active Stripe subscriptions got a "create a subscription first" error. Same `resolveDbUserId()` fix applied. The two 404 paths are now distinct ("Account not fully provisioned yet" vs "No billing customer yet") so production triage can tell provisioning races apart from missing Stripe records.

### Added
- **Server-side `logger.warn` on Clerk-authed-but-not-provisioned 404s** in both `/api/user?type=preferences` and `/api/user?type=billing-portal`. Surfaces the "Clerk session valid, DB row missing" funnel-drop as a visible incident instead of a silent retry loop on the user's end.
- **Soft-delete safety filter** in the new `resolveDbUserId()` helper. Excludes `deletedAt IS NOT NULL` users so a stale Clerk session for a deleted account can no longer read or write preferences. `deleteScheduledFor` users are intentionally still allowed — they may want to lower email frequency before the purge runs.
- **15 regression tests** (`__tests__/api/user/preferences.test.ts` rewritten, `__tests__/api/user/billing-portal.test.ts` new) covering: normal onboarded user, legacy `id===clerkId` user, soft-deleted user, missing DB row, no Clerk auth, malformed JSON body. Tests explicitly assert `PreferenceService.*` is called with the DB id, never the Clerk id — exactly the regression class that broke this in the route consolidation.

## [0.0.31.0] - 2026-05-13

### Changed
- **Landing hero v3 — editorial rewrite.** The above-the-fold hero now reads as a magazine cover instead of a SaaS template. Headline is "Every filing. Summarized. Delivered." in Instrument Serif, with quiet typographic emphasis on the final word (italic, slightly heavier, near-black ink — no color shift). Subhead drops the 10-K / 10-Q / 8-K / Form 4 enumeration that was underselling the actual coverage; new copy is "Every SEC filing your portfolio companies submit, in your inbox minutes after it publishes." Replaces the blue-purple mesh gradient with a warm bone background, swaps the gradient CTA for a solid-ink button (brand-blue on hover), and unifies the inbox-widget filing chips to a single monochrome treatment. The dashboard activity feed keeps its colored badges by design — that's the power-user surface where color is a useful at-a-glance shortcut.
- **Inbox widget chrome.** Drops the literal Gmail traffic-light dots and the "Updated weekly" footer. Replaces them with a small monospaced "tldrsec.com / inbox" header label. Row states use stone neutrals instead of blue tints. The widget shadow is `shadow-sm` instead of `shadow-2xl`, and the max width is capped at 1100px so the centered copy block above doesn't feel dwarfed.
- **PostHog hero-copy experiment variant retired.** `HOMEPAGE_HERO_VARIANT` is now an alias of `HOMEPAGE_HERO_CONTROL`, so both arms render identical copy. Test T14 pins the alias state to catch accidental re-divergence. Re-introduce a distinct variant by replacing this alias with a new copy bundle when the next experiment ships.

### Added
- **Instrument Serif via `next/font/google`.** Available project-wide as `--font-serif`. Used by the new `.brand-hero-display-serif` headline utility.
- **Editorial palette tokens.** `--editorial-bg`, `--editorial-ink`, `--editorial-ink-muted`, `--editorial-rule` live in `app/globals.css` alongside the existing brand palette. New utility classes: `.brand-hero-display-serif`, `.editorial-accent`, `.brand-button-ink`.
- **`editorialBgStyle` export in `lib/animations/landing-animations.ts`.** Solid warm-bone background that replaces the multi-layered mesh gradient on the hero section. The original `meshGradientStyle` export is retained for any other consumers.

## [0.0.30.1] - 2026-05-12

### Removed
- **Dashboard "minutes saved · filings summarized" stats bar.** The small counter that sat above the Emails/Tickers tab selector is gone. Users now land directly on the filter tabs with no preamble, shortening the path from page load to the first piece of useful information. Deleted `components/dashboard/sections/dashboard-stats-section.tsx`, `components/dashboard/sections/stats-skeleton.tsx`, and the now-orphaned `fetchDashboardStats()` query in `lib/db/dashboard-queries.ts`. The matching skeleton in `app/dashboard/loading.tsx` was removed in lockstep so the loading shell still mirrors the rendered page.

## [0.0.30.0] - 2026-05-11

### Added
- **End-to-end newsletter campaign funnel attribution.** Every campaign email now carries the subscriber's identity through the entire flow: email click (Resend webhook) → landing page (`?sub=<uuid>` cookie) → trial signup (Stripe webhook) → paid conversion. Three PostHog funnels (one per deliverability cohort, 14-day per-person window) give a per-cohort kill/scale decision two weeks after each broadcast. Replaces the prior "open Resend + Stripe dashboards and guess" attribution model.
- **`SubscriberIdentifier` component (`components/analytics/subscriber-identifier.tsx`).** Mounted globally under `<PostHogProvider>` in `app/layout.tsx`. On any visit with `?sub=<uuid>`, it writes the subscriber id to cookie + localStorage *synchronously during render* (survives an instant OAuth click before any `useEffect` could fire) and calls `posthog.identify('sub_<uuid>')` so the subscriber's landing-page activity attributes to a real PostHog Person. Strict UUID-v4 validation fails closed on garbage input. One-shot identify gate via `useRef` keeps PostHog quiet across in-app navigation.
- **`buildCampaignUrl(...)` in `lib/email/url-utils.ts`.** Single source of truth for campaign URLs. Every E1/E2/E3 CTA now routes through it: `tldrsec.app/?sub=<uuid>&utm_source=email&utm_medium=newsletter&utm_campaign=launch-2026-05&utm_content=eN`. Replaces the prior hardcoded `'https://tldrsec.app'` + `ref=campaign` query param scattered across templates.
- **`campaign_sends` idempotency log table.** New Supabase table with `UNIQUE NULLS NOT DISTINCT (campaign_id, cohort_id, email_id, variant)` constraint. Send route INSERTs `status='pending'` before the Resend call, flips to `'sent'` / `'failed'` after completion. A duplicate POST returns 409 with the prior row's state instead of silently double-broadcasting to 40 real subscribers.
- **Bounce + complaint suppression on `newsletter_subscribers`.** New `bounced_at`, `bounce_type`, `complained_at` columns. The Resend webhook handler's new `email.bounced` and `email.complained` branches set these timestamps by email match; the campaign send route filters them out alongside `unsubscribed_at IS NULL`. One hard bounce on E1 now naturally suppresses E2 and E3 to that address.
- **Pinned cohort assignment on `newsletter_subscribers.cohort_id`.** Replaces the index-based slice that would drift across E1/E2/E3 sends if new subscribers joined mid-campaign. Backfill script `scripts/backfill-newsletter-cohorts.ts` assigned `c1=40, c2=40, c3=44` to the existing 124-subscriber list. Send route now SELECTs `WHERE cohort_id = $1` instead of `LIMIT/OFFSET` against the full ordered list.
- **Resend tag schema extension (`subscriberId`, `campaignId`, `cohortId`, `emailId`).** The webhook handler accepts both `camelCase` and `snake_case` forms (matching the existing dual-key pattern documented in `wiki/product/resend-webhook.md`). For subscriber-keyed events the PostHog distinct_id is `sub_<uuid>` (prefixed so it never collides with a Clerk user cuid).
- **`LANDING_CTA_CLICK` wired across the landing page.** Previously only `hero-section-v2.tsx` fired the event. Now `cta-section-v2`, `pricing-section-v2` (alongside the existing `PRICING_PLAN_SELECTED`), `footer-section-v2` (Sign Up + Pricing only, not Sign In), and `landing-navbar` all fire with the correct `cta_location`. Funnel step 3 (landing CTA click) now actually measures.

### Changed
- **`identifyUser` rewritten for subscriber→user identity stitching (`lib/hooks/use-analytics.ts`).** Alias-first / identify-second: while the PostHog distinct_id is still `sub_<uuid>`, `posthog.alias(user.id)` merges the subscriber timeline INTO the user timeline; THEN `posthog.identify(user.id)` switches the canonical id. Cookie fallback (`document.cookie` regex) handles OAuth flows where localStorage is lost across the Clerk redirect. Cleans up storage post-merge so subsequent identifies don't re-alias. Validated live in PostHog: one merged Person record with all 6 funnel events attributed.

### Fixed
- **Postgres `UNIQUE` on `campaign_sends` treated NULL ≠ NULL — duplicate variant-less sends slipped through.** Caught by the dry-run harness against live Supabase. Fix: `lib/supabase/migrations/fix-campaign-sends-null-variant-uniqueness.sql` rebuilds the constraint with `NULLS NOT DISTINCT` (Postgres 15+). Variant-less duplicate POSTs now correctly return 409.

## [0.0.29.2] - 2026-05-11

### Added
- **Inline `[N]` citation links in X (Twitter) sentiment sections across all 9 minimalist email templates.** Synthesis paragraphs and fact-claim bullets now carry numbered superscript-baseline anchors hyperlinked to the matching x.com source (e.g., `"Bulls cited beat[1] while bears flagged guidance[2]"`). Renders end-to-end against real Grok output: TSLA 10-K/10-Q/8-K verified with 25 inline anchors total in production preview.
- **Coverage expansion to Form 4, Form 144, DEF 14A, S-1, S-3, and generic minimalist templates.** Previously only 10-K/10-Q/8-K rendered the X sentiment block. The eligibility gate accepts 14 form types but only 3 had a render path, so ~$0.05/filing was being spent on `x_search` calls that never reached customer inboxes. Wired via a new `<XSentimentBlock>` wrapper component (server-only) that encapsulates the cast, guard, and bounded-cardinality monitoring counter.
- **Inline citation marker parser.** `splitTextOnMarkers` and `remapMarkersInText` in `lib/ai/parsers/x-sentiment-validator.ts` parse `[N]` and `[N, M, ...]` forms with strict regex (no decimals, no unclosed brackets, no non-numeric). The validator's `sanitizeCitations` now returns an `indexMap` so F3-stripped citations leave behind correctly-renumbered markers (or drop the marker silently when its target was stripped).
- **G2 eval gate npm alias.** `npm run eval:x-sentiment` runs the existing 5-fixture pump-and-dump / cashtag-collision / legitimate-shift / null-signal eval suite against the new prompt. All 8 bucket assertions pass.

### Fixed
- **xSentiment payload silently dropped before DB persistence (P0, regression since v0.0.25.0).** `storeSummary` constructed the persisted `summaryJSON` column from a fixed scalar field set and never threaded the F3-validated xSentiment object. End result: real $0.05 `x_search` calls succeeded, the provider logged `x_sentiment enrichment ready`, but the email render path always saw `summaryData.xSentiment === undefined` and silently fell back to no-section. Fix threads `summaryJSON.summaryJSON.xSentiment` via metadata at every `storeSummary` call site (3 in `filingSummaryService.ts`, 2 in `enhancedFilingSummaryService.ts`) and conditionally includes it in the constructed summaryJSON. Verified end-to-end against TSLA 10-K/10-Q/8-K: persisted column now has 16 keys including `xSentiment` with inline `[N]` markers in factClaims and synthesis.
- **Validator vs renderer URL trust mismatch (silent attribution corruption).** The validator allowed `http:` and `mobile.twitter.com`; the renderer required `https:` and excluded `mobile.twitter.com`. When a URL passed validator but failed the renderer's stricter check, the renderer's filtered citation array shifted indices, silently misattributing inline `[N]` anchors to the wrong tweet. Validator now requires `https:` only and matches the renderer's host allowlist exactly.
- **`remapMarkersInText` whitespace-collapse broke G3 IAA bit-exact preservation invariant.** The function unconditionally collapsed runs of 2+ spaces, silently rewriting legitimate content-bearing whitespace (e.g., `"Q3 revenue:  $4.2B"` from copied filing text) even when no markers were dropped. Now only collapses when at least one marker was actually dropped.
- **Renderer cap mismatch with validator (markers `[6]`-`[10]` silently dropped).** `XSentimentSection` sliced citations to 5 but the validator allows up to 10 and remaps marker indices into 1-based positions over the full kept array. Customer email would show "missing anchor" gaps in synthesis text. Slice removed; validator's `MAX_CITATIONS=10` is now the single source of truth.
- **Section guard for empty `factClaims`.** `shouldRenderXSentiment` now rejects when `factClaims.length === 0` regardless of confidence (previously rejected only on low confidence). Empty bullet block is visually broken; if F3 stripped everything to opinion-only, suppress the whole section. Synthesis-with-markers + empty `citationUrls` also rejected (markers without targets are dead links).
- **Shared `g`-flag regex state leak.** `splitTextOnMarkers` previously used the module-scope `MARKER_REGEX` with `.exec()` and manual `lastIndex = 0` reset. Switched to `text.matchAll(MARKER_REGEX)` to eliminate cursor-state coupling.

### Changed
- **Validator named-step pipeline.** `validateXSentiment` refactored from a single ~80-line pass into 8 named steps (`parseEnums`, `sanitizeCitations`, `sanitizeClaims`, `sanitizeSynthesis`, `clampWindowHours`, `applyConfidenceFloor`, `degradeIfAllStripped`, plus the new `remapMarkersInText` step). Pure refactor — all 26 prior tests pass unchanged.
- **Existing 10-K/10-Q/8-K templates refactored to use `<XSentimentBlock>`.** Each template's ~12-line conditional render block collapsed to a single JSX line. Removes ~80 LOC of duplication.
- **`x-sentiment-provider.ts` prompt updated** to instruct Grok to emit `[N]` markers within `factClaims` text and `discussionSynthesis`. Schema unchanged on the wire — markers live inside existing string fields, so legacy payloads (no markers) round-trip unchanged.
## [0.0.29.1] - 2026-05-11

### Added
- **`prisma migrate deploy` is now wired into Vercel production builds.** New `scripts/vercel-build.sh` is invoked via the `vercel-build` package.json script (Vercel's convention for overriding `build` on its build runner). The hook runs `prisma migrate deploy` only when `VERCEL_ENV=production` — preview deploys from feature branches do not migrate. Both environments share a single Supabase database, so without this gate every preview build would race migrations against prod. New migrations now apply automatically on the first production deploy after a PR merges. Override knob: setting `SKIP_PRISMA_MIGRATE=1` on a single deploy bypasses the step (used for rolling back a bad migration without removing the file from the tree).

### Fixed
- **`scripts/backfill-enrichment-applied.ts` was unrunnable as documented.** The header advertised `npx tsx scripts/backfill-enrichment-applied.ts --dry-run` but the trailing `if (require.main === module)` guard threw `ReferenceError: require is not defined` because the project is `"type": "module"` (ESM). The jest regression test never caught it — jest's transform exposes `require`, so the import path was the only one exercised. Replaced with the same `import.meta.url` + `fileURLToPath` + `process.argv[1]` comparison used by `scripts/verify-daily-pipeline.ts` (which has identical dual-use shape: importable + directly runnable).

### Operations note
- The production `_prisma_migrations` tracking table did not exist before this PR — the schema had been built up via `prisma db push` and out-of-band SQL files, so `prisma migrate status` reported all 19 on-disk migrations as pending while their tables already existed. Resolved on 2026-05-10 by running `prisma migrate resolve --applied <name>` for each of the 19 migrations against `DIRECT_URL`. After baselining, `prisma migrate deploy` reports "No pending migrations to apply." This was a one-time fix; future migrations will track normally because the build hook above keeps the table in sync.

## [0.0.29.0] - 2026-05-11

### Fixed
- **Coinbase 10-Q (and any 10-K/10-Q) email no longer ships a "$NaN" earnings scorecard when the AI couldn't extract financials.** Reproduced from prod: COIN's freshly-filed Q1 2026 10-Q reached Grok with only XBRL header metadata (no income statement in the prompt window). The unified prompt instructed Grok to emit literal `"N/A"` for unavailable values; downstream `normalizeCurrency()` ran `parseFloat("N/A")` → `NaN` → `"$NaN"`, and the email rendered six rows of `$NaN` for Revenue / Gross Margin / Operating Margin / FCF Margin / Net Income / EPS. Three independent layers now block this end-to-end:
  - **Pre-LLM content gate** at `lib/ai/parsers/financial-content-gate.ts:hasFinancialStatementSignal()`. For 10-K, 10-Q, 20-F, 6-K (and `/A` amendments) the prepared excerpt must clear at least 3 of 5 signals before the LLM call: period header (`Three Months Ended` / `Six Months Ended` / `Year Ended`), statement title (`Consolidated Statements of Operations` / `Balance Sheets` / etc.), ≥2 distinct income-statement line items, ≥10 dollar-figure tokens, ≥3000 chars. The COIN XBRL-only excerpt scores 0/5 and is rejected. Wired into `lib/ai/summarize.ts` immediately after the `PROCESSING` status update — saves the LLM call entirely.
  - **Post-LLM scorecard gate** at `hasUsableFinancialHighlights()`. Belt-and-suspenders: even if the excerpt passed pre-gate, the AI response must contain at least one row that passes `isUsableMetricRow` (rejects `$NaN` / `N/A` / `null` / `undefined` / `Not disclosed` / `TBD` / `n/m`). Catches AI quality failures the input gate can't predict.
  - **Template filter** wired into `components/ui/email/templates/10q-minimalist-template.tsx` and `10k-minimalist-template.tsx`. Final defensive layer — `isUsableMetricRow` (added in v0.0.26.5 but never wired into a consumer) now filters `financialHighlights` at render so a single bad row in an otherwise-good scorecard is dropped quietly, and an all-bad scorecard is suppressed entirely (the existing empty-state fallback handles the void).
- **`INSUFFICIENT_CONTENT` processing status with automatic retry-with-backoff.** Pre-LLM gate failures now throw a typed `SummarizationError(code=AI_INSUFFICIENT_CONTENT, isRetriable=true)`. Existing worker infrastructure at `lib/job-queue/index.ts:457` (`updateJobStatus(FAILED)`) auto-converts to `RETRYING` with exponential backoff (1 → 2 → 4 → 8 → 16 minutes via `Math.pow(2, retryCount)`) on the theory that EDGAR may finish processing the document body shortly after acceptance. After `maxRetries`, the job stays `FAILED` and no email is sent. `INSUFFICIENT_CONTENT` is included in `PARTIAL_RESULT_STATUSES` so `isSuppressedFromEmail()` returns true defensively even if a writer forgets the `isPartialResult` flag.
- **`analysis-depth.ts` financialHighlights bonus was dead code.** The 20-point structural-fidelity bonus checked `j.financials` but `response-parser.ts` aliases `financials` → `financialHighlights` and **deletes** the legacy key, so the predicate was always false. Renamed the schema field and `BONUSES` key to match the canonical name. The `pickBestSummaryForUser` ranking formula now correctly credits 10-K/10-Q summaries with extracted financials, which was the original intent introduced in v0.0.27.0.
- **Defensive cache-layer cast.** `lib/ai/cache/summary-cache.ts` string-literal status unions extended to include `INSUFFICIENT_CONTENT`. The cache-eligibility filter (`status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')`) already excludes the new status, but the type cast would have silently lied if someone later broadened the filter.

### Notes
- Reproduces zero `$NaN` rows in the live regression fixture (the verbatim 6-row COIN payload from `Summary 4217037e-0e18-4ce4-b56c-993fae7120f0`).
- 175 new + updated tests across 6 suites — including 8-case sentinel parameterization (`$NaN`, `NaN`, `null`, `Null`, `undefined`, `Not disclosed`, `TBD`, `n/m`), the verbatim COIN XBRL excerpt as a pre-gate fixture, and end-to-end template render assertions.
- New monitoring counters: `ai.content_gate_pre_llm_failed`, `ai.content_gate_post_llm_failed`. Errors observable via `Summary.processingError` field.

## [0.0.28.3] - 2026-05-10

### Added
- **Producer-gate: web-search enrichment writes only for MAX-eligible users.** Phase 4 of the X-search-MAX-only plan (`tasks/x-search-max-only.md`). `summarizeFiling` (`lib/ai/summarize.ts`) computes `isMaxEligible({tier, isTrialing, trialEndsAt})` once at function entry; both enrichment branches (whyItMatters + xSentiment) now check the result FIRST — before PostHog flag eval or provider eligibility — so non-Max users never burn PostHog evaluations or enrichment budget for output they can't see. The boolean is persisted to `Summary.enrichmentApplied` (column shipped in v0.0.28.1) for the tier-aware cache lookup. `summarize-cached-handler` reads `isTrialing`/`trialEndsAt` from the existing user-row select for the soft-delete check (no extra query); default when tier context is missing is non-Max (safer for legacy/admin callers). Defense-in-depth: `whyItMatters` is stripped from `parsedResult.data` post-parse for non-Max requests even if a model hallucinates it.
- **Tier-aware shared cache lookup** — Pro/Free users continue to read from the shared cache, Max users only hit cache rows where `enrichmentApplied = true`. Stops Max users from being served stale non-enriched summaries when a Pro/Free user happened to summarize the same filing first. Powered by the 3-col `[filingUrl, filingType, enrichmentApplied]` index from v0.0.28.1.
- **Pricing copy: Pro vs Max differentiation.** Subscription page (`app/subscribe/page.tsx`), 3-tier pricing component (`components/landing/pricing-section-3-tier.tsx`, `components/landing/sections-v2/pricing-section-v2.tsx`), FAQ section (`components/landing/sections-v2/faq-section-v2.tsx`), sidebar upgrade card (`components/layout/sidebar.tsx`), trial emails (`lib/email/trial-emails.ts`), campaign emails (`lib/email/campaign-templates.ts`), and Stripe plan metadata (`lib/stripe/plans.ts`) now describe Pro as "standard summaries" ($199/month, 25 companies) and Max as "summaries enriched with live web context — recent news, market reaction, analyst takes" ($349/month, unlimited companies). Closes the loop where the product tier difference was real but invisible to prospects.
- **Test coverage:** producer-gate behaviour (`__tests__/ai/summarize-enrichment-gate.test.ts`), cached-handler tier propagation (`__tests__/cron/handlers/summarize-cached-handler-tier-context.test.ts`), tier-aware cache concurrency + cross-tier truth table (`__tests__/cron/handlers/cache-concurrency.test.ts`, `cache-cross-tier-truth-table.test.ts`), and FAQ pricing copy regression (`__tests__/landing/faq-section-v2.test.tsx`).

### Notes
- Concludes the X-search-MAX-only gating program (Phases 1–6). Schema groundwork landed v0.0.28.1; backfill landed v0.0.28.2; this release wires the writer, reader, and pricing copy.

## [0.0.28.2] - 2026-05-10

### Added
- **Backfill script for `Summary.enrichmentApplied`** at `scripts/backfill-enrichment-applied.ts`. Phase 3 of the X-search-MAX-only gating plan (`tasks/x-search-max-only.md`) — flips `enrichmentApplied = true` on legacy `Summary` rows whose `summaryJSON` already contains a `whyItMatters` field, so they remain in the Max-tier cache after the producer-gate (#491) starts writing only fresh Max summaries with the flag set. Self-paginating UPDATE-RETURNING-LIMIT loop (UUID PK rules out `id BETWEEN` ranges) — each batch shrinks the working set since flipped rows no longer match the `WHERE enrichmentApplied = false AND summaryJSON ? 'whyItMatters'` predicate, so the loop terminates on the first short batch. Default 1000-row batches, 100ms inter-batch sleep to keep replication lag bounded; both tunable via `--batch-size` and `--sleep-ms`. Dry-run mode (`--dry-run`) reports counts without writing. Idempotent — safe to re-run.
- **Backfill regression test** at `__tests__/migrations/enrichment-applied-backfill.test.ts` covers the predicate, batching, dry-run, and idempotency contracts.
- **Allowlisted in `.gitignore`** alongside `send-campaign.ts` and `refresh-landing-fixtures.ts` — the `scripts/*` blanket ignore otherwise hides operator scripts.

### Notes
- This is a one-shot data-fix script, not a recurring job. Run post-deploy after #491 lands and the producer-gate starts writing.

## [0.0.28.1] - 2026-05-10

### Added
- **`Summary.enrichmentApplied` column + 3-col cache index.** Schema groundwork for the X-search-MAX-only gating plan (`tasks/x-search-max-only.md`). Adds `enrichmentApplied: Boolean @default(false)` to `Summary` (`prisma/schema.prisma`) so the tier-aware shared cache can distinguish enriched (Max) from non-enriched (Pro/Free) summaries on the same filing. Prisma migration uses `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT false` (fast in PG 11+ — constant default, no row rewrite). Post-deploy SQL `prisma/migrations/add_enrichment_applied_index.sql` swaps the legacy 2-col cache index `[filingUrl, filingType]` for the 3-col `[filingUrl, filingType, enrichmentApplied]` via `CREATE INDEX CONCURRENTLY` (online, no read-path stall) followed by `DROP INDEX CONCURRENTLY` of the old one. Lives outside the Prisma migration runner because Prisma wraps each migration in a transaction and `CONCURRENTLY` can't run inside one — same pattern as `add_monitoring_optimization_indices.sql`.
- **Schema regression test** at `__tests__/migrations/summary-enrichment-applied-schema.test.ts` confirms the column shape and default. Ships alongside the migration so `bun test` would catch a future revert.

### Notes
- No readers or writers of the new column ship in this release. Producer gating lands in PR #491; backfill of historical rows lands in PR #490.

## [0.0.27.2] - 2026-05-09

### Fixed
- **Campaign + production summary emails now redirect to the actual filing.** SEC links from email templates were landing recipients on EDGAR's company-search page (when the source URL was empty) or the filing's `-index.htm` documents-list page (the most common shape) instead of the actual filing document. Diagnostic against prod found 100% of recent `Summary` rows had `url` null and `filingUrl` in `-index.htm` shape, so the simple "prefer Summary.url" fix would have been a no-op. Resolver wire-in via `resolveSecPrimaryDocumentUrl` now upgrades index URLs to primary docs (cache-keyed by accession, ≤3 EDGAR fetches per campaign batch regardless of recipient count) inside `fetchCampaignFilings()` and a new `safeResolveFilingUrl` helper inside `summary-service.ts` (digest + per-filing notification paths). Validated end-to-end: AAPL Form 4 `-index.htm` → `form4.xml` (XSLT-rendered), AMZN 8-K `-index.htm` → `amzn-20260331xex991.htm`.
- **Resolver gap for ownership forms.** `resolveSecPrimaryDocumentUrl` only matched `.htm` primary docs — ownership forms (3/4/5/144/13G/13D) are pure XML with no HTM, and the resolver returned the input URL unchanged for ~60% of typical campaign rows. Extended with a form-type-gated XML fallback using `getXsltStylesheetDir`. Discovered EDGAR's `index.json` returns `type: "text.gif"` for every item in production (the API's type field is unreliable), so the fallback uses name-pattern filtering for XBRL noise and form-type gating instead of type-matching. Downstream `getSecFilingViewerUrl` injects the XSLT stylesheet path so recipients see a rendered filing, not raw XML.
- **Ingestion gap left `Summary.url` 100% null.** `filingSummaryService.ts` (the active production path) had 5 `storeSummary` call sites and `enhancedFilingSummaryService.ts` had 3 — none passed `primaryDocUrl` in the metadata block. `directFilingSummaryService.ts` was the only correct path but isn't the one used. Fixed at all 8 call sites. Net: future ingestions populate `Summary.url`, the renderer-layer resolver becomes a backstop instead of being load-bearing.
- **`filingDatabase` upsert update branch didn't refresh `url` on re-summarization.** Cache refresh, retry, and model change paths froze `url` at first-ingest value. Added guarded write (only overwrites when caller has a value, never clobbers a previously-good URL with null).
- **Campaign fallback fixture's empty URL produced a misleading "Source: SEC EDGAR" link to companysearch.** The hero anchor is now omitted entirely when no real per-filing URL is present — line collapses to `Filed: <month>` rather than routing recipients to a search page.
- **`fetchScoredSummariesLast30Days` threw on orphan rows.** Prisma's required-relation contract throws on the entire findMany batch when even one Summary row has a deleted Ticker. Added `ticker: { is: {} }` filter so orphaned rows are skipped instead of failing the whole campaign send.

### Added
- **Render-layer regression suite** at `__tests__/email/campaign-edgar-link.test.ts` (16 tests). Covers `toCampaignFiling` field preference + `email1()` rendered href across all three observed input shapes (primary doc, `-index.htm`, empty), with explicit anti-regression assertions for the companysearch URL.
- **5 new XML-fallback regression tests** in `url-utils-primary-doc.test.ts`: real EDGAR shape (form4.xml only), form-type gating (no fallback for 10-Q with junk XBRL), XBRL linkbase / FilingSummary / R-file exclusion.

## [0.0.27.3] - 2026-05-09

### Added
- **Architecture deepening process docs (groundwork for nightly autonomous reviews).** Seeds the vocabulary, process, and ADR scaffolding consumed by a scheduled `/improve-codebase-architecture` routine. New files: `LANGUAGE.md` (shared vocabulary — module / interface / seam / adapter / depth / leverage / locality, with the deletion test and "interface is the test surface" principle), `process/improve-codebase-architecture.md` (the review process, including an autonomous-mode branch that bypasses interactive prompts), `process/Deepening/deepening.md` (dependency categories: in-process, local-substitutable, remote-but-owned via ports & adapters, true-external; seam discipline; replace-don't-layer testing strategy), `process/Deepening/interface-design.md` ("Design It Twice" parallel sub-agent pattern), `CONTEXT.md` (domain glossary seeded with Filing / Summary / Subscription / Onboarding — populated lazily as future deepenings name new modules), and `docs/adr/README.md` (ADR format + numbering rules for decisions the routine should not re-litigate).
- **Nightly remote routine paired with these docs.** A claude.ai cloud routine (`trig_01QLWeP3wFp2UiKwpeAaXHVa`, fires daily at 14:00 UTC) reads the process docs, scans for shallow modules, and opens up to 3 PRs per night (one deepening per PR) plus up to 5 `architecture-gap` issues. Manage at https://claude.ai/code/routines/trig_01QLWeP3wFp2UiKwpeAaXHVa.
## [0.0.27.2] - 2026-05-08

### Added
- **Three-layer anti-hallucination grounding stack** in the AI summarization pipeline. Catches the failure mode where the model fabricates dollar amounts or substitutes a different company entirely (verified live against a real JPM S-3 that the model hallucinated as TSLA-then-NVDA). Three independent layers stack inside `lib/ai/summarize.ts` and write violation telemetry to PostHog so we can measure each layer's impact separately.
- **Layer 1 — Post-receive prose validators wired up** (`lib/ai/parsers/ticker-grounding.ts`, `lib/ai/parsers/why-it-matters.ts`). New `validateTickerGroundingInPlace()` walks `whyItMatters`, `headline`, `summary`, `emailSubject` and redacts any field whose text mentions a foreign ticker or company alias (e.g. "Tesla" or "$NVDA" appearing in a JPM filing). `coerceWhyItMatters` now runs in the pipeline (it existed but was orphaned). Both are gated by env kill switches — `DISABLE_TICKER_GROUNDING=1`, `DISABLE_WHY_IT_MATTERS_GROUNDING=1`. Counters: `ai.ticker_grounding_violation`, `ai.why_it_matters_violation`.
- **Layer 2 — Numeric grounding validator** (`lib/ai/parsers/numeric-grounding.ts`, 326 lines). For every emitted dollar amount, percentage, and large share count in the structured payload, substring-checks the value (or a normalized variant) against the SEC source doc. Redacts unverified values to null. Originally-required schema fields (e.g. Form 4 `transactions[].shares`) are preserved + reported under `ai.numeric_grounding_violation_unredactable` to avoid breaking the strict-json-schema contract. Includes chunked warn-only mode (when only one chunk of a large doc is in scope), 5%-tolerance approximation rule for "approximately N billion" patterns, fast-path numeric token Set + slow-path variant search (handles `$5B` ↔ `$5,000,000,000` ↔ `$5 billion`), and a perf budget verified at <250ms over 200KB docs. Kill switch: `ENRICHMENT_DISABLE_NUMERIC_GROUNDING=1`. Counters: `ai.numeric_grounding_violation`, `ai.numeric_grounding_violation_unredactable`, `ai.numeric_grounding_duration`.
- **Layer 3 — Universal grounding system-prompt block + field-description sweep** in `lib/ai/prompts/unified-prompts.ts`. New `GROUNDING_BLOCK` prepends a 5-section anti-hallucination prologue to every form's `systemPrompt` ("NULL IS PREFERRED OVER INVENTED", "ONLY WHAT THE FILING LITERALLY STATES", "NO EXTRAPOLATION", "WHEN UNSURE, ABSTAIN", "PROSE FIELDS MUST NOT INVENT FACTS"). S-3-specific shelf-bucket addendum prepends only on S-3 ("most shelves authorize a single combined cap"). New `withGroundingNote()` helper applied to ~20 numeric fields across Form 4 (transactions[].shares/pricePerShare/totalValue/sharesOwnedFollowing), Form 144 (shares/estimatedValue/pricePerShare/remainingHoldings/sharesOutstanding), Form 3, SC 13G/13D, 8-K (financialImpact), 424B2, S-1 (offeringSize/sharesOffered), S-3 (offeringAmount/sharesOffered/dilutionImpact/sellingShareholders[].shares/shelfRegistration.totalAuthorized+remainingCapacity/pricePerShare), plus the shared FINANCIAL_HIGHLIGHT_ITEM and SEGMENT_ITEM. Kill switch: `GROUNDING_PROMPT_ENABLED=0` removes the entire block without redeploy.
- **Audit test that future-proofs the field sweep** (`__tests__/lib/ai/grounding-prompt-coverage.test.ts`, 32 tests). Inverted-detection: walks every `string`-typed schema field and flags any whose description contains `$`, `%`, `\bshares?\b`, or `\bdollars?\b` but lacks one of the seven grounding phrases. Catches `coupon`, `yield`, `spread`, `eps`, `revenue`, `margin`, `dividend`, `maturity`, `proceeds`, `nav` that a hint-list would miss. New schema fields with numeric-flavored descriptions trigger CI failures until the sweep is applied. Includes `formatSchemaDescription` snapshot test that confirms the `-` separator concern is non-issue with grounding language present.
- **PostHog metric allowlist extended** (`lib/monitoring/index.ts`) with `ai.ticker_grounding_`, `ai.why_it_matters_`, `ai.numeric_grounding_` so violation counters reach the `monitoring_metric` event stream and PostHog dashboards. Without this, counters only increment in-memory.
- **`scripts/smoke-grounding.ts`** — one-off read-only harness that fetches the most-recent cached S-3 filing, falls back from `SecFiling` lookup to `CikMapping` for ticker resolution, calls `summarizeFiling` in metadata-only mode (no DB write), prints the resulting JSON, and flushes PostHog. Used to validate end-to-end telemetry against a real JPM S-3 — confirmed `ai.ticker_grounding_violation` events landing in PostHog with field tags.

### Changed
- **`lib/ai/summarize.ts` post-parse pipeline** now runs three validators in order between successful parse and DB persistence: `coerceWhyItMatters` → `validateTickerGroundingInPlace` → `validateNumericGrounding`. Each is independently gated. Redactions apply to both the persisted `summaryJSON` and the function's return value because mutations land before `summaryJSONWithSentiment` is composed.
- **System prompt in `unified-prompts.ts` is now composed at runtime** by `buildSystemPrompt(formType)` instead of being a static `SYSTEM_PROMPT` constant. The base prompt is renamed to `BASE_SYSTEM_PROMPT` (module-internal — no conflict with the unrelated export from `lib/ai/prompts/prompt-templates.ts`).

## [0.0.28.0] - 2026-05-08

### Changed
- **AI pipeline migrated to xAI Grok 4.3.** xAI is retiring every Grok variant the codebase used (`grok-4.1-fast`, `grok-4-fast`, `grok-4-fast-reasoning`, `grok-4-fast:free`, `grok-3`, `grok-2`, `grok-code-fast-1`, `grok-4`) on **2026-05-15 12pm PT**. Without this PR, every AI feature breaks on May 15. Single-target model: `x-ai/grok-4.3` (1M context, built-in reasoning configurable per request, no separate `:reasoning` SKU).
- **Cost meter now matches reality across every dispatcher.** Previously four parallel pricing dispatchers (`config.ts.modelInfo`, `token-counter.prices`, `cost-tracker.DEFAULT_MODEL_PRICING`, `openrouter-client.createDynamicModelInfo`) could drift. `openrouter-client.ts` was hardcoding `$0.30/$0.50` per million for any `grok-4*` slug — that would have under-reported every grok-4.3 call by 4-5x. Pricing is now centralized in `costConfig` and read by all four code paths.
- **Tiered pricing honored at the 200K-token boundary.** Calls ≤200K input bill at `$1.25/$2.50` per M; calls >200K bill at `$2.50/$5.00` per M (per xAI's Models page). `lib/ai/token-counter.calculateCost()` selects the tier from `inputTokens` and routes through `cost-tracker.estimateCost()` for grok-4.3 so budget alarms see the real number.
- **Per-call cost cap actually enforced.** `MAX_COST_PER_REQUEST` env var was previously read into `costConfig.maxCostPerRequest` and never referenced anywhere else — the real caps were hardcoded `costLimit: 0.75` and `costLimit: 0.50` literals in `services/filing/enhancedSummaryGeneration.ts:146` and `services/filing/summaryGenerationService.ts:203`. Both call sites now read `costConfig.maxCostPerRequest` (default `$3.00`, raised from `$0.75` to fit the higher grok-4.3 per-call ceiling).
- **Chunked-summary cost estimation no longer over-reports by 2x.** `services/filings/enhanced/contentChunker.estimateProcessingCost()` previously summed all chunks' tokens and ran one tier check, which sent any filing >200K total tokens into the high-pricing tier even though each individual chunk (≤50K) bills at the low tier. Now estimates per-chunk and multiplies.
- **Stale Claude-era pricing removed from `contentChunker.calculateTokenCost`.** The function was hardcoding `$3/M input, $15/M output` (Claude Sonnet rates from before the OpenRouter migration). It's now a thin wrapper around `lib/ai/token-counter.calculateCost(...).totalCost`, preserving all 7 callers' single-number return shape.

### Fixed
- **`lib/ai/xai-direct-client.ts:22` was 404'ing every X-sentiment call in production.** `DEFAULT_MODEL` was the typo `'grok-4.20-reasoning'` (no such model in xAI's lineup, ever). `lib/ai/x-sentiment-provider.ts:230-246` calls `callXaiResponses()` without a `model` field, so this default WAS reached on every sentiment request. Fix: `'grok-4.3'` + a regression test (`__tests__/lib/ai/xai-direct-client-default-model.test.ts`) that exercises the no-model-arg call shape and asserts the slug isn't from the retirement list.
- **`lib/ai/model-validator.ts` cache was silently dropping fields.** `validateModel()` did `{ ...cached.result, source: 'cached' }` but `getCachedValidation()` already returns the unwrapped `ModelValidationResult` — `cached.result` was always `undefined`, so cached returns lost `modelId`, `isValid`, `currentInputCost`, etc. Pre-existing latent bug surfaced by the migration's tightened tests.
- **Validator regex no longer false-matches retired slugs.** `getEnvironmentPricing` previously used `/grok-4\.\d+/` which matched `grok-4.1-fast` (retiring 2026-05-15) and silently returned grok-4.3 prices for it. Tightened to `/grok-4\.3(?![0-9])/` so callers get `null` for unsupported slugs instead of wrong pricing.

### Added
- `XAI_GROK_INPUT_COST` / `XAI_GROK_OUTPUT_COST` env vars (defaults `1.25` / `2.50`) for the ≤200K input tier.
- `XAI_GROK_INPUT_COST_HIGH` / `XAI_GROK_OUTPUT_COST_HIGH` env vars (defaults `2.50` / `5.00`) for the >200K input tier.
- `lib/ai/__tests__/token-counter-tiered-pricing.test.ts` covers the boundary, env overrides, and unknown-model fallback.
- `__tests__/lib/ai/xai-direct-client-default-model.test.ts` regression-covers the typo bug.

### Removed
- `XAI_GROK4_INPUT_COST` / `XAI_GROK4_OUTPUT_COST` / `XAI_GROK2_INPUT_COST` / `XAI_GROK2_OUTPUT_COST` env vars (renamed to `XAI_GROK_*`). Operators must update Vercel/dashboard env vars before merge.
- `OPENROUTER_FALLBACK_MODEL` distinct from `DEFAULT_AI_MODEL` — fallback now aliases default since every other Grok is gone in 8 days.
- `x-ai/grok-beta` and `x-ai/grok-4` entries from `cost-tracker.DEFAULT_MODEL_PRICING`.
## [0.0.27.1] - 2026-05-08

### Changed
- **Landing hero pivot to the Form-4 / insider-buying wedge.** New variant H1 + subhead lead with the unique wedge most peers don't address: "Know when insiders buy. Understand every filing your portfolio companies publish." Subhead drops the 4-code filing-type list (10-K/10-Q/8-K/Form 4) — the product covers 30+ filing types and the old list was under-selling. Ships behind a PostHog server-side experiment flag (`landing-hero-copy-v2`) so we measure trial-start-rate impact against the existing "SEC filings, read in minutes" control before promoting.
- **Landing universal copy realigned to the same frame** (both experiment arms see this): page title → "Insider Trades + SEC Filings From Your Portfolio | tldrSEC"; OG image headline → "Know when insiders buy."; CTA section heading → "Start tracking insiders in your portfolio."; structured-data description echoes the same wedge.
- **Feature-card retitles for compliance-safe vocabulary + frame coherence.** "Filing-Type Analysis" → **"Insider-Trade Tracking"** (description rewritten around Form 4 — most competing tools don't summarize it). "Investment-Grade Quality" → **"Source-Cited Accuracy"** (the credit-rating term "investment-grade" is removed from marketing copy by design — see compliance-vocabulary guard below).
- **`/waitlist` hero aligned with the same Form-4 wedge** so positioning is coherent across `/` and `/waitlist`. Form, counter, and submit flow unchanged.

### Added
- **Single source of truth for landing copy at `lib/landing/copy.ts`.** All marketing copy across 7 surfaces (homepage hero, waitlist hero, page metadata, OG image, structured data, features section, CTA section) is now imported from named exports. Future copy edits are one-file changes; tests assert against the same constants so a copy rewrite no longer churns 8 test files.
- **Server-side PostHog hero variant resolution** (`lib/analytics/landing-flags.ts`). The flag is resolved in `app/page.tsx` (server component) and passed as a prop through `LandingPageV2 → GmailInboxHero`. Zero LCP regression — no client-side flag fetch before first paint, no flicker on hydration. Reads the existing PostHog browser cookie when present; falls back to a hashed (forwarded-IP, user-agent) anonymous distinctId. Returns `'control'` on every error path (missing PostHog config, network failure, malformed cookie, unrecognized flag value).
- **Compliance-vocabulary regression guard at `__tests__/landing/compliance-vocabulary.test.tsx`.** Renders Hero / CTA / Features / Footer; regex-scans for forbidden tokens (`investment[-\s]grade`, `investment\s+analyst`, `professional[-\s]grade`, `\brecommend(ation|ed|s)?\b`, `\badvice\b`, `Wall\s+Street\s+analyst`). Allowlist captures intentional regulatory phrasing only (the footer disclaimer's "is not investment advice"). Mirrors the existing FAQ pricing-string guard pattern.
- **Frame-sanity assertions** in CTA + features tests catch a future revert that would silently pass the "tests-pass-because-they-import-the-same-string" trap. CTA must contain `/insider/i`; features must NOT contain `/investment[-\s]grade/i`.
- **Hero-frame ↔ demo-widget editorial coupling note in CLAUDE.md.** Documents the bidirectional invariant: change the hero frame → audit the weekly Gmail-fixture curation criteria; change curation criteria → audit the hero frame.

### Repaired (pre-existing, surfaced by /ship)
- **Three waitlist test files** (`tests/components/focused-investor-hero.test.tsx`, `tests/integration/landing-page-coverage.test.tsx`, `tests/integration/waitlist-form.test.tsx`) asserted on landing copy from 4+ versions ago (`Skip the 100-page SEC filings`, `Cut through the noise`, `economic moats`, `Get Business Insights`, `Value-focused`, `continue to receive updates`). All three were failing on `origin/main` before this branch — verified via `git stash`. Rewritten to assert against the current `WAITLIST_HERO` copy module exports + the current `WaitlistForm` UI ("Join the Waitlist", confirmation card body). 1517 lines of stale assertions cut down to 385 lines of focused current-state coverage; 46 stale tests → 34 green tests.

### Internal
- **Duplicate `gmail-inbox-hero.test.tsx` consolidated** — older `__tests__/components/gmail-inbox-hero.test.tsx` deleted, unique className test ported into the canonical `__tests__/components/landing/` copy.
- **Four PostHog variant test cases** (T13–T16): `variant="control"` / `variant="variant"` / undefined prop / unrecognized string. Variant arm asserts on `HOMEPAGE_HERO_VARIANT` and explicitly NOT on the control H1, catching accidental re-aliasing.

## [0.0.27.0] - 2026-05-07

### Added
- **Single best summary email at onboarding** — a new user finishing onboarding gets one email with the highest-ranked existing summary across their tracked tickers (no fresh AI run, no waiting for the cron sweep). Replaces the prior top-2-per-ticker behavior that could send up to 6 emails. Lands instantly via `unstable_after()` from the onboarding server action — even if the user closes the tab during the dashboard transition, the email still goes out. (`lib/onboarding/cached-summary-delivery.ts`, `app/(auth)/onboarding/actions.ts`)
- **Richer ranking formula** — composite score of importance (0.25) + form-type materiality (0.40) + analysis depth (0.20) + recency (0.15). Analysis depth is structural-fidelity scoring on `summaryJSON`: bonuses for X sentiment present, financial scorecard rows, deal terms or debt tranches, normalized Form 4 transactions, smart-subject set, and substantial body length. Routes around degenerate "no body content" parses that dominated under the old materiality+recency-only formula. (`lib/onboarding/analysis-depth.ts`)
- **Summary-content variant of the post-onboarding hero card** — when a chosen pick exists, the dashboard's hero card renders the summary inline with a deep-link to `/summary/{id}`; the inbox-CTA demoted to a secondary action. Card and email show the same chosen pick (persisted on `User.onboardingFirstSummaryId`) so the user's first wow moment is the dashboard render, not the email round-trip. (`components/dashboard/post-onboarding-hero-card.tsx`)
- **Long-tail fallback notice** — when no cached cross-user summaries exist for any tracked ticker (the rare unique-ticker case), a dedicated "we're watching" template fires instead of a silent dead-end. Honors the "you'll receive an email shortly" promise. (`components/ui/email/templates/onboarding-fallback-notice-template.tsx`, `lib/email/onboarding-fallback-service.ts`, new `EmailType.ONBOARDING_FALLBACK_NOTICE`)
- **Onboarding emails now route through the production wrapper.** Bespoke `getEmailTemplate(EmailType.IMMEDIATE)` block replaced with `sendFilingSummaryEmail`. Onboarding inherits the Form 4 quality gate (blocks all-zero transaction emails), `importance` badge, `smartSubject` line, feedback up/down URLs, and production tag schema (`type:filing-notification`, `filing-type:X`, `ticker:Y`) — analytics dashboards see onboarding emails alongside cron emails.
- **6 new test suites, 102 unit tests** covering the ranking formula, analysis-depth helper (Zod-validated, defends against malformed legacy data), pick-best logic with two-stage select, idempotency guards, fallback service, fallback template, and the headline-extraction helper. The hero card test suite expands from 12 to 19 tests.
- **Idempotency tracking on User row** — `User.onboardingFirstEmailSentAt` and `User.onboardingFirstSummaryId` columns plus a backfill (`onboardingFirstEmailSentAt = createdAt`) for existing onboarded users so the new guard treats them as already-sent. Migration is split: `20260505_add_onboarding_user_columns.sql` (transactional, safe under `prisma migrate deploy`) + `20260506_add_summary_status_index.sql` (CONCURRENTLY index, applied via psql out-of-band).
- **Covering index** `Summary(processingStatus, tickerId, filingDate DESC)` for the cross-user ranking query at scale.

### Changed
- **Two-stage Prisma select** for ranking — thin candidate pull (50 rows, no large JSON fields beyond what analysis-depth needs) → fat re-fetch by id of the winner only. ~50× memory reduction at the ranking step.
- **`SUCCESS_STATUSES` extracted** to `lib/db/summary-status.ts` as a single source of truth for the four legacy mixed-case `processingStatus` values that indicate a usable summary.

## [0.0.26.5] - 2026-05-07

### Added
- **Email-template defensive helpers + grounding utilities (foundation for next phase).** Three pure-function modules and one design-system addition land independently of the consuming pipeline so they can be wired in incrementally without re-reviewing the whole AI integration:
  - `lib/ai/processing-status.ts` — `ProcessingStatus` const enum + `isSuppressedFromEmail()` helper. Single source of truth for the four `Summary.processingStatus` values (`PROCESSING`, `COMPLETED`, `COMPLETED_WITH_WARNINGS`, `OUTPUT_TRUNCATED`, `FAILED`) so writer (`lib/ai/summarize.ts`) and email-gate readers reference the same identifiers instead of scattered string literals.
  - `lib/ai/prompts/strict-schema.ts` — `toStrictSchema()` mechanically converts any JSON Schema to OpenAI strict-mode-compatible form (every property in `required`, optional fields nullable via `type: ['X', 'null']`, strips `oneOf`/`anyOf`/`format`/`pattern`/`enum`). `auditStrictCompliance()` exposed for tests so future schema additions are verified at unit-test time. Designed to apply at the API boundary so the source schemas in `unified-prompts.ts` stay readable.
  - `lib/ai/parsers/ticker-grounding.ts` — `findForeignTickers()` and `validateTickerGrounding()`. Detects `$TICKER`-prefixed and bare-word UPPERCASE 2-5-char tokens (filtered against a ~70-item acronym allowlist: CEO, EPS, USD, IPO, NYSE, FDA, …) PLUS a top-15 company-name alias map (Tesla, Apple, Microsoft, Google, Amazon, Meta, NVIDIA, Berkshire, JPMorgan, Coca-Cola, Disney, Netflix, Intel, Oracle, Palantir, Stripe). Triggered by a real failure: a JPM S-3 fresh summary said "This $5B shelf provides TSLA flexible..." — model swapped tickers mid-sentence. Wired-in version (P2) will redact the contaminated AI string and emit a counter.
  - `components/ui/email/design-system.ts` — three new exports: `isUsableMetricRow()` filters AI-emitted financial-highlight rows that are `$NaN`/`N/A`/`null`/`Not disclosed`/character-indexed-object artifacts, so 10-K/10-Q templates never render "undefined undefined". `sanitizeBodyProse()` strips `--`/em-dashes/inline arrows/redundant `YoY|QoQ` suffix from cached AI body prose. `stripPeriodSuffix()` strips a trailing `YoY`/`QoQ` from values headed into a column whose header already conveys the period.
- **5 new test suites, 146 unit tests.** All Phase F/G/H utilities have parameterized coverage including: char-indexed-object detection, AI-placeholder rejection, every acronym-allowlist case, top-15 company-name aliases, every JSON-Schema converter rule, every `ProcessingStatus` × `isPartialResult` combination, and S-3 helper utilities (`formatShelfDate` for `DD Month YYYY`, `dilutionColor` severity-aware logic).



### Added
- **3-email campaign revamp — full track ships in one PR.** Combines PR 1 (security + design-token foundation) and PR 2 (locked Hybrid voice + curated story content) into a single landing because main advanced past the originally claimed v0.0.25.4/v0.0.25.5 slots.
- **`<EmailHeroBlock>` section component** (`components/ui/email/templates/sections/EmailHeroBlock.tsx`). Renders the locked Variant C Hybrid hero from `.claude/tasks/design-shotgun/email-1-hero-2026-04-29/`: dry, ticker-prefixed observational headline (Levine-style) plus an optional brand-purple left-rail "why it matters" gloss. Headline runs through `ensureTickerPrefix` + `capHeadline(90)` for the same defensive truncation contract as production filing emails. 10 unit tests cover ticker-prefix idempotency, capHeadline(90) truncation, custom `headlineMaxChars` override, empty-headline no-op, brand-purple rail toggle, and JSX auto-escape on hostile input.
- **`headline?` + `whyItMatters?` + `filingUrl?` craft-layer fields on `CampaignFiling`.** When present, the hero renders the curated dry observation + gloss; when absent, falls back to raw `filing.title`. `filingUrl` flows from `Summary.filingUrl` through `toCampaignFiling` so the "Source: SEC EDGAR" link resolves through `getSecFilingViewerUrl()` to the actual archive index page (the same path production filing emails use).
- **Subject A/B variants for E1 — locked from `/design-shotgun`:**
  - **A (default):** `${ticker}: ${headline || title}` — case-preserved, deduped via `ensureTickerPrefix` so an LLM-built `smartSubject` like `AMZN: Q1 results` never doubles to `AMZN: AMZN:`. Subject prefers the curated `headline` over `title` so the inbox preview matches the body hero.
  - **B (test):** `The ${filingType} every ${ticker} holder needs to see` — Hormozi pattern with embedded ticker.
- **E2 digest now leads with curated stories on popular tickers.** Static subject is `Filings we caught for you this week` (replaces the spammier "N SEC filings you should know about"). Three fallback rows feature TSLA 10-K (Musk comp re-ratification material risk + no plan B), META 10-Q (Reality Labs $4.5B quarterly loss / $60B cumulative), GOOGL 10-K (first annual after DOJ search-monopoly verdict).
- **E3 reframed around regret-trade FOMO and tightened to blog cadence.** Subject: `the multibaggers you didn't buy`. Opener cut from 4 paragraphs to 2 — short punchy sentences ("You watched. You knew the thesis. You didn't pull the trigger."). Three hedge-fund truths reduced to single declaratives ("The market-moving line is on page 47. Page one is decoration."). FAQ block deleted entirely. Sub-CTA: `Cancel anytime in one click.` (the redundant "card won't be charged" line was dropped).
- **E1 "Source: SEC EDGAR" link now opens the actual filing document, not a documents catalog or data viewer.** New `resolveSecPrimaryDocumentUrl()` helper in `lib/email/url-utils.ts` fetches EDGAR's `index.json` for a given filing, picks the primary `.htm` matching the form type (or largest `.htm` as fallback), and returns the direct document URL. Caches by accession-no to avoid hitting EDGAR on per-cohort sends. Gracefully degrades to the input URL on any fetch/parse failure so recipients never get a broken link. Handles all three URL shapes production stores in `Summary.filingUrl`: `-index.htm` files, directory URLs with trailing slash, and bare directory URLs. Preview script's `resolveFilingUrl()` chains through this helper after the DB lookup.
- **`lib/email/sp500-top30.ts`** — single-source-of-truth top-30 S&P 500 ticker pool. 30 brand-recognizable, news-verifiable tickers ordered by approximate market cap. `SP500_TOP_30_TICKERS` Set + `isTop30Ticker(s)` predicate. 7 contract tests pin the 30-element invariant and verify NVDA/TSLA/AAPL/MSFT remain in pool (campaign-fallback fixtures depend on them).
- **`SignalColors` + `importanceToSignalLevel` design tokens** (`components/ui/email/design-system.ts`). Canonical 3-tier importance palette (HIGH amber / MODERATE indigo / LOW slate) shared by `campaign-demo-template.tsx` and the inline-HTML campaign emails. `critical` collapses into `HIGH` — design system intentionally avoids a fourth band.
- **`lib/email/__fixtures__/campaign-fallback-filings.ts`** — extracted fallback hero + 3-row digest from `campaign-templates.ts`. NVDA 10-Q hero with `heroHeadline: "NVDA: 3 customers each booked over 13% last quarter"` + Hybrid `whyItMatters`. Test suites assert against the fixture export instead of duplicating string literals.
- **`scripts/preview-campaign.ts`** — dev-only preview tool that renders all 4 campaign permutations (E1A / E1B / E2 / E3) plus a 5-story curated pool (NVDA / TSLA / META / AAPL / AMD) and sends them to a single inbox via Resend. Tags as `campaign=preview-pr2` to keep production analytics clean.
- **10 campaign test suites — 117 passing + 9 todo:**
  - `campaign-xss.test.tsx` (14 tests) — XSS coverage with a component-aware `renderAsync` mock that escape-encodes string props as `data-*` attributes, so hostile `companyName`/`title` payloads flowing through `<EmailHeader>` + `<EmailHeroBlock>` JSX are still verified to be HTML-escaped.
  - `campaign-subject-consistency.test.ts` — case-preserved subject schema, variant B Hormozi pattern, ticker-prefix dedup, headline-priority assertion, ALL-CAPS-tickers-anywhere heuristic for variant B mid-string `NVDA`.
  - `campaign-rendering.test.tsx` (21 tests) — dynamic-filing hero composition for AAPL/MSFT/NVDA, curated headline + whyItMatters flow-through, fallback variant A/B subjects, preheader gloss-first / summary-fallback, and the "no E1 importance band" assertion.
  - `campaign-token-consumption.test.ts` — band colors scoped to E2 only (E1 dropped its band); `KNOWN_LAYOUT_HEX` whitelist + token-source scan.
  - `campaign-prompt-eval.test.ts` — pins voice rules: no filler verbs, ≤2 exclamation marks, no marketing scream, FOMO opener + hedge-fund subhead pinned, "lede" word forbidden, EDGAR brand-purple link asserted.
  - `campaign-resend-tags.test.ts`, `campaign-utm-variant.test.tsx`, `campaign-performance.test.ts`, `email-hero-block.test.tsx`, `sp500-top30.test.ts` round out the surface.

### Hardened
- **`escapeHtml` applied at every dynamic interpolation site in `lib/email/campaign-templates.ts`** (PR 1.1). Closes the residual XSS risk that user-controllable `Summary.title` / `Summary.summary` / `Filing.companyName` strings could inject `<script>` or break out of HTML attributes when rendered into the inline campaign HTML. Mirrors the defensive posture already in place for `8k-minimalist-template.tsx`.
- **`stripCrlf` applied to subject + preheader composition** so header-injection attempts via filing-derived strings cannot insert `\r\n` into Resend `To:` / `Subject:` headers.

### Refactored
- **E1 stripped its preamble and closing pitch.** The "You signed up for tldrSEC a few weeks ago. Here's what our AI does..." opener and "On EDGAR, reading this 10-Q takes 15-20 minutes" closer were both deleted. The whole email body is now the actual product output the recipient would receive as a paying user — hero + summary + filed-date line + CTA.
- **E1 dropped the importance-band card.** Locked Levine voice puts importance into the dry headline + gloss, not a colored card. E2 (digest) keeps colored bands because scannability is the digest's reason to exist.
- **E1 added a CTA button + brand-purple EDGAR audit link.** Bottom button (`See more filings like this`) routes to `https://tldrsec.app` (campaign recipients are unregistered — they go to the landing page, not the trial flow). Inline `Source: SEC EDGAR` hyperlink on the filed-date line uses `EmailColors.semantic.accent` (`#7C3AED`, the same brand purple as the why-it-matters left rail).
- **Two `renderAsync` calls in `email1()` parallelized via `Promise.all`** — saves 1-2ms per recipient render; multiplies on batch sends.
- **`getCampaignEmailContent` is now async** (`campaign-templates.ts` + `app/api/admin/campaign/send/route.ts`). The route awaits per-recipient renders in parallel.
- **Section composition in `campaign-demo-template.tsx`** (PR 1.3) — replaced inline header markup with `<EmailHeader>`, matching the 11 minimalist filing templates.
- **`capHeadline` from `design-system.ts` reused for digest summary truncation** (PR 1.6) — replaces a one-off slice + ellipsis at 200 chars with the design-system helper.
- **Inline color helpers deleted in favor of `SignalColors[importanceToSignalLevel(x)]`** (PR 1.4) at the importance-band interpolation sites.

### Verified
- **`Summary.filingDate` index already present in `prisma/schema.prisma`** (PR 1.7). The `fetchScoredSummariesLast30Days` query plan was at risk of a sequential scan on the 30-day window; existing `@@index([filingDate])` is sufficient. No schema migration required.
- **Full email surface green** (60 suites): 852 passing + 9 todo + 4 skipped. 11 campaign + url-utils suites cover the new primary-doc resolver, brand-purple source link, and the FOMO E3 voice.

### Pre-existing issues confirmed (not introduced by this PR)
- `campaign-demo-template.tsx`, `campaign-digest-template.tsx`, `campaign-invite-template.tsx` have 4 pre-existing TS errors against `EmailFooterProps` (extra `filingUrl` arg) and a `<td>` `bgcolor` typing mismatch. Confirmed identical errors on bare `origin/main`. Tracked for a separate `chore: fix campaign-template TS errors` PR.

## [0.0.26.3] - 2026-05-06

### Changed
- **Onboarding final step is now the email-promise confirmation screen.** The reminder note "We'll email you when new filings are posted for N companies" used to live inline at the bottom of the "Tell us about yourself" profile step. New users now see it as a dedicated final step with a hero treatment: brand-blue mail icon, larger heading with the company-count number rendered in brand-blue, and a single brand-blue "Complete setup" CTA. Email-frequency selector is collapsed behind a "Change" toggle by default so the promise stays the focal point. Replaces the existing A/B fork: `useOnboardingVariant` fallback shifted from `inline` → `step4` (`lib/hooks/use-onboarding-variant.ts:15`), so every new user gets the polished 4-step flow. Returning users mid-experiment retain their assigned bucket via sessionStorage/cookie. The `ONBOARDING_COMPLETED` analytics event now emits `variant: "step4-polished"` so PostHog funnels keyed on this property survive the rollout cleanly.
- **Vertical progress bar shows celebratory completion on the final step.** Steps 1-3 (Sectors, Companies, Profile) and step 4 (Review) all render the brand-blue check icon when the user reaches the final screen. The active step keeps `aria-current="step"` and a subtle ring overlay so "you're here" remains clear without losing the "you're done" feeling.

## [0.0.26.2] - 2026-05-06

### Fixed
- **First-visit confetti on the dashboard fires again in dev** (`components/dashboard/dashboard-onboarding.tsx`). Under Next.js 15 + React 19's default-on strict-mode dev double-invoke, the original code flipped `confettiFiredRef` to `true` *before* scheduling the 500ms `setTimeout`. The strict-mode cleanup cancelled the timer; the second mount's effect saw the ref already set and returned early, so confetti never fired locally. Production builds were unaffected (no double-invoke), which is why this looked like "it was working." Moved the ref flip inside the timer callback so the second effect run can reschedule. One-line move + a 3-line comment explaining the strict-mode interaction.

## [0.0.26.1] - 2026-05-05

### Changed
- **Sign-in and sign-up pages now show one cohesive form**, not a custom Google button floating above a separate Clerk card. Both pages render Clerk's native `<SignIn>` / `<SignUp>` directly with `appearance` overrides for Geist font, brand color, and Tailwind chrome. Net -185 LOC across both pages: deleted the custom `GoogleIcon`, the `MutationObserver` skeleton glue, the duplicated OAuth handlers, and ~95 lines of hydration-state plumbing. Sign-up requires Name + Google enabled in the Clerk dashboard for first/last name fields to render.

### Fixed
- **Cookie injection on `/sign-up?plan=...&ref=...`**. The campaign attribution effect previously interpolated raw query-string values into `Set-Cookie` strings without validation. A URL like `?plan=pro;Domain=evil.com` could splice attributes; oversized values could corrupt the header. Plan values are now matched against `^[a-z]{1,16}$`, ref values against `^[a-zA-Z0-9_-]{1,64}$`, and both are `encodeURIComponent`-wrapped. Three regression tests added.
- **WCAG AA contrast on auth pages**. The footer "Sign up" / "Sign in" link color was `#0079F2` (4.06:1 on white, fails AA for normal text). Switched to `#0066CC` (5.86:1, passes AA).
- **Onboarding skip via `redirect_url` query param**. The deleted custom Google button used `redirectUrlComplete` (forced redirect). Clerk's `signUpFallbackRedirectUrl` only fires when no `redirect_url` is present, meaning a marketing link with `?redirect_url=/dashboard` could land users on the dashboard without provisioning. Added `forceRedirectUrl="/onboarding"` (sign-up) and `forceRedirectUrl="/dashboard"` (sign-in) to override.
- **Mobile keyboard pushing submit below the fold** on iOS. Swapped `min-h-screen` → `min-h-dvh` on both auth pages and added `items-start sm:items-center pt-12 sm:pt-0` so the form pins to the top with breathing room when the keyboard is up, and centers normally on tablet+.

### Removed
- `__tests__/app/(auth)/sign-in/page.test.tsx` rewritten as a minimal smoke test. The previous version asserted properties of the deleted custom Google button (button text, redirect args, appearance shape) — none of which exist anymore.

## [0.0.26.0] - 2026-05-04

### Added
- **Collective "Reading time saved across all investors" counter on the landing-page hero** (`components/landing/sections-v2/gmail-inbox-hero.tsx`, `components/landing/minutes-saved-counter.tsx`, `lib/db/landing-stats.ts`). A continuously-incrementing whole-minutes counter, anchored to a server-side aggregate of `Summary.inputTokens - outputTokens` across the entire platform, projected forward client-side at random intervals so it always feels alive. Sits in the Stripe slot — small line above the H1 — to flex platform scale to prospects rather than report individual usage. The "FOR INVESTORS AND ANALYSTS" eyebrow above the H1 was deleted to avoid stacking labels.
- `lib/db/landing-stats.ts` — `fetchGlobalMinutesSaved()` returns `{ totalMinutes, ratePerSecond }`. 30-day token aggregate drives the projection rate, with a `0.5 min/sec` floor so the counter is always visibly ticking even during quiet periods. Cached at the route level via `app/page.tsx` `revalidate = 60` (one DB hit per minute, regardless of visitor count).
- `components/landing/minutes-saved-counter.tsx` — random-interval scheduler picks tick intervals in `[base × 0.4, base × 1.8]` (0.5–2.5s observed in practice) so the counter doesn't read as mechanical. Pauses on `document.hidden`, resumes on visibility change. Respects `prefers-reduced-motion` (renders static integer). Server-fetched anchor used as the SSR initial state for hydration parity.
- `__tests__/components/landing/minutes-saved-counter.test.tsx` — 11 tests covering initial render, zero/NaN/negative-rate fallbacks, tabular-nums styling, scheduler activation, cleanup, prop re-anchoring, className passthrough, and aria-hidden suppression of the inner live region.

### Changed
- **`components/landing/counter/digit-roller.tsx` animation direction flipped to mechanical-odometer-forward.** Previously new digits slid in from above and old digits slid down — visually that reads as "rewinding." Now new digits enter from below and old digits exit upward, matching the user intuition for an incrementing counter. Applies to both the landing-page collective counter and the existing `WaitlistCounter` (both increment-only, so the change is uniformly an improvement).
- **`components/landing/counter/counter-display.tsx` thousands-separator spacing tightened** by removing `mx-0.5` from the comma span. With 5+ digit values the previous `mx-0.5` (4px total) read as a visible gap; commas now sit flush against adjacent digits.

### Removed
- "FOR INVESTORS AND ANALYSTS" uppercase eyebrow above the hero H1 (`components/landing/sections-v2/gmail-inbox-hero.tsx`).

## [0.0.25.8] - 2026-05-03

### Fixed
- **Dashboard "two waves" loading skeleton** (`app/dashboard/loading.tsx`). The route-level loading boundary rendered an obsolete 8-row table mock with pagination that did not match the dashboard's actual card-list UI. Users saw a fake table skeleton → blank flash → real card skeletons that did not match the table they had just seen — that is the literal "skeleton then MORE skeleton" experience the dashboard had been giving. Replaced with a shell that mirrors `app/dashboard/page.tsx` and reuses the same `StatsSkeleton` and `ActivitySkeleton` components the page's Suspense boundaries fall back to. Net `-178` lines, including the dead table mock and its tests.
- Rewrote `app/dashboard/__tests__/loading.test.tsx` to match the new card-list shape and added a regression test asserting no `<table>` element is rendered, so the table mock cannot silently come back the next time the dashboard layout is touched.

## [0.0.25.5] - 2026-05-01

### Changed
- **Consolidated three disagreeing "is trial active" call sites** into a single helper `lib/auth/tier-eligibility.ts`. Phase 1 of the X-search-MAX-only gating plan (`tasks/x-search-max-only.md`); refactor only, no observable user-facing change beyond a 5-min clock-skew grace harmonized across all sites.
  - **Sites consolidated** (each previously had subtly different semantics):
    1. `lib/cron/tier-priority.ts:28` — already had 5-min backwards grace; now imports `isActiveTrial`.
    2. `lib/auth/trial-service.ts:80,173` — `checkTrialStatusFromUser` and `batchCheckTrialStatus` previously used `daysRemaining > 0` (no grace, day-ceiling math). Now uses `isActiveTrial({ isTrialing: true, trialEndsAt })`. Hard-coded `isTrialing: true` preserves legacy semantics where presence of `trialEndsAt` was treated as "in trial" regardless of `user.isTrialing`. Net effect: trials within the 5-minute clock-skew window keep access (was previously cut off mid-second).
    3. `lib/cron/handlers/weekly-digest-handler.ts` — previously `trialEndsAt: { gt: now }` (strict, no grace). Now `trialEndsAt: { gt: getActiveTrialCutoffDate() }` (5-min grace). Eliminates a digest-skip race for users whose trial was about to expire when the cron fires.
- **Single grace constant**: `MAX_ELIGIBILITY_GRACE_MS = 5 * 60 * 1000` defined once. Helper exports `isActiveTrial`, `isMaxEligible`, `hasActiveAccess`, `getActiveTrialCutoffDate`. `isMaxEligible` returns true for `tier === 'MAX'` OR active trial — used by Phase 4 producer-gate (not yet shipped).

### Added
- `__tests__/auth/tier-eligibility.test.ts` — basic helper coverage including 5-min grace zone behavior, MAX-only gating (PRO returns `false` from `isMaxEligible`), null-trial fallthrough.
- `__tests__/auth/tier-eligibility-parity.test.ts` — golden-master parity matrix across `{tier: FREE/PRO/MAX} × {isTrialing: true/false/null} × {trialEndsAt: null/graceZone/past/future}` verifying the new helper matches legacy semantics for every combination, with documented grace-zone harmonization for sites B and C.
- `__tests__/auth/tier-eligibility-purity.test.ts` — source-inspection guard asserting the helper file contains no `await`, `async`, or I/O imports. Stops the helper from drifting into a DB query and breaking the cron's tight loop.

## [0.0.25.4] - 2026-04-30

### Changed
- **10-Q scorecard metric set rebalanced** (`lib/ai/prompts/unified-prompts.ts`, `components/ui/email/templates/10q-minimalist-template.tsx`). Drops standalone "Operating Income $" (redundant with Operating Margin once Revenue is shown) and adds two more analytically meaningful margins: **Operating Margin** (operational efficiency) and **FCF Margin** (cash conversion / earnings quality). Canonical 6-row scorecard now reads top-to-bottom of the income statement plus a cash-quality check: Revenue → Gross Margin → Operating Margin → FCF Margin → Net Income → EPS (diluted). Template row cap bumped 5→6 to fit.
- **Margin deltas render with `%` suffix** (`components/ui/email/templates/10q-minimalist-template.tsx` parseDelta + `lib/ai/prompts/unified-prompts.ts` 10-Q rules). Inputs like `"+1.33pp"` / `"-2 points"` / `"+0.5 pts"` are accepted (so older cached LLM outputs still render with green/red coloring), but rendered text and "Why it matters" prose uniformly read `+1.33%` / `−2.00%` / `+0.50%`. Disambiguation between relative-change rows (Revenue, Net Income, EPS) and percentage-point rows (Margins) lives in the metric label, not the unit suffix. Prompt updated to instruct the AI to emit `%` directly and to clarify that `%` on margin deltas is a unit label, not a relative change.
- **Pill component renders pp deltas as colored pills** (`components/ui/email/templates/10q-minimalist-template.tsx` parseDelta). "+1.33pp" / "-2.21pp" / "+0.5 pts" / "-2 points" all parse with proper green/red coloring + 2-decimal formatting, instead of falling through to the gray "unparseable" fallback.
- **"Latest" column values normalized to 2 decimal places** (`components/ui/email/templates/10q-minimalist-template.tsx` formatValue). New `formatValue()` helper pads `$611M → $611.00M`, `$1.2B → $1.20B`, `30% → 30.00%` while leaving already-precise values (`$3.59`, `51.43%`) and unparseable strings (`N/A`, `—`) untouched. Prompt also requires 2-decimal precision on dollar amounts (`$611.02M`, `$3.59`) so the AI emits canonical values rather than relying on template post-processing alone.
- **Scorecard percentage deltas render to 2 decimal places** (`components/ui/email/templates/10q-minimalist-template.tsx`). Previously `+6.1%`, `0%`, integer `+7%` rendered as-is; now consistently formatted as `+6.10%`, `0.00%`, `+7.00%`. Prompt also instructs the AI to emit 2-decimal precision so QoQ/YoY computations match the rendered format.

### Fixed
- **10-Q financial scorecard was reporting prior-year figures as "Latest"** (e.g., FDS Q1 FY2026 email showed Revenue $560M / Net Income $100M when the filing reported $611M / $133M). Three compounding causes:
  1. **`maxChunkSize` for 10-Q was 8,000 chars** (`lib/ai/prompts/context-manager.ts`) — too small for the income-statement table (current-quarter + prior-year + YTD columns). Bumped to 24,000 (overlap 800→2,000) so chunks span the full table.
  2. **Key-section windows extracted only 5,000 chars** (`-500/+4500`) around phrases like "Financial Statements" (`lib/ai/summarize.ts`). For quarterly/annual filings, widened to 19,000 chars (`-1000/+18000`) so multi-column tables aren't truncated mid-row.
  3. **Prompt was permissive about which column to read** (`lib/ai/prompts/unified-prompts.ts`). Added an explicit "CURRENT-PERIOD COLUMN ONLY" section: extract the leftmost column matching `fiscalQuarter`, never the prior-year comparison; do NOT copy figures from the Historical Context block (those are stale prior-quarter summaries); always populate both YoY (`change`) and QoQ (`qoqChange`), returning `"N/A"` when prior-quarter data is unavailable rather than fabricating.
- **FCF Margin extraction more reliable in production** (`lib/ai/summarize.ts`, `lib/ai/prompts/unified-prompts.ts`). Three further compounding causes the chunk-size/window/column fixes above didn't cover:
  1. **Cash-flow section wasn't being indexed for chunk-spanning extraction.** `keyPhrases` in summarize.ts didn't include "Cash Flow" or "Statements of Cash", so when the income statement and cash flow statement landed in different chunks, the cash flow rows weren't pulled into the cross-chunk key-content block. Added both phrases.
  2. **Phrase indexing was case-sensitive** (`indexOf(phrase)`), so EDGAR filings using ALL-CAPS section headings (e.g., "CONDENSED CONSOLIDATED STATEMENTS OF CASH FLOWS") fell through. Switched to lowercased-substring match on both sides — the section index is now resilient to header capitalization variants.
  3. **Prompt didn't handle YTD-only cash flow statements.** 10-Qs typically present cash flow YTD only (e.g., "Six Months Ended Feb 28, 2026"), not for the 3-month current quarter. Without explicit guidance the AI either skipped FCF, returned YTD-margin as if it were Q-only, or approximated from net income. New PERIOD MATCHING block instructs Grok to: (a) prefer a 3M column if disclosed, (b) otherwise derive Q-only FCF as `(current YTD FCF) − (prior-quarter YTD FCF from Historical Context summary)`, (c) return `"N/A"` when neither path is reliable rather than fabricating, and clarifies that the CapEx line is typically labeled "Purchases of property, equipment, and leasehold improvements" with "Capitalized software" included if disclosed under investing activities.
- **Mock test script (`scripts/send-test-10q-scorecard.ts`) had wrong diluted EPS** — used `$3.39` when the FDS 10-Q image clearly shows `$3.59`. Root cause: hand-extraction reading error from a low-resolution screenshot; production extraction is unaffected because Grok reads filing text, not images. Re-derived YoY (−6.75%) and QoQ (−11.58%) from the actual income-statement values, plus corrected QoQ Gross Margin (−4.48% vs the earlier −0.42% guess) using `Q1 FY26 = (6M YTD) − (3M Q2)` arithmetic. Inline doc-comment now records the exact derivation and source figures so the mock can be re-verified against the filing.

### Tests
- `__tests__/email/10q-pill-delta.test.tsx` — updated assertions to 2-decimal output and `%` suffix, added tests for `formatValue()` (short magnitudes, integer percentages, `N/A` passthrough). All 15 tests pass.
- AI test suite (`npx jest lib/ai`) shows identical pass/fail counts before and after the summarize.ts changes (253 pass / 97 pre-existing OpenRouter circuit-breaker fails) — no regressions introduced.

## [0.0.25.3] - 2026-04-29

### Added
- **X sentiment block now renders inside the three minimalist email templates** (10-K, 10-Q, 8-K). New shared section `components/ui/email/templates/sections/XSentimentSection.tsx` (~240 lines): black-bar header with `Last {windowHours}h` window chip, direction/confidence/shift chips driven by `BadgeColors` design tokens, narrative paragraph (`discussionSynthesis`), up to 3 fact-claim bullets, and up to 5 monospace x.com source links. Each template extracts `summaryData.xSentiment` and gates render through `shouldRenderXSentiment()`.
- **`shouldRenderXSentiment` doubles as a runtime payload validator** on top of being an "is this worth showing" check. Hardens four ways the upstream cast could land bad data without crashing the email render:
  - rejects unknown `direction` enum values (would otherwise crash on `DIRECTION_BADGE[direction].label`),
  - rejects unknown `confidence` enum values,
  - drops `direction === 'no_signal'` and empty `discussionSynthesis`,
  - drops `confidence === 'low' && factClaims.length === 0` so a directional chip backed by zero verified claims never reaches a customer inbox (F3 demotes confidence→low when citations<2 OR factClaims empty, but does not demote the direction).
- **Citation URL host re-allowlist in the renderer** (`isSafeXCitation`): defense-in-depth on top of F3, only `https://` URLs whose hostname is in `{x.com, www.x.com, twitter.com, www.twitter.com}` reach the `<a href>`. Closes the residual risk that a cached/bypassed payload could ship a `javascript:` href into a Resend email.

### Fixed
- **`[object Object]` regression in 10-Q story bullets** (`components/ui/email/templates/10q-minimalist-template.tsx`): unified-prompts schema declares `guidanceUpdates` / `keyPoints` / `riskFactors.slice(0,3)` as `string[]`, but Grok occasionally returns `{metric, current, change}` object literals. Previously these rendered as the literal string `"[object Object]"` through `markdownToHtml`. New `coerceStoryItem(item: unknown)` helper extracts a displayable string from common object shapes (`text`/`description`/`summary`/`content`/`value`/`detail` keys, or synthesizes `**{metric}** {value}` if both are scalars) and drops anything else.

### Repaired (drift)
- **VERSION + package.json drift inherited from #485** (`VERSION=0.0.25.1`, `package.json=0.0.25.2`). Bumped both + `package-lock.json` to `0.0.25.3` so all three files agree, restoring the invariant that `/ship` enforces.

## [0.0.25.2] - 2026-04-29

### Changed
- **X sentiment pipeline now ingests images and videos** — the `x_search` tool is invoked with `enable_image_understanding: true` and `enable_video_understanding: true` so chart screenshots, product demos, and earnings-call clips factor into the sentiment synthesis. Prompt updated to instruct the model to incorporate visual context but cite the post URL, not the media asset. End-to-end smoke test on TSLA over a 7-day window: $0.0614 / call, 38s latency, 12 citations, bullish/shifting_bullish/high — visual posts surfaced cleanly without polluting citations.
- `lib/ai/xai-direct-client.ts` — `XaiTool` union expanded to expose `enable_image_understanding` (x_search + web_search) and `enable_video_understanding` (x_search) flags so callers can opt in type-safely.

### Fixed
- **Citation URL pollution from image-CDN hosts** — with image understanding enabled, `extractCitationUrls` was picking up `pbs.twimg.com/media/*` and `video.twimg.com/*` asset URLs from the response payload and persisting them onto `summaryJSON.citationUrls`, which would have broken any downstream tweet-embed UI assuming `x.com/{handle}/status/{id}` shape. Validator's `isValidUrl` now allowlists trusted citation hosts (`x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`, `mobile.twitter.com`) and drops everything else into the `urlsStripped` counter for observability.

## [0.0.25.1] - 2026-04-29

### Fixed
- **Email subject lines truncating mid-word in Gmail's reading pane** (`lib/ai/parsers/response-parser.ts:133-149`): Gmail visually truncates subjects past ~80 chars and renders its own ellipsis, producing ugly mid-word cuts like "CMG: Chipotle hired Fernando Machado as Chief Brand Officer effective June 1, 2026, and..." (real CMG 8-K regression). Replaced the previous hard `substring(0, 100)` slice in `normalizeFields()` with a 78-char word-boundary fold: slice to 77, find the last space (rejecting cuts before column 30), strip dangling punctuation (`,;:.\-–—`), append a single `…`. The ellipsis is now ours, lands on a real word, and the full subject fits Gmail's reading-pane width.

### Changed
- **Defense-in-depth on the 78-char ceiling** across the AI pipeline so a regression in one layer doesn't silently re-introduce the bug:
  - `lib/ai/prompts/unified-prompts.ts` `BASE_SCHEMA_PROPERTIES.emailSubject` — `maxLength` 100 → 78, description rewritten to spell out the Gmail constraint and forbid multi-fact stuffing.
  - `lib/ai/parsers/schema-validators.ts` — all 9 Zod schemas (`10K`, `10Q`, `8K`, `Form4`, `Form3`, `S1`, `DEF14A`, `Form144`, `Generic`) tightened from `z.string().max(100)` → `max(80)` on `emailSubject`. Note: this Zod path is currently aspirational — the runtime parser uses `simple-parser.ts`'s local validator which only checks required field presence — but the cap is now correct if/when Zod validation is wired into the hot path.

### Added
- `__tests__/ai/parsers/response-parser-normalization.test.ts` — 2 new regression tests: (1) hard truncation of a 130-char single-token subject to ≤78 chars ending in `…`, (2) the exact CMG 8-K subject is folded at the last word boundary, ends in `\w…` (no dangling punctuation), and stays ≤78 chars.

### Repaired (pre-existing, surfaced by /ship test gate)
- **`__tests__/ai/parsers/simple-parser.test.ts`** — repaired 11 test cases that were referencing the pre-refactor field name `keyHighlights` for 10-K/10-Q schemas (renamed to `financialHighlights` and converted from string array to `{label, value}` object array in an earlier release). Also added the now-required `itemNumbers` field to the 8-K validation success case. Failures were pre-existing on `origin/main` and unrelated to the email-subject fix; chose to repair in-branch rather than ship a separate cleanup PR.

## [0.0.25.0] - 2026-04-27

### Added
- **X (Twitter) Sentiment Enrichment Provider** — augments mega-cap SEC filing summaries with public-discussion sentiment via xAI Grok's `x_search` tool. Adds a structured `{direction, shift, confidence, factClaims, opinionClaims, discussionSynthesis, citationUrls}` payload onto `summaryJSON.xSentiment` and squeezes a short `{label, context}` block into the summarize prompt so the AI summary reflects social-discussion context alongside filing fundamentals. Gated by PostHog `x_sentiment_enrichment` flag, mega-cap ticker allowlist (~S&P 100), and form-importance check (8-K / 10-Q / 10-K).
- `lib/ai/xai-direct-client.ts` (276 lines) — direct `api.x.ai/v1/responses` client. Required because `x_search` is xAI-proprietary and not exposed via OpenRouter (verified during G1 spike). Native cost reporting via `usage.cost_in_usd_ticks`, retryable-error classification, abort/timeout handling that propagates pre-aborted upstream signals correctly.
- `lib/ai/x-sentiment-provider.ts` (305 lines) — orchestrates eligibility check → budget debit → xAI call → JSON parse → F3 validator → squeezed prompt block. Returns structured skip reasons (`budget_exhausted`, `xai_error`, `invalid_payload`, eligibility reasons) so caller can degrade gracefully without throws.
- `lib/ai/x-sentiment-eligibility.ts` (146 lines) — form-importance + ticker allowlist gating. Pump-and-dump defense: only runs against the mega-cap allowlist where x_search results have meaningful signal-to-noise.
- `lib/ai/parsers/x-sentiment-validator.ts` (280 lines) — F3 output sanitization. Strips imperative trading verbs ("buy", "sell", "load up", "short this"), price targets, untrusted citation URLs (compares emitted citations against the model's actual `citationUrls` set), enforces enum values, clamps `windowHours` to [1,168].
- 60 unit tests across `x-sentiment-eligibility.test.ts`, `x-sentiment-provider.test.ts`, `x-sentiment-validator.test.ts` — covering eligibility gates, provider skip reasons, abort/timeout paths, F3 sanitization edge cases, and `accessionNumber` log-correlation threading.

### Changed
- `lib/ai/summarize.ts` — passes `accessionNumber` into the X-sentiment provider for log/counter correlation, appends the `--- X SENTIMENT ---` block to the summarize prompt when the provider returns enrichment, persists the full structured `XSentiment` object on `summaryJSON.xSentiment` for downstream dashboard / email-template surfaces.
- `lib/ai/enrichment-flags.ts` — registers `x_sentiment` in the per-provider PostHog flag map (`x_sentiment_enrichment`). The shared daily-budget accumulator (`tryDebitEnrichmentBudget`) is reused for x_sentiment debits at ~$0.05/call (vs ~$0.003/call for "why it matters" providers); cap-envelope split, multi-instance counter, and refund-on-retryable are deferred to a follow-up architecture pass — see `tasks/x-sentiment-budget-architecture.md`.

## [0.0.24.12] - 2026-04-27

### Fixed
- **`storeSummary` was failing for all tickers with `tokensUsed is not defined`** — DB persistence was silently broken even though emails delivered fine via the in-memory path. Restored the missing `tokensUsed` declaration in `services/filings/database/filingDatabase.ts:213`, falling back to `inputTokens + outputTokens` when `metadata.tokensUsed` isn't provided. Filing summaries now persist to the DB again.
- **Migrated `filingDatabase.ts` from direct `import { prisma }` to `getPrismaClient()`** in 6 functions (`findExistingSummary`, `storeSummary`, `storeSummaryForTicker`, `getFilingLogs`, `trackCacheAccess`, `trackEmailDelivery`). Direct prisma imports are captured at module-load time and cannot be intercepted by Jest mocks; the `getPrismaClient()` indirection (already the project convention per CLAUDE.md item 2) lets the test suite mock the client cleanly. Side-benefit: clears 8 pre-existing `'prisma' is possibly 'undefined'` typecheck errors in this file.

### Changed
- **`__tests__/services/filings/database/filingDatabase.test.ts`** — repaired the 3 mock-dependent test cases. Mock factory now uses a getter pattern (`get prisma() { return mockPrisma; }`) to defer reference until after the const initialization, sidestepping the TDZ trap that Jest's hoisting creates. Added `$transaction` to the mock so `storeSummaryForTicker`'s upsert (wrapped in a transaction) lands on the inspected mock. Switched assertions from `summary.create` to `summary.upsert.create` to match the actual code path.
- **`__tests__/security/cache-access-security.test.ts`** — bridged the test's local `prisma` mock (used by `PrivacyConsentService`) with the global `getPrismaClient()` mock from `__tests__/setup.js` (used by the migrated `trackCacheAccess`). Added `mockGetPrismaClient.mockReturnValue(mockPrisma)` in `beforeEach` plus runtime augmentation of `summary.update` and `summaryCacheAccess.create` since the `@prisma/client` auto-mock doesn't supply them. All 25 tests pass.

## [0.0.24.11] - 2026-04-27

### Fixed
- **Hanging indent on wrapped bullet lines in minimalist email templates** (`components/ui/email/templates/sections/BulletList.tsx`, `components/ui/email/design-system.ts`, all 9 minimalist templates: 8-K, 10-K, 11-K, S-1, S-3, DEF 14A, Form 4, Form 144, generic): the second line of any wrapped bullet was previously aligning to the LEFT of the first character (where the bullet glyph sat), producing a visibly broken outdent in the "Watch for:" / "Use of proceeds:" sections — most noticeable on long risk-factor strings in 8-K filings. Replaced the inline `<div>` + `text-indent` hack with a canonical 2-cell email-table pattern (16px fixed bullet cell + flexible text cell, both `valign="top"`) so wrapped lines align under the first text character on Gmail, Outlook, Apple Mail, and mobile clients. Same fix applied to `markdownToHtml` so AI-authored prose with `-`, `*`, or `1.` markdown lists also renders with proper hanging indent.

### Added
- `components/ui/email/templates/sections/BulletList.tsx` — new exported `HangingBulletItem` component (single bullet row using the canonical 2-cell pattern; supports `glyph`, `text`/`html` discriminated union, optional `highlight` for green/red value chips). Existing `BulletList` wrapper now composes `HangingBulletItem` so callers get the fix for free.
- `__tests__/email/list-hanging-indent.test.tsx` — 26 regression tests across 6 describe blocks covering: 2-cell table structure, `width="16"` Outlook attribute, `valign="top"`, `wordBreak: break-word`, bullet color stays `meta` even on highlight rows, `markdownToHtml` regex emits the same 2-cell shape for `-`/`*`/`1.` syntax, and skip behavior for empty/whitespace items.

## [0.0.24.10] - 2026-04-26

### Changed
- **Landing-page Gmail hero — re-curated fixtures (`lib/landing/gmail-mock-summaries.ts`)**: refreshed the 15 hand-curated Gmail mock summaries from the prod DB's last-30-day scoring run. Distribution: 7×8-K, 6×Form 4, 2×10-Q across 9 distinct tickers (AAPL×2, AMZN×2, TSLA×2, META×2, GOOGL×2, JNJ×2, BRK-B, VRT, COIN). Removed unused `TrendingDown` icon import — no bearish-sentiment entries this cycle.
- `components/landing/sections-v2/gmail-inbox-hero.tsx` — footer copy "Updated in real-time" / "Live" → "Updated weekly" / "Weekly" so visitor expectations match the actual cadence of the hand-curation process.

### Added
- `scripts/refresh-landing-fixtures.ts` — operator helper that pulls the top 30 scored summaries from the last 30 days (re-using `fetchScoredSummariesLast30Days` + `dedupeByTicker` so the heuristic isn't duplicated), prints a markdown triage table to stdout, and writes raw fields (smartSubject, summaryText, whyItMatters, dates) to `/tmp/landing-fixture-candidates.json` for fixture authoring. Whitelisted in `.gitignore`.
- `__tests__/lib/email/campaign-templates.test.ts` — 14 regression tests across 4 describe blocks (`scoreFiling`, `dedupeByTicker`, `fetchScoredSummariesLast30Days`, `fetchCampaignFilings`) locking the post-refactor contract: score formula (`importance×3 + rarity×2 + min(tokens/5000, 3)`), dedup-by-ticker order preservation, last-30-day query shape (allows null `processingStatus`, excludes ERROR/FAILED, requires non-empty `summaryText` and non-null `importance`), top-N selection, 200-char ellipsis truncation, and smartSubject → eventType → filingType title fallback chain.
- **`CLAUDE.md` "Recurring Manual Tasks"** subsection — documents the weekly fixture-refresh cadence (run script against prod DB → pick 15 → curate for editorial voice + brand recognition + news verification → ship PR; ~25 min). Footer copy now sets the visitor expectation that this cadence cannot silently slip.

### Refactored
- `lib/email/campaign-templates.ts` — extracted `fetchScoredSummariesLast30Days(take)` and `dedupeByTicker(rows, maxPerTicker)` from the monolithic `fetchCampaignFilings`. Same score formula and final email-output shape; the new helpers are now reusable by `scripts/refresh-landing-fixtures.ts` without duplicating heuristics. The 14-test regression suite locks the contract.

## [0.0.24.9] - 2026-04-27

### Added
- **10-Q financial scorecard — pill deltas** (`components/ui/email/templates/10q-minimalist-template.tsx`): redesigned earnings table to a 4-column grid (METRIC | LATEST | YoY | QoQ) with mono-font pill chips for YoY/QoQ deltas. Positive deltas render green, negative red (with Unicode minus `U+2212`, not ASCII hyphen — visually heavier so `-3.5%` reads instantly), zero/unparseable values fall back to a neutral gray pill. Numbered list rendering for "What to Watch". Spacer rows added before "EARNINGS SCORECARD" and "What to Watch" black bars (email-safe — `marginTop` on `<td>` doesn't render in Outlook).
- `EmailColors.semantic.pill{Positive,Negative,Neutral}{Bg,Fg}` (`components/ui/email/design-system.ts`): six new design tokens for pill chip colors so the scorecard, and any future template that needs delta indicators, all reach for the same source of truth instead of inlining hexes.
- `__tests__/email/10q-pill-delta.test.tsx` — 8 regression tests rendering the full template with realistic financial data and asserting pill background/foreground colors per tone (positive green, negative red with U+2212, zero gray, unparseable "N/A" gray, basis-point "+5 points" gray, missing → em-dash, dual YoY+QoQ pills, no pill bleed onto the dollar-value cell).

### Fixed
- **`parseDelta` was rendering unparseable strings as positive (green)** — `parseFloat("N/A")` returns `NaN` but the old code path treated `>= 0` as positive, so any non-numeric change string ("N/A", "+5 points", basis-point measures) painted green. Replaced loose parse with strict regex (`/^-?\d+(\.\d+)?$/`) over a stripped form (no `%`, `+`, `,`, `$`); unparseable values now correctly route to the neutral gray pill via a discriminated `DeltaTone = 'positive' | 'negative' | 'zero' | 'unparseable'` union.

## [0.0.24.7] - 2026-04-27

### Fixed
- `app/robots.ts`: extended `disallow` to include `/feedback/` and `/unsubscribe`. These dead-end transactional pages already carried `<meta name="robots" content="noindex,nofollow">` (via `app/feedback/{thanks,error}/page.tsx` and `app/unsubscribe/layout.tsx`), but Bing crawled them anyway and indexed them — `noindex` only takes effect once the crawler reads the page, and the meta tag was being treated inconsistently. Adding the paths to robots.txt stops crawl entirely so Bing/Google decay the index entries, and PostHog stops recording bot hits as engaged sessions on those routes. `/unsubscribe` is listed without a trailing slash because email links are constructed as `/unsubscribe?token=...` (bare path with query string) — per RFC 9309, `Disallow: /unsubscribe/` would only match paths starting with `/unsubscribe/` and would miss the bare path that Bing actually indexed.
- `__tests__/seo/metadata-validation.test.ts`: added test asserting `/feedback/` and `/unsubscribe` are present in the robots.txt disallow list.

## [0.0.24.6] - 2026-04-26

### Fixed
- **Newly added tickers now start receiving filings immediately** even if SEC EDGAR has never been queried for that company before. Previously, when a user added a ticker to their watchlist, the symbol could become a "silent monitoring orphan" — the ticker row was created but no SEC filings ever arrived because the upstream CIK (Central Index Key) lookup was never triggered. Three production tickers (PLTR, GS, FDS) were stuck in this state until they were backfilled by hand.
- `app/api/user/tickers/route.ts`: both ticker-create paths (new-user POST branch and existing-user POST branch) now fire `resolveTicker(symbol)` after `prisma.ticker.create()` completes. Pattern is fire-and-forget (`void resolveTicker(symbol).catch(...)`) so the API response stays fast even when SEC EDGAR is slow or unreachable. Failures log at `warn` level — the next cron tick will retry CIK resolution downstream. Idempotent because `cikMapping.upsert(where: { cik })` deduplicates concurrent resolutions of the same symbol.
- Backfilled `cikMapping` rows for the three known orphan tickers (PLTR / GS / FDS) so existing subscribers stop missing filings while the fix propagates.

## [0.0.24.5] - 2026-04-26

### Changed
- Hero (`components/landing/sections-v2/gmail-inbox-hero.tsx`): visual refresh applying Variant C ("Stripe Showcase") direction from the hero wireframes. Added "For investors and analysts" eyebrow above the headline. Headline rewritten as `SEC filings, read in <gradient>minutes</gradient> instead of <gradient>hours</gradient>.` — body in `text-black`, only the time-comparison nouns get the brand gradient (sharper focus than gradienting the whole tail clause). Subhead drops the "AI" qualifier ("AI summaries of every…" → "Summaries of every…") to lead with the deliverable, not the technology. Top padding bumped (`pt-20 lg:pt-24` → `pt-32 lg:pt-40`) so the headline sits off the top edge. Trust metrics row shrunk (`gap-6` w-5 icons → `gap-2 sm:gap-5` w-3.5 icons, `text-lg` value → `text-xs`) and now stacks vertically on `<sm` viewports. Removed the redundant "A real inbox with real AI summaries — click any email." caption (the Gmail toolbar already says "Click any email to preview"). Caption removal closed a vertical gap; restored ~16px breathing room before the Gmail widget via `mb-4` on the trust row.
- Hero CTA: removed the "Go to Dashboard" branch by wrapping the entire CTA block in `{!isOnboarded && (…)}`. Already-onboarded users hitting the marketing page no longer see a redundant button — the Gmail widget itself becomes the implicit CTA for that audience.

### Fixed
- `__tests__/components/landing/gmail-inbox-hero.test.tsx`, `__tests__/components/gmail-inbox-hero.test.tsx`: updated copy assertions to match the new headline span structure (now reads via `screen.getByRole('heading', { level: 1 }).textContent`) and the dropped "AI" qualifier in the subhead.

## [0.0.24.4] - 2026-04-26

### Added
- **Onboarding A/B test — email-notice placement** (`lib/hooks/use-onboarding-variant.ts`, `lib/onboarding/email-notice-constants.ts`): PostHog feature-flag `onboarding-email-notice` buckets users into two variants. Variant B ("inline", default) — 3-step wizard: email-notice copy renders inline on ProfileStep sub-step 2 (AUM screen) via `InlineEmailNotice`. Variant A ("step4") — 4-step wizard: a dedicated `ConfirmStep` follows ProfileStep and surfaces email-frequency controls (Immediate / Daily / None) plus the notice. Bucket assignment is stable: resolved flag is cached in `sessionStorage` plus a short-lived cookie to survive hard-reloads.
- `components/onboarding/confirm-step.tsx` — step 4 card for Variant A. Shows tracked-ticker count, email-frequency radio group (bound to lifted state), legal-notice copy, and two CTAs (Finish, Back). Emits `onZeroTickers` guard when user reaches it with no tickers selected.
- `components/onboarding/inline-email-notice.tsx` — compact disclosure rendered below AUM brackets on ProfileStep sub-step 2 in Variant B. Shows personalised ticker count and settings deep-link.
- `components/onboarding/profile-step.tsx` — accepts `inlineDisclosure?: ReactNode` slot (injected by orchestrator for Variant B) and 6 new lifted-state props (`subStep`, `onSubStepChange`, `selectedRole`, `onRoleChange`, `customRoleText`, `onCustomRoleChange`, `selectedAum`, `onAumChange`) so `OnboardingPage` preserves selections when the user navigates back from step 4.
- `components/onboarding/vertical-progress.tsx` — accepts optional `steps` prop (`ReadonlyArray<{label,key}>`). Defaults to `ONBOARDING_STEPS_BASE` (3 items); Variant A passes `ONBOARDING_STEPS_WITH_CONFIRM` (4 items). Each step renders its number as a visible indicator so tests can assert step count without brittle text matching.
- `app/(auth)/onboarding/types.ts` — exports `ONBOARDING_STEPS_BASE`, `ONBOARDING_STEPS_WITH_CONFIRM`, and `getOnboardingSteps(variant)` helper.
- `app/(auth)/onboarding/onboarding-client.tsx` — orchestrator overhauled: profile sub-step and role/AUM fields lifted to orchestrator state; `handleProfileComplete` branches on variant (Variant A → `handleNext()`, Variant B → `handleCompleteOnboarding(profile)`); `handleConfirmFinish` reads from lifted state; `handleZeroTickers` toasts and navigates back to step 2.
- 75 unit tests across 9 suites covering variant resolution, InlineEmailNotice, ConfirmStep, ProfileStep lifted-state props, VerticalProgress step counts, onboarding-client A/B routing, and email-notice constants.

## [0.0.24.3] - 2026-04-25

### Fixed
- Google Search Console reported 16 known URLs but only 1 indexed for tldrsec.app, with 6 URLs in the **Redirect error** category. Root cause was `/api/unsubscribe?token=...` and `/api/feedback?token=...&vote=...` returning 302 redirects to noindex pages on invalid/missing tokens — Google flags redirect-to-noindex chains. Both routes now return **410 Gone** with `Cache-Control: no-store` and a minimal HTML body (linking to homepage) on every error path; valid tokens still redirect to the existing confirmation pages. 410 tells crawlers to drop stale URLs immediately rather than re-fetching them.
- `components/navigation.tsx` rendered `<NavLink href="/changelog">` and `<NavLink href="/contact">` to routes that don't exist. The nav is mounted on auth pages (`app/(auth)/layout.tsx`), so Googlebot crawled the auth chrome and recorded the 404s. Removed both entries; only `#features` and `#pricing` remain.

### Changed
- `app/sitemap.ts` no longer lists `/sign-up`, `/sign-in`, `/subscribe`, or `/waitlist`. These routes have no unique SEO content and were competing with content pages for crawl budget. They remain crawlable (not in robots.txt disallow), just no longer promoted to Google. `STATIC_LAST_MODIFIED` bumped to `2026-04-21`.
- `app/(auth)/sign-in/layout.tsx`, `app/(auth)/sign-up/layout.tsx` (new), plus `app/subscribe/layout.tsx` and `app/waitlist/page.tsx` now declare `robots: { index: false, follow: true }`. Sitemap-trim alone only stops new discovery; explicit noindex actively drops already-indexed transactional URLs.

### Added
- `__tests__/api/unsubscribe.test.ts` and `__tests__/api/feedback.test.ts` — full 410/302/500 matrix per route (missing token → 410, invalid HMAC → 410, success → 307 redirect, DB error → 500). Locks the SEO contract this fix relies on so a future refactor can't silently regress to the redirect-chain shape.
- `__tests__/components/navigation.test.tsx` — asserts no `/changelog` or `/contact` hrefs render, preventing silent re-introduction of the dead links.
- `__tests__/seo/metadata-validation.test.ts` — added two assertions: robots.txt disallow list contains `/api/`, and the sitemap contains zero `/api/` URLs.

### Notes
- Post-deploy operational steps (manual): submit `sitemap.xml` in GSC, click Validate fix on the Redirect error and Not found (404) categories, request indexing on 5 representative content URLs (`/`, `/companies`, one ticker hub, one filing-type guide, one preview).
- 6-week kill criterion (per `/Users/wilf/.claude/plans/deep-bubbling-dolphin.md`): if non-brand impressions stay <20/week through 2026-06-06, stop investing in SEO and redeploy hours to FinTwit/newsletter distribution.

## [0.0.24.2] - 2026-04-25

### Fixed
- Cloudflare Pages build (`npm ci`) was failing because `package-lock.json` only contained the `darwin-arm64` platform binaries from local generation, missing every Linux/Windows variant the CF builder needs. Surgically injected the 44 missing entries (24 `@esbuild/*` at 0.25.4, 16 `@unrs/resolver-binding-*` at 1.7.2, plus `@napi-rs/wasm-runtime`, `@emnapi/core`, `@emnapi/wasi-threads`, `@tybys/wasm-util`) by fetching tarball URLs and integrity hashes directly from the npm registry. Direct deps and devDeps are unchanged — zero transitive drift (cssstyle stays at 5.3.1, `@clerk/nextjs` at 6.33.0). `npm ci` now succeeds on Linux x64; `npm run build` (Next.js production) verified locally.

### Changed
- `.npmrc` removed two unrecognized config keys (`target_platform=linux`, `target_arch=x64`) that npm warned about on every install. They had no effect; npm's `--cpu`/`--os` flags are the real way to target a foreign platform, and the lockfile is the ground truth anyway. (`.nvmrc` was bumped to `20.20.2` separately on main.)

## [0.0.24.1] - 2026-04-25

### Added
- `components/dashboard/post-onboarding-hero-card.tsx` — inline hero card shown on the first dashboard visit after a user completes onboarding. Announces that AI-generated SEC filing summaries are being emailed (naming the target address and listing the tracked tickers as chips), with an `Open Inbox` CTA that deep-links to Gmail/Outlook/Yahoo/iCloud or falls back to `mailto:`. Dismissal writes `postOnboardingHeroDismissed` to localStorage; the server-side `isFirstVisit` flag also flips off once `tutorialCompletedAt` is set, so the card does not reappear after navigation. Wired into `app/dashboard/page.tsx` behind `isFirstVisit && initialCompanies.length > 0 && email`. Fixes HIGH #1 in `.gstack/qa-reports/qa-report-onboarding-notification-2026-04-24.md` (new users had no in-app signal that sample summaries were being emailed).
- 12 unit tests in `__tests__/components/dashboard/post-onboarding-hero-card.test.tsx` covering headline personalization, empty-ticker guard, X-dismiss persistence, overflow chip (`+N more` past 6 tickers), and inbox URL resolution for each provider.

## [0.0.24.0] - 2026-04-24

### Changed
- All nine minimalist filing email templates (10-K, 10-Q, 8-K, Form 4, Form 144, DEF 14A, 11-K, S-1, S-3, generic) now lead with the AI-generated headline on line 1. Prior layout rendered logo+date, then ticker line, then body copy — the headline lived inside the body, buried. New order: staleness banner (when applicable) → EmailLeadHeader (logo, date, H1 headline, ticker line) → FormPlusMaterialityBadgeRow (`<form> | <category>` badge + materiality/signal pill) → body. Driven by two new section components (`components/ui/email/templates/sections/EmailLeadHeader.tsx`, `FormPlusMaterialityBadgeRow.tsx`) so rearranging the block never drifts across templates.
- 8-K template drops the standalone `Event` and `Filed` data rows from the body table. Event category moves into the FormPlusMaterialityBadgeRow pill (`8-K | Capital Return`), and the filing date is already rendered by EmailLeadHeader — the duplicate rows were wasted vertical space.
- StalenessBanner now renders ABOVE the EmailLeadHeader, not below it. Stale filings push the date-delay warning to the top of the email where the reader can't miss it; prior position put it under the ticker line and readers scrolled past it.
- PostHog email tags migrated from prefix-encoded strings (e.g. `t-filing_notification`, `u-abc123`) to stable `{name, value}` object form. PostHog now filters by `template`, `userId`, `filingId`, `formType`, `ticker` as first-class properties. Legacy 13D template path in `lib/email/templates.ts` updated to match.

### Added
- `capHeadline(text, maxLen)` in `components/ui/email/design-system.ts` truncates long headlines at word boundaries with ellipsis, so the H1 never wraps past two lines on mobile. Default cap is 90 chars, word-boundary aware.
- `ensureTickerPrefix(ticker, symbol)` in the same file guarantees the ticker line starts with the `$TICKER` prefix (e.g. `$AAPL · Apple Inc.`). Idempotent — running twice doesn't double-prefix.
- `DEFAULT_FILING_CATEGORY_MAP` default-labels each filing type for the `<form> | <category>` badge (e.g. `S-1 | IPO`, `Form 144 | Insider Sale Notice`). Overridable per-filing via the `filingCategory` prop.
- Resend webhook handler in `app/api/webhook/route.ts` ingests `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained` events. Signature is verified via `svix`; events are mapped to PostHog with `distinct_id` derived from the `userId` tag so email engagement joins the same user timeline as app events. Missing `userId` tag logs a warning rather than crashing (backfill path). New analytics event types added to `lib/analytics/events.ts`.
- Six new test files: `__tests__/email/email-lead-header.test.tsx`, `headline-cap.test.ts`, `headline-ticker-prefix.test.ts`, `template-layout-order.test.tsx`, `resend-tag-schema.test.ts`, `__tests__/api/webhook-resend.test.ts`. The layout-order test is the important one — it renders every minimalist template with realistic AI-headline input and asserts (via `container.innerHTML.indexOf()`) that the order is logo → headline → ticker line → badge row → body. Pill text splits across DOM nodes, so index-of on serialized HTML is the only reliable check.

### Fixed
- Duplicate-signal suppression in FormPlusMaterialityBadgeRow: if the form-type badge fully covers the signal (e.g. `S-1 | IPO` + `IPO FILING`), the redundant signal pill is omitted. Prevents two badges saying the same thing on IPO/acquisition filings.
## [0.0.23.3] - 2026-04-24

### Changed
- `components/landing/sections-v2/faq-section-v2.tsx` — FAQ copy rewrite on the "Before you start your trial" section. Trial answer leads with "7-day trial at $0" and what the trial includes (unlimited tracking, first-priority processing, all filing types). Pro-vs-Max answer drops the monthly-price mirror (pricing cards own that number) and focuses on audience fit: Pro = focused investors on a watchlist up to `PRO.tickerLimit`, Max = analysts/research teams covering large universes. Filings answer enumerates the full EDGAR coverage (annual/quarterly/events/insider/ownership/proxy/registration) backed by `lib/user/preference-types.ts`, closing "If EDGAR publishes it, we cover it." Speed answer drops the now-defunct free-tier reference.
- FAQ accordion defaults to fully collapsed. Previously opened item 1 via `defaultValue={faqItems[0].id}` — removed so the section reads as a scan-first list.
- Header subtitle ("Answers to the questions most prospects ask before signing up.") removed. Section heading carries the intent on its own.

### Removed
- Three FAQ items: "How many companies can I track?" (owned by pricing cards), "Is this investment advice?" (footer disclaimer owns this independently — see `__tests__/components/landing/footer-section-v2.test.tsx:32`), "How do you handle my data?" (not the question prospects actually ask on a paid trial flow). `faqItems` reduced from 9 → 6.

### Notes
- `components/structured-data.tsx` consumes `faqItems` directly for FAQPage JSON-LD — no edit needed; structured data auto-reflects the 6-item list.
- `__tests__/landing/faq-section-v2.test.tsx` updated: trigger count 9 → 6, "first item open" assertion replaced with all-collapsed loop, new regression guards for (1) Pro ticker limit sourced from `SUBSCRIPTION_PLANS.PRO.tickerLimit`, (2) no monthly-price leakage into FAQ copy, (3) removed IDs stay removed, (4) `answer`/`answerPlain` stay 1:1 for all-string items.

## [0.0.23.2] - 2026-04-24

### Added
- `.context/wiki/positioning-vs-seeking-alpha.md` — competitive positioning doc answering "why this, not Seeking Alpha?" in one place. Honest framing (where Seeking Alpha wins vs where tldrSEC wins), price-comparison table, and the market-gap thesis. Single source of truth for landing-FAQ updates and cold-outreach follow-ups.
- `docs/outreach/dm-templates.md` — T1 (Reddit reply), T2 (Twitter), T3 (LinkedIn) cold-outreach templates plus one 4-day follow-up template. Pain-language bank pulled verbatim from `.claude/analysis/user-pain-points-and-quotes.md` ("patience-testing, eye-glazing", "300 pages", "days, if not weeks"). UTM URLs for each channel tag visits via existing `lib/analytics/page-tracking.ts` capture.

### Changed
- `.gitignore` now excludes `.claude/outreach/` so a workspace-local `prospect-list.md` (contact handles, send history) stays off GitHub.

## [0.0.23.1] - 2026-04-24

### Added
- Event-type-aware structured rendering for 8-K summaries. Item 2.03 (debt issuance) now emits a `tranches[]` array (amountDisplay, currency, coupon, yield, maturity, spread) that renders as a tranche table grouped by currency with a totals line. Item 1.01 / 2.01 (M&A and material contracts) emits a `dealTerms` object (counterparty, dealValue, consideration, closeDate, approvals[], rationale) that renders as a deal-terms card. Falls back cleanly to the existing prose block when structured fields are absent, so cached summaries keep rendering.
- Zod validation on LLM output at save time in `services/filing/summaryGenerationService.ts`. Bad `tranches`/`dealTerms` shapes are stripped with a structured `logger.warn` payload rather than persisted to the DB or surfaced to the reader.
- `itemNumbers` schema field with a prose-parse fallback regex so the structured renderer can gate strictly on the filing's 8-K item, not on heuristics over the subject line.
- New email template sections under `components/ui/email/templates/sections/`: `TranchesList.tsx`, `DealTermsCard.tsx`, `TotalsLine.tsx`. JSX-only interpolation — no `dangerouslySetInnerHTML`.
- Passing tests across 13 test files covering tranche rendering (single/multi-currency, malformed amounts, XSS payloads), deal-terms rendering, extractor validation, legacy `counterpartyContext` backwards-compat, item-number regex variants, subject-line terseness, and end-to-end integration. 4 live-LLM eval tests gated on `RUN_LIVE_LLM_EVALS=true`.
- `__tests__/email/form4-watch-for.test.tsx` with 4 tests: award-only filing suppresses the section, `vestingDetails` renders only the vesting bullet, transactions-without-vesting suppresses the section, and S-3 `Use of proceeds:` rendering regression guard.

### Changed
- Subject line targeting for Item 2.03 and 1.01: drops filler verbs ("Issued", "Announced"); leads with ticker + materiality; hard cap ≤55 chars.
- Consolidated three HTML-escapers in `components/ui/email/design-system.ts` into a single `escapeHtml` helper that also escapes `"` and `'`, closing an attribute-injection gap.
- Removed `counterpartyContext` prompt field; its rationale now lives in `dealTerms.rationale`.
- Removed `Record<string, unknown>` cast in `8k-minimalist-template.tsx` — structured fields flow through typed props.
- Form 4 insider-transaction emails no longer render a generic "Watch for: SEC transaction code: Grant/Award, Option Exercise, Tax Withholding" bullet. Those labels were hardcoded from the transaction-code letter (A/M/F) via `getTransactionCodeDescription()`, describing what already happened instead of anything forward-looking. Every routine Form 4 was getting the same uninformative line.
- `Watch for:` section on Form 4 now renders only the `vestingDetails` bullet when the AI extracts a vesting schedule. If absent, the entire section is suppressed via the existing `watchFor.length > 0` guard. No empty headers, no orphaned bullets.
- Transaction-code descriptions still render in the data-snapshot table via `getTransactionCodeDescription()` in `components/ui/email/design-system.ts:463` — this change only removes the duplicated, non-actionable mention in `Watch for:`.

### Removed
- Dead `codeDescription` field on the internal `AggregatedTransaction` interface in `form4-minimalist-template.tsx` — no consumers after the watchFor deletion. Removed the `@deprecated` wrapper `getTransactionCodeDescription` that re-exported the canonical function with no additional logic.

### Fixed
- `.nvmrc` bumped to `20.20.2`. Cloudflare Workers Builds runner dropped support for the old `20.11.0` pin (Jan 2024), causing CI to fail at `Installing nodejs 20.11.0 → Failed: error occurred while installing tools or dependencies` across all branches and main.

## [0.0.23.0] - 2026-04-22

### Added
- Landing page FAQ section below pricing, answering the nine questions most likely to block a trial sign-up: free trial terms, cancel flow, accuracy, Pro vs Max tiers, which filing types are covered, speed, which companies are tracked, investment-advice disclaimer, and data sourcing. Uses shadcn Accordion (single-expand, collapsible, item 1 open by default) so the section stays compact on first paint.
- FAQPage JSON-LD schema emitted on the landing page so Google can render FAQ rich results. Questions and plaintext answers are shared between the rendered accordion and the structured data so they never drift.
- Jest regression tests covering the FAQ render, accordion interaction, and guards against `SUBSCRIPTION_PLANS.PRO.monthlyPrice` / `.MAX.monthlyPrice` / `PRO.tickerLimit` drifting out of sync with the copy.

### Changed
- Pricing/FAQ answer text pulls live from `SUBSCRIPTION_PLANS` instead of hardcoding dollar amounts, so plan-config changes propagate automatically.

## [0.0.22.7] - 2026-04-23

### Added
- `ResendClient.prepareEmailParams` now auto-injects `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers on every single-recipient transactional send (RFC 8058, Gmail/Yahoo Feb-2024 bulk-sender requirement). Caller-supplied headers win on collision, so campaign routes that set their own unsubscribe token continue to work. Bulk sends (array `to`) skip auto-injection because per-recipient tokens cannot be derived from a shared envelope.
- `EmailMessage.headers?: Record<string, string>` field on the shared email type so callers can pass custom headers through the shared send path.
- `lib/email/__tests__/frequency-gate-regression.test.ts`: six SDK-only regression tests proving `NotificationService.getImmediateNotificationRecipients()` filters at the Prisma query level with `emailFrequency equals IMMEDIATE`. Guards against a class of regressions where NONE/DAILY users leak into the immediate cron fan-out.

### Changed
- Header merge logic prefers caller-supplied headers over auto-injected defaults, preserving existing campaign-side unsubscribe flows while closing the gap for transactional sends that had no unsubscribe header at all.

## [0.0.22.6] - 2026-04-23

### Changed
- Form 4 email template styling refresh: transaction value cells now render in near-black (`#111827`) instead of inheriting the per-transaction red/green that made the dollar amount the loudest element on the page. The colored signal moves to the `(% change)` parenthetical only.
- Holdings row is segmented for scannability: pre-stake in muted gray (`#6B7280`), an NBSP-padded right arrow, post-stake in near-black, and `(% change)` colored only when non-zero. Arrow always points right (pre → post), with NBSPs around the glyph instead of inline span padding so the Outlook Word renderer doesn't collapse spacing.
- Positive-stake-change green darkened from `#16A34A` (3.05:1 contrast, fails WCAG AA on body text) to `#15803D` (5.46:1, passes AA). Negative stays at `#DC2626`.
- ISO `YYYY-MM-DD` dates in summary body copy reformat to `DD MMM YYYY` (e.g. `2026-04-20` → `20 Apr 2026`). Calendar-invalid dates (`2026-02-30`, `2026-04-31`) and hyphenated identifiers (`ID-2026-04-20-001`) are left untouched via Date.UTC round-trip validation and lookbehind/lookahead anchors.

### Added
- `formatDatesInText` helper in `components/ui/email/design-system.ts` with full unit coverage for valid dates, multi-date strings, calendar invalids, leap-year edges, and hyphenated identifiers.
- `__tests__/email/form4-summary-styling.test.tsx`: render-level coverage for transaction value color, holdings segmentation, percentage color/sign rendering, zero-change suppression, and date reformatting.

## [0.0.22.5] - 2026-04-21

### Fixed
- Form 4 "Holdings" row now deterministically reflects post-transaction Common Stock Direct balance (Table I Column 5) instead of sometimes picking a derivative RSU row from the LLM's array. Observed incident: AAPL Parekh 2026-04-15 displayed 15,331 (RSU row) instead of 14,900 (Common Stock Direct). New five-tier precedence in `lib/ai/utils/derive-stake.ts`: authoritative `postTransactionCommonShares` LLM field → Common Stock + Direct filtered derivation → any-SOF fallback → LLM legacy string → narrative regex. `isDirect()` now requires explicit `D` ownership form instead of defaulting permissively.
- Dashboard filing-display now re-runs the Form 4 normalizer at read time, so historical summaries with the old wrong `newStake` value get the corrected display automatically. No data migration needed.

### Added
- Authoritative `postTransactionCommonShares` field in the unified Form 4 prompt schema. LLM is instructed to populate it from Table I Column 5 of the last-dated Common Stock Direct row.
- `detectNewStakeNarrativeMismatch` flags >5% disagreement between the derived number and the narrative. Skips hedge-word narratives ("roughly", "approximately", "~") and zero-narrative false positives. Disagreements flip `dataQuality: 'degraded'` and emit a structured `form4_newStake_narrative_mismatch` log for observability. User-facing banner intentionally suppressed (decision 2026-04-20).
- 14 new regression tests in `__tests__/email/form4-field-normalizer.test.ts` covering the Parekh fixture, dual-class issuers, Direct-vs-Indirect filtering, derivative-only filings, date-sort precedence, zero-balance holdings, and narrative mismatch edge cases.

## [0.0.22.4] - 2026-04-19

### Changed
- Trial-ended email now leads with the tldrSEC logo and uses the brand gradient on the upgrade button, matching the landing page. Removed the "$199/month, 25 tickers" pricing line so the email focuses on the action.

## [0.0.22.3] - 2026-04-19

### Changed
- Landing hero now shows a single primary CTA. The secondary "View Pricing" outline button was removed to reduce choice friction; pricing is still reachable via the navbar and footer links.

## [0.0.22.2] - 2026-04-19

### Fixed
- Hero section headline now has breathing room from the top of the viewport on first paint. Previously sat flush against the browser chrome when the page loaded.

## [0.0.22.1] - 2026-04-18

### Fixed
- `useAnalytics` hook no longer calls Clerk's `useUser()` at the hook level. That broke SSG prerender of the landing page (PricingSectionV2 and HeroSectionV2 call the hook, and the landing page is built without a ClerkProvider). `identifyUser` now takes user info as an argument so callers with Clerk context pass it in themselves.
- Unescaped apostrophes in `/companies/[ticker]` and `/filings/[type]` pages escaped to `&apos;` per `react/no-unescaped-entities`.
- `__tests__/app/subscribe/page.test.tsx` now mocks `useAnalytics` (subscribe page imports it for `checkout_initiated` tracking) and the `next/navigation` mock exposes `usePathname` + `searchParams.entries()` that the hook uses.

## [0.0.22.0] - 2026-04-18

### Added
- Two new indexable content hierarchies for organic search acquisition: a /companies directory grouped by sector and 15 per-company hubs (e.g., /companies/NVDA) with recent filings, filing-type breakdown, and Corporation JSON-LD.
- 8 educational filing-type guide pages at /filings/[type] (10-K, 10-Q, 8-K, Form 4, Form 144, DEF 14A, S-1, S-3) explaining each form, who files it, and why it matters, with live examples pulled from the database.
- Internal linking on /s/ preview pages now cross-links to the matching company hub and filing-type guide, plus a "More {ticker} filings" list to distribute crawl budget.
- Server-side PostHog event capture for the real checkout funnel ground truth: checkout_completed, trial_started, and trial_converted fire from the Stripe webhook, flushed via Vercel's waitUntil so events survive serverless termination.
- Client-side structured events for the landing-to-paid funnel that autocapture can't infer: landing_cta_click, pricing_plan_selected, onboarding_step_completed/completed (with duration and counts), checkout_initiated, summary_viewed, and filing_chat_message_sent.
- Shared event taxonomy (lib/analytics/events.ts) used by both client and server via a discriminated union, so a rename on one side updates the other.
- Traffic source classification (organic / social / direct / email / internal) stamped as a super-property on every PostHog event, with 15+ fixture tests covering search engines, social platforms, Google AMP cache, android-app schemes, and email UTMs.
- Hardcoded sector/industry metadata for all 15 tracked companies (lib/seo/company-metadata.ts), used by the company directory and related-companies section.

### Changed
- Sitemap grows from 8 URLs to 16+ with explicit priorities: homepage 1.0, company hubs 0.8, filing-type guides and /companies directory 0.7, /s preview pages 0.6. Growth note in the sitemap for the sub-sitemap index split at 45k URLs.
- PostHog provider now enables session recording globally with aggressive DOM masking (data-sensitive selector convention), person_profiles: 'identified_only' to save quota, and a referrer-derived traffic_source super-property.
- /s/[ticker]/[filingType]/[accession] preview pages now fetch related filings for the same company and the matching filing-type guide slug for internal linking.

## [0.0.21.1] - 2026-04-18

### Changed
- Hero headline rewording: "SEC filings, read in **minutes** instead of **hours**." (dropped the "10 minutes / 10 hours" literals since processing time varies by filing length and the generic phrasing is more honest).
- Pricing card inactive-state CTA ("Upgrade to Pro/Max" on the card the user hasn't selected) now uses a muted treatment: soft gray fill (gray-100), readable dark text, no border. Previously the shadcn default dropped `bg-primary text-primary-foreground` on top of the brand class, making the inactive button render with invisible white text on a white card.
- Pre-footer "Get Started" CTA now routes unauthenticated visitors to the sign-up form first, instead of hitting `/onboarding` and bouncing through a redirect. Aligns with the hero, navbar, and footer CTAs which all send anonymous users to `/sign-up`. Signed-in users continue to be routed to `/onboarding` or `/dashboard` by existing middleware.

### Fixed
- Gradient CTA buttons: added `!important` to the `background:` declaration in `.brand-button-gradient`. Only `color: white !important` was in place, so the linear-gradient was still being overridden by Tailwind's `bg-primary` utility (shadcn's default Button variant), painting solid near-black over the gradient on navbar / hero / bottom / selected-pricing CTAs.

## [0.0.21.0] - 2026-04-18

### Changed
- Landing hero redesigned to a cursor.com-style stacked layout: a bold one-liner headline, two CTAs, trust metrics row, and a large centered Gmail demo widget below. Replaces the cramped 50/50 split that made the demo too small to read.
- New headline copy: "SEC filings, read in 10 minutes instead of 10 hours." with the time comparison phrase in the brand gradient. Subhead names every filing type (10-K, 10-Q, 8-K, Form 4) so visitors understand scope in one scan.
- Email detail drawer widths now scale responsively (88% mobile, 85% tablet, 75% small desktop, 65% large desktop), so the inbox stays visible alongside the detail panel on every screen size instead of being covered.
- Email rows are now keyboard-focusable buttons with visible focus rings, fixing a pre-existing accessibility gap. Escape key closes the drawer and returns focus to the triggering row.

### Added
- Widget skeleton Suspense fallback on the landing page, so visitors on slow connections see something that looks like the real widget instead of a generic spinner during hydration.
- `.brand-hero-display` CSS class for cursor-style headline typography (semibold weight, tighter letter-spacing, 24ch max-width).
- First unit tests for the Gmail inbox hero component (11 tests covering render, keyboard nav, drawer behavior, focus return, responsive classes, and accessibility attributes). This file previously had zero test coverage.
- `prefers-reduced-motion` gate on the email delivery animation: users with reduced-motion enabled see emails fade in instead of dropping from above.

### Fixed
- Mobile detail panel no longer traps users: previously it covered the entire inbox (users had to close it to see other emails). Now the inbox peeks from the left with a WCAG-compliant 44px tap handle.
- Largest Contentful Paint improved by ~700ms on the landing page: the initial 6 email rows now render statically instead of staggering in with opacity:0, which was inflating LCP measurements.
- Removed the dead expand-to-fullscreen mode and two decorative floating orbs from the hero, reducing visual accent conflict in the new centered layout.

## [0.0.20.1] - 2026-04-17

### Changed
- Pricing cards on the landing page now toggle their visual state on hover, not just on click. Hovering one card makes it look selected (blue border, slightly larger) while the other card reverts to unselected (gray border, normal size). The two cards are never both selected or both unselected at the same time, making the comparison clearer at a glance.

## [0.0.20.0] - 2026-04-17

### Fixed
- Health endpoint false-CRITICAL during EDGAR quiet hours (22:15-05:45 ET). Three time-sensitive conditions now suppressed overnight via `isEdgarOpen()`: no completions, cron execution gaps, and empty TickerMonitoring. Real CRITICAL conditions (stuck locks, exhausted retries, invalid job types) remain hot 24/7.
- E2E pipeline recovery test suite pointed at deleted routes (`/api/health/pipeline`, `/api/cron/auto-recover`). Updated to current consolidated routes (`/api/health`, `/api/cron?action=auto-recover`). Test suite was dead since PR #371 route consolidation.

### Added
- `edgarOpen` field in `/api/health` response so monitoring integrations can distinguish quiet-hours from real outages.

## [0.0.19.4] - 2026-04-17

### Fixed
- Dashboard "minutes saved" counter typography too spaced apart. Removed redundant `letterSpacing: 0.02em` from CounterDisplay, changed DigitRoller width from `minWidth: 0.6em` to `width: 1ch` for exact tabular-nums fit, tightened container gap from `gap-3` to `gap-2`.
- Hardcoded "Current waitlist count: X investors" screen reader text in CounterDisplay now configurable via `srLabel` prop. Dashboard passes contextual SR text; waitlist page unchanged.
- Nested `role="status"` live regions between dashboard container and CounterDisplay caused double screen reader announcements. Added `suppressLiveRegion` prop to CounterDisplay.
- Inconsistent CTA button colors on landing page. Navbar, pricing cards, and pre-footer CTA now use the same blue-to-purple gradient as the hero section instead of solid blue.
- CTA button text now renders white regardless of theme. The shadcn Button default variant applied `text-primary-foreground` which resolved to near-black in dark mode, fighting the brand button CSS. Added `text-white` Tailwind class and `!important` to both `brand-button-primary` and `brand-button-gradient`.

### Added
- Animated "minutes saved" counter on dashboard. First visit animates from 0 to actual value; subsequent visits animate only the delta. Uses localStorage persistence, setTimeout-based stepping (500ms intervals matching DigitRoller's animation cadence), and easeOutQuad easing.
- NaN/undefined guard on `totalTimeSavedMinutes` prevents the counter from displaying fallback value "147" if upstream data is malformed.
- Tests for CounterDisplay props (`srLabel`, `suppressLiveRegion`) and `useAnimatedMinutes` hook (first visit, return visit, target=0, cleanup, corrupt localStorage).

## [0.0.19.3] - 2026-04-16

### Fixed
- Garbled email body in 5 minimalist templates (Form 4, Form 144, S-1, S-3, Generic) when AI-provided `headline` did not match the first sentence of `summaryText`. The code unconditionally sliced `summaryText.slice(headline.length)`, chopping an arbitrary number of characters off the remaining summary. Now guarded with `summaryText.startsWith(headline)` — matches the pattern already used in the 11-K template.
- Weak quality gate test in `response-parser-normalization.test.ts` that only checked static schema metadata. Replaced with 8 new tests that actually call `parseResponse` with ticker-prefixed, form-type-prefixed, too-short, over-length, and generic-pattern headlines/emailSubjects, verifying the quality gate normalizes or drops them at runtime.

## [0.0.19.2] - 2026-04-16

### Added
- `headline` and `emailSubject` fields added to AI schema for ALL filing types via `BASE_SCHEMA_PROPERTIES`. Every form type (10-K, 10-Q, Form 4, DEF 14A, Form 144, S-1, S-3, 11-K, Generic) now gets AI-generated headlines and subject lines.
- Headline quality gate in `response-parser.ts`: strips ticker/form-type prefixes, rejects generic headlines (< 20 chars or starting with "this", "the company"), forcing templates to use existing fallback logic.
- `emailSubject` quality gate: rejects subjects < 15 chars.
- Zod validation for `headline` (max 120 chars) and `emailSubject` (max 100 chars) in all schema validators.
- 18 new tests: schema coverage for headline/emailSubject across all 15 form types, headline normalization quality gate.

### Changed
- All 9 non-8-K email templates now prefer AI-provided `headline` over regex-parsed prose, with zero-risk fallback to existing extraction logic.
- `subject-service.ts` uses AI `emailSubject` (30-120 chars) as first priority for all form types, falling back to existing smart extraction.

## [0.0.19.1] - 2026-04-16

### Changed
- Summary detail page (`/summary/[id]`) now shows only the formatted view. Removed the "Raw Text" and "JSON" tabs that exposed internal data representations to end users.
- Removed the visible card border on summary pages so the layout matches the borderless dashboard redesign.
- Removed double padding around summary content (the outer `p-6` wrapper was duplicating the card's internal padding).

### Removed
- 3 npm packages no longer needed: `react-syntax-highlighter`, `react-json-tree`, `react-copy-to-clipboard` (and their `@types/` counterparts). Smaller bundle.
- ~310 lines of dead code from `SummaryContent` (search handlers, copy/download buttons, JSON theme config, refs that only served the removed tabs).

### Fixed
- Test coverage gaps on the summary fallback path: added regression tests for XSS sanitization and invalid-JSON fallback rendering.
- Stale references to uninstalled packages in `jest.config.mjs` cleaned up.

## [0.0.19.0] - 2026-04-16

### Changed
- Dashboard loads progressively with React Suspense streaming. The page shell, tab structure, and tickers panel render in under 1 second. Stats and activity feed stream in independently as their database queries resolve. Previously everything blocked on a sequential data waterfall (4-5 seconds before any content appeared).
- Dashboard decomposed from a single 597-line client component into focused pieces: `TickersPanel` (ticker CRUD), `DashboardOnboarding` (confetti, subscription toasts), and async server components for stats and activity. Each section has its own error boundary so one failure doesn't crash the whole page.
- Summaries list page (`/dashboard/summaries`) now fetches real user data server-side instead of returning hardcoded mock summaries. Data streams via Suspense with a skeleton fallback.

### Added
- `SectionErrorBoundary` component for per-section error isolation on the dashboard.
- `forceMount` on Radix Tabs content panels to prevent hydration mismatches with streamed Suspense content.

## [0.0.18.0] - 2026-04-16

### Fixed
- Pricing card mobile highlight: tapping a different plan card now switches the blue highlight correctly on both the landing page and /subscribe route.
- Removed `forceHighlight` prop that permanently locked the pre-selected card's highlight, preventing users from switching plans on /subscribe.
- Wrapped `.brand-card:hover` CSS in `@media (hover: hover)` to prevent sticky hover states on mobile touch devices.

### Changed
- Replaced email input form in CTA section below pricing with a single "Get Started" button linking to /onboarding, reducing signup friction.

## [0.0.17.1] - 2026-04-16

### Fixed
- Mobile hamburger menu now opens with a visible background instead of just borders.
- All 384 theme color usages across 98 files now render correctly (were producing invalid `hsl(oklch(...))` CSS).
- Dark mode borders and inputs use solid composited colors instead of broken semi-transparent oklch values.
- Fintech brand color tokens unified to HSL format, matching the rest of the design system.

### Added
- Regression test guard preventing future shadcn CLI updates from regenerating oklch-format CSS variables.

## [0.0.17.0] - 2026-04-15

### Changed
- Dashboard redesign: removed bordered Card wrappers from activity feed, tickers table, and stats section for a cleaner, content-first layout.
- Time saved metric now uses animated digit-rolling counter (reuses waitlist page CounterDisplay component) instead of a static bordered card.
- Removed unused "summary count this month" Prisma query from dashboard page load, reducing server-side queries by one.

### Removed
- `EmailStatsWidget` component (replaced by inline animated counter).
- `HoursSavedWidget` component (dead code, was never imported).

## [0.0.16.0] - 2026-04-15

### Fixed
- 8-K email badge redundancy: removed duplicate category badge from template body. Header now shows "8-K | {eventType}" (e.g., "8-K | Acquisition") instead of generic "Current Report".
- 8-K headline truncation: AI now returns a structured `headline` field instead of the template regex-parsing it from prose. Fallback chain: AI headline, eventType, signal verdict.
- 8-K body text starting mid-sentence: `remainingSummary` now uses proper sentence boundary detection, decoupled from headline derivation.
- 8-K email layout reordered: signal badge, headline, event/filed metadata, why-it-matters, story. Metadata no longer buried in the middle.
- 8-K subject lines for long summaries: uses AI `emailSubject` field first, falls back to word-boundary truncation instead of generic "TICKER 8-K: EventType".
- "Why it matters" section drops boilerplate signal description when specific financial impact is available.

### Added
- Shared web search enrichment module (`web-search-context.ts`) with `EnrichmentProvider` interface and `AbortSignal` timeout budget (45s total for all providers).
- Director governance web search: 8-K filings with Item 5.02/5.07 now get web-sourced context about departing/appointed directors and why the change matters.
- `headline`, `emailSubject`, and `governanceContext` fields added to 8-K AI schema.
- 32 new tests: enrichment module (23), sentence boundary detection (9).

## [0.0.15.1] - 2026-04-15

### Changed
- Engineering principles in CLAUDE.md expanded with Karpathy-inspired guidelines. Added "Think Before Coding" (surface assumptions before implementing) and "Goal-Driven Execution" (transform tasks into verifiable goals). Strengthened "Simplicity First" and replaced "Minimal Impact" with specific "Surgical Changes" rules.

## [0.0.15.0] - 2026-04-15

### Added
- Counterparty context for M&A 8-K filings. When an 8-K involves an acquisition or merger, the system now web-searches for who the counterparty is, what they do, and why the deal matters to investors. The context gets woven into the summary automatically.
- New `counterpartyContext` field in the 8-K JSON schema for structured counterparty data.
- 25 unit tests covering M&A detection, web search, and graceful error handling.

## [0.0.14.1] - 2026-04-14

### Changed
- Knowledge base moved from empty `.context/wiki/` to Obsidian vault at `/Users/wilf/Software/Obsidian/tldrsec-ai/`. The vault is the single source of truth for domain knowledge, product decisions, and research.
- All 9 Claude Code commands (`wiki-ingest`, `wiki-lint`, `research_codebase`, `create_plan`, `implement_plan`, `review_plan`, `push-pr-review-merge`, `commit`) now reference the Obsidian vault instead of `.context/` files that didn't exist.
- Context profiles in CLAUDE.md updated to load vault wiki pages (product, SEC, companies, etc.) instead of stale `.context/` references.

### Added
- `/wiki-sync` command for post-ship knowledge distillation into the Obsidian vault wiki.
- Recursive wiki improvement workflow: after each dev cycle, distill what was learned into vault pages that compound over time.
- Skill routing entries for `/wiki-sync`, `/wiki-ingest`, and `/wiki-lint`.

## [0.0.14.0] - 2026-04-13

### Changed
- Dashboard loads instantly on return navigation. Removed `force-dynamic` from layout so Next.js Router Cache kicks in.
- Summary queries fetch 15 items (down from 50) and skip the `summaryText` column entirely, cutting payload size and DB load.
- Stripe subscription reconciliation moved to a background client-side call instead of blocking the server render. Users who just paid see their tier update without a 1-2 second spinner.

### Added
- Database index on `Summary(importance, filingDate)` for the featured summaries query used by new users.
- IDOR protection on checkout verification endpoint: validates session email matches authenticated user.
- Plan type validation: only `PRO` and `MAX` are accepted from Stripe metadata, preventing arbitrary tier injection.
- Stripe reconciliation throttled to once per 5 minutes via sessionStorage to avoid API rate limits.

### Fixed
- Featured summaries query no longer filters on `summaryText: { not: '' }` which defeated index usage.
- Dead code branch in `activity-feed.tsx` preview text function.

## [0.0.13.1] - 2026-04-13

### Fixed
- Max plan CTA button now highlights blue with white text when hovering over the card, matching the card border highlight behavior.

## [0.0.13.0] - 2026-04-13

### Changed
- All SEC filing email templates redesigned from card-heavy dashboard layout to Axios Smart Brevity narrative style. Signal/importance badge is now the first element users see, followed by a bold lead sentence, "Why it matters" prose, compact data snapshot rows, and "Watch for" bullets.
- Badge colors muted across all templates. Green positive and yellow high-importance badges replaced with subtle 12% opacity backgrounds that don't clash with white email backgrounds.
- EmailHeader simplified: removed competing h1 headline, replaced with ticker/company meta line. Lead sentence in template body is now the dominant first read.
- EmailFooter always shows "Manage preferences through your dashboard" link, hardcoded to `https://tldrsec.app/dashboard/settings`. Previously conditional and broken when `NEXT_PUBLIC_APP_URL` was empty.
- Dashboard stats widget shows "Time Saved" metric calculated from token usage across all summaries, replacing the generic "Email Delivery" header.
- Activity feed header renamed from "Sent to your inbox" to "Filing Summaries" with FileText icon.
- Tickers tab and activity feed containers use Shadcn Card components instead of custom styled divs.
- Tickers table page size reduced from 10 to 8 rows to eliminate vertical overflow on the Tickers tab.

### Removed
- Redundant "14 tickers / FREE plan" info box from dashboard stats row. Users see this on the Tickers tab.

### Fixed
- Broken unsubscribe URL across all 10 email templates. `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/settings` produced `http://dashboard/settings` in email clients. Now hardcoded to correct URL.
- 8-K and Form 144 templates now include preferences link in footer (previously missing, CAN-SPAM compliance issue).
- Bare `<td>` elements in 10 templates replaced with `<div>` for email client compatibility (Outlook/Gmail strip bare `<td>` outside `<tr>` context).
- `borderBottom` styles moved from `<tr>` to `<td>` elements across all data tables for email client rendering compatibility.
- Activity feed date group headings ("Today", "Earlier") now have proper left padding matching the feed cards.

### Added
- `BadgeColors` muted palette in design system (high, moderate, low, neutral, positive, negative, mixed, trust, award).
- `EmailStyles` Smart Brevity primitives: pillBadge, categoryBadge, leadSentence, whyItMatters, thinDivider, prose, dataLabel, dataValue, watchForHeader.
- Preheader text for inbox preview added to all filing types (previously only Form 4 had it).
- DEF 14A, 11-K, S-1, S-3 added to production template registry (`lib/email/templates.ts`).
- Template registry (`components/email/templates/template-registry.ts`) updated to use minimalist versions of DEF 14A and 11-K.

## [0.0.12.1] - 2026-04-13

### Changed
- CLAUDE.md reduced from 852 to 146 lines. Six verbose sections extracted to `.context/` wiki files that agents load on-demand via context profiles.
- All slash commands (`/create_plan`, `/implement_plan`, `/review_plan`, `/commit`, `/push-pr-review-merge`, `/research_codebase`) now include context profile directives so agents read wiki pages before exploring raw source files.
- Skill-to-Profile Mapping added to CLAUDE.md so gstack skills (`/autoplan`, `/review`, `/ship`, `/investigate`) load only the context their workflow stage needs.

### Added
- `/wiki-ingest` command for creating and updating `.context/wiki/` pages from source files.
- `/wiki-lint` command for auditing wiki health and flagging stale pages.

## [0.0.12.0] - 2026-04-13

### Changed
- Pricing card CTA buttons render instantly with "View Plans" default text, eliminating ~7500ms skeleton wait caused by Clerk JS loading and sequential API queries.
- Landing navbar renders immediately instead of returning null until Clerk auth loads.
- Subscription API (`/api/user?type=subscription`) parallelizes DB queries and eliminates a duplicate user lookup, reducing response time from ~2-4s to ~300-500ms.
- Stripe reconciliation moved from blocking GET handler to fire-and-forget background execution.
- Landing page no longer uses `force-dynamic`, enabling static HTML caching.

### Fixed
- TrialService refactored to eliminate redundant database query. `checkTrialStatusFromUser()` is now a pure function called by both the API route and the existing `checkTrialStatus()` method.

## [0.0.11.0] - 2026-04-12

### Changed
- Dashboard redesigned as email delivery management center. Activity feed now shows "Sent to your inbox" with per-filing "Emailed" indicators, matching the landing page's Gmail inbox visual style.
- Filing type badges now use consistent colors across dashboard and landing page (10-K purple, 10-Q blue, 8-K orange, Form 4 green).
- Summary preview text trimmed to 1 line everywhere (was 2-3 lines on desktop).
- Stats section replaced: "Time Saved" widget becomes "Email Delivery" showing monthly and total email counts.
- Dashboard layout simplified with brand design tokens throughout (colors, borders, shadows).
- Featured summaries for new users labeled "Example Filing Summaries" instead of "Featured Filings".
- Tab renamed from "Activity" to "Emails" to reinforce the email-first model.
- Renamed all `landing-*` CSS classes and variables to `brand-*` for semantic correctness across the codebase.
- Pricing cards: restored keyboard accessibility (tabIndex, aria-selected, onKeyDown, onFocus/onBlur).

### Added
- framer-motion Jest mock (`__mocks__/framer-motion.tsx`) for test compatibility with dashboard animations.
- `:disabled` styles for `brand-button-primary` and `brand-button-gradient` CSS classes.
- `[role="tablist"]` scoped CSS selector for active tab pill styling (prevents unintended style leaks).

### Removed
- Duplicate `ActivitySummary` type definition in dashboard-client (now imported from activity-feed).
- `ScrollArea` wrapper on activity feed (natural page scroll with "Show more" button instead).
- `DashboardHeader` component usage (replaced with sr-only h1 for accessibility).

## [0.0.10.0] - 2026-04-12

### Fixed
- Unauthenticated users hitting /dashboard, /summary, or /filing routes now redirect to /sign-in at the middleware level via Clerk v6 `auth.protect()`, instead of relying solely on page-level guards.
- `useSubscription` hook no longer crashes when ClerkProvider is absent (dev environments without Clerk keys). Follows the same try/catch pattern as AuthProvider.
- Dashboard errors now show a recovery UI via Next.js `error.tsx` instead of a white screen. Auth-related errors auto-redirect to sign-in.

### Removed
- Dead `publicRoutes` config from middleware. This was a Clerk v4 API silently ignored by Clerk v6, giving a false sense of security.

## [0.0.9.1] - 2026-04-12

### Changed
- Summary pages load faster: eliminated redundant auth call and duplicate database query from the navigation path.
- Clicking a summary from the dashboard now shows an instant skeleton loading state instead of a blank screen.
- Summary page and dashboard content fade in smoothly (200ms ease-out) after loading, with `prefers-reduced-motion` support.

### Fixed
- Orphaned ticker references in summaries now produce a clear error log and audit trail entry instead of a misleading TypeError.

## [0.0.9.0] - 2026-04-12

### Fixed
- Upgrade to Pro/Max buttons on /subscribe now work. Previously returned 500 due to Stripe SDK v18 API version mismatch (subscription period fields moved from Subscription to SubscriptionItem in the basil API).
- Stripe webhook handlers for subscription creation and updates now correctly read billing period dates.
- Centralized subscription period extraction into a shared helper with safe fallbacks.

## [0.0.8.0] - 2026-04-12

### Changed
- Subscribe page now uses the same PricingCard component as the landing page, so hover animations, border highlights, and CTA button styles are identical across both routes.
- Pricing cards on /subscribe now scale up on hover (was: lift up), show shared blue border tracking (was: static ring on PRO), and upgrade the CTA button to filled blue on hover (was: always outline).
- "Current Plan" button on /subscribe now shows green background with checkmark icon, matching the landing page style.
- "Popular" badge position on /subscribe moved from centered-above-card to top-right corner, matching the landing page.
- Removed duplicate plan name label on /subscribe pricing cards.

## [0.0.7.3] - 2026-04-12

### Fixed
- Email logo dark mode: previous fix shipped an RGB PNG (no alpha channel). Now ships RGBA with verified transparency. Added regression test asserting PNG color type byte = 6 (RGBA) to prevent recurrence.

### Changed
- Billing and subscription pages now load instantly via route prefetching from the dashboard header.
- "Manage Payment Methods" button shows a spinner while the Stripe portal loads, with a 10-second timeout.
- Billing and subscribe pages fade in smoothly instead of popping in after data loads.
- Stripe portal button recovers correctly when returning via browser back button (bfcache).

## [0.0.7.2] - 2026-04-11

### Changed
- Pricing cards: clicking a card now keeps it highlighted until the other card is clicked. PRO card starts selected on mount.
- Pricing cards: added keyboard support (Enter/Space) and `aria-selected` for accessibility.
- Pricing cards: CTA button click no longer bubbles to card selection handler.

## [0.0.7.1] - 2026-04-11

### Fixed
- Form 4 emails: award-only filings (stock grants, RSU vesting) no longer show misleading percentage change badges. Previously, a compensation event like "+33.6%" looked identical to a market buy signal. Now shows "Stock Award" neutral signal with purple badge.
- Form 4 emails: award-only filings show "Current Holdings" instead of "Ownership Impact" with a before/after arrow flow that implied a market transaction.
- Email logo no longer shows white rectangle in Gmail dark mode. Replaced with transparent-background PNG using all-blue wordmark.
- Legacy email template header changed from blue to white background, matching the minimalist design system.

## [0.0.7.0] - 2026-04-10

### Changed
- Onboarding: removed "x sectors selected" counter text (border color already communicates selection).
- Onboarding: sector grid last row (Materials, Utilities, Real Estate) now centers instead of left-aligning.
- Onboarding: company step loads instantly from static data instead of 3 API calls on mount.
- Onboarding: removed paste tickers input field.
- Onboarding: profile questions now appear one at a time with slide transition between role and AUM.
- Onboarding: "Other" role option transforms into inline text input for custom role entry.
- Onboarding: reduced AUM brackets from 8 to 5 options (capped at $5M+).
- Onboarding: progress sidebar uses brand blue (#0079F2) instead of generic black/white.
- Onboarding: progress bar positioned closer to content card, content centered in viewport.
- Onboarding: Enter key advances between profile questions.
- Onboarding: Back buttons use ghost variant (no border).
- Onboarding: company and profile steps share fixed card height so footer buttons stay in place.

### Added
- Company logo domain mappings expanded from 65 to ~200 entries covering all popular companies.

### Fixed
- Onboarding: auth error screen auto-redirects to sign-in after 3 seconds instead of showing dead-end buttons.
- Onboarding: optimistic cookie set before server action prevents redirect loops on auth failure.
- Onboarding: submittingRef reset in catch block allows retry after failure.
- Onboarding: sector filter pills stay visible during company search (prevents layout shift).
- Onboarding: setTimeout in error render moved to useEffect to prevent stacking on re-renders.

### Removed
- Removed "Investment Analyst" and "C-Suite Executive" from profile role options.
- Removed "optional" label from AUM question, "This takes 30 seconds" from profile intro.

## [0.0.6.5] - 2026-04-11

### Fixed
- Form 4 email summaries now show the full AI-generated summary instead of only the first sentence. Previously, multi-sentence summaries like equity award analyses were truncated to a single headline.
- Plain text email fallbacks no longer truncate summaries at 300 characters.

## [0.0.6.4] - 2026-04-10

### Changed
- Google OAuth now forces account picker via `oidcPrompt: 'select_account'`, so users with multiple Gmail accounts can choose which to sign in with.
- Removed Apple and Facebook social login buttons from sign-in and sign-up pages.
- Sign-up Google OAuth redirects to `/onboarding` instead of `/dashboard` for new users.
- Added double-click protection on Google sign-in/sign-up buttons.
- Google button on sign-up page is now visible immediately when Clerk SDK loads, independent of the form skeleton.

## [0.0.6.3] - 2026-04-10

### Changed
- Landing page hero now shows "All types of SEC filings" instead of "5 types" to accurately reflect coverage of 15+ form types.
- Removed generic "AI-Powered SEC Intelligence" badge from hero section for cleaner visual hierarchy.
- Footer tagline updated to "AI-powered SEC intelligence for modern investors. Save hours every week with summaries delivered straight to your inbox."
- Footer disclaimer redesigned from awkward right-aligned layout to clean centered stack.

## [0.0.6.2] - 2026-04-10

### Changed
- Email templates now display the brand logo image instead of plain styled text in the header.
- All email touchpoints updated: shared EmailHeader (13 templates), campaign shell, campaign invite, and campaign digest templates.
- Logo hosted as retina PNG at `/images/logo-email.png` with styled alt text fallback for image-blocking email clients.
- Fixed broken `logo-white.png` reference in legacy email template.

## [0.0.6.1] - 2026-04-09

### Changed
- Pricing section: billing toggle blends into section background (removed white pill).
- Pricing section: both Pro and Max CTAs now use consistent outline button style.
- Subscribe page: CTA button style unified to match landing page.

### Removed
- Redundant "Billing starts after your 7-day free trial" copy below billing toggle (already in section header).

## [0.0.6.0] - 2026-04-08

### Added
- Unified email badge format: all emails now show `{Type} | {Category}` (e.g., "8-K | Material", "4 | Insider", "10-K | Annual").
- Centralized `DEFAULT_CATEGORY_MAP` in EmailHeader with 18 filing type variants for automatic badge labeling.
- `getCleanHeadline()` function for extracting clean, specific headlines from AI-generated 8-K summaries.
- XSS test suite for `markdownToHtml()` covering script injection, numeric entity bypass, and normal markdown rendering.

### Changed
- 8-K verdict box hierarchy swapped: actual headline now displayed at 20px bold, event type demoted to 12px uppercase label.
- 8-K emails now lead with what happened ("Tesla's CFO resigned") instead of generic boilerplate.

### Fixed
- XSS vulnerability in `markdownToHtml()`: numeric entity bypass (`&#60;script&#62;`) closed by switching to unconditional `&` escaping.
- Same entity-based XSS bypass fixed in `formatText()` across 8-K, Form 4, and Form 144 templates.

## [0.0.5.2] - 2026-04-07

### Added
- Public status page served from Cloudflare Worker at `/status` route, independently hosted from Vercel
- `status-page.js` module with XSS-safe HTML rendering, staleness guard, and edge case handling
- KV-backed component health tracking (web app, filing pipeline, cron worker) written on each cron run
- STATUS_KV namespace documentation and provisioning instructions in `wrangler.toml`

### Changed
- Pricing cards: removed redundant plan name label (was showing "PRO" twice).
- Pricing cards: removed "7-day free trial included" and "Cancel anytime" subtext for cleaner CTA area.
- Billing toggle: removed gray border for a lighter, more integrated look.
- CTA section gradient now flows smoothly from pricing background (#F9FAFB) through subtle blue (#F0F7FF) to white.
- Footer: removed hard border-top for seamless section transitions.
- "Get Started" buttons (navbar + hero) changed from blue-to-purple gradient to solid blue, matching pricing tier CTAs.
- Navbar CTA now shows a loading spinner on click and prefetches auth routes on mount for faster navigation.

### Fixed
- CSS specificity: `landing-button-primary` hover state was dead due to missing `!important` (base rule had it, hover didn't).
- Navbar CTA restored `<Link>` semantics for accessibility, SEO, and right-click support.
- Ownership impact numbers now display with comma formatting (e.g., "3,319" instead of "3319").
- Arrow in ownership impact section always points downward as a flow indicator (before → after).
- Decimal places removed from ownership impact share counts (rounded to integer).
- Shared `formatNumberWithCommas` function exported from form4-field-normalizer for DRY reuse.

## [0.0.5.1] - 2026-04-06

### Added
- Brand logo: "Stacked Pages" icon (Concept #4) representing 300+ pages compressed into a summary.
- Reusable `Logo` component (`components/ui/logo.tsx`) with `variant` (full/icon/wordmark), `size`, and `theme` props.
- SVG assets: `app/icon.svg` (favicon), `public/logo-icon.svg`, `public/logo.svg`.
- OG image updated with inline stacked-pages icon and branded wordmark colors.

### Changed
- Unified all brand touchpoints (navbar, sidebar, footer, dashboard header, navigation, email header) to use the Logo component instead of inconsistent text/icon markup.
- Email header now renders "SEC" in brand blue (#0079F2) for consistent identity.

### Fixed
- SVG gradient ID collision when multiple Logo instances render on the same page (unique ID per instance).

## [0.0.5.0] - 2026-04-05

### Added
- Redesigned onboarding flow with 3-step vertical progress indicator (Sectors, Companies, Profile) replacing the old welcome banner and horizontal progress bar.
- New Step 3 "Profile" asking users their role (investor, analyst, advisor, etc.) and approximate AUM bracket, stored in User.preferences JSON.
- Full client-side SEC company search: fetches the entire ~10K company list once, filters instantly in-browser instead of round-tripping to the server on every keystroke.
- Paste-tickers shortcut (desktop): type "AAPL, MSFT, NVDA" and hit Enter to add multiple companies at once.
- Loading skeleton cards while companies load in Step 2, error state with retry button on fetch failure, and max-selection toast feedback.
- Server-side input validation on onboarding completion: ticker symbol regex, count cap (50), preferences size limit (10KB).
- Rate limiting on `/api/companies` endpoint (30 req/min per IP).
- Clerk metadata sync retry (3 attempts with backoff) to prevent redirect loops after onboarding.

### Changed
- Onboarding extracted from a single 780-line component into 6 focused modules: `OnboardingShell`, `SectorStep`, `CompanyStep`, `ProfileStep`, `VerticalProgress`, and shared `types.ts`.
- Sector and company selection cards are now accessible `<button>` elements with `aria-pressed` (previously inaccessible `<div onClick>`).
- Search bar border changed from harsh black to light gray, matching the card aesthetic.
- Filter pills scroll horizontally on mobile instead of wrapping to multiple lines.
- Company grid uses flex column layout instead of fixed 50vh ScrollArea, giving more room for results.
- Server-side module-level cache for SEC company data eliminates DB roundtrip on repeated searches.

### Removed
- Welcome banner ("Welcome to tldrSEC!") and horizontal progress bar.
- Two stale test files that tested non-existent functions (`saveUserPreferences`, `addTickerSubscription`).

## [0.0.4.5] - 2026-04-05

### Changed
- Onboarding transition screen now fades in smoothly (300ms) and fades to white (500ms) before navigating to the dashboard, eliminating the jarring color jump from brand gradient to plain white.
- First-time dashboard visit shows a confetti celebration instead of the blocking tutorial overlay. The tutorial overlay trapped new users on a dark grey screen with no visible instructions.
- Confetti respects `prefers-reduced-motion` for accessibility.
- Cached summary delivery now fires on first dashboard load (previously required completing the tutorial).

### Removed
- Tutorial overlay (`TutorialGuide`) is no longer rendered on the dashboard. The 4-step guided tour added friction without value since the onboarding flow already teaches the product.

## [0.0.4.4] - 2026-04-05

### Added
- Public summary preview pages at `/s/[ticker]/[filingType]/[accession]` for organic search growth. Each AI summary becomes an indexable page targeting long-tail keywords like "Tesla 10-K summary 2025." Previews show ~75 words with a sign-up CTA, keyed on SEC accession number for deduplication.
- Rich JSON-LD structured data: Organization and SoftwareApplication schemas added to existing WebSite schema via `@graph` array.
- Subscribe page now has proper metadata (title, description, canonical URL, OpenGraph) via `app/subscribe/layout.tsx`.
- Dynamic sitemap with summary preview URLs from database, capped at 500 entries.
- SEO test suite expanded from 11 to 28 tests covering all new functionality.

### Changed
- Root layout uses title template (`%s | tldrSEC`) so child pages get consistent branding without manual suffixes.
- Sitemap uses fixed `lastModified` dates instead of `new Date()` to avoid wasting crawler budget.
- Utility pages (unsubscribe, feedback) now have `noindex, nofollow` robots directives.

## [0.0.4.3] - 2026-04-05

### Fixed
- Monitoring validation CI workflow no longer times out after 6 hours. Added `timeout-minutes` to all 6 jobs, a concurrency group with `cancel-in-progress`, a proper health-check poll loop (replacing blind `sleep 10`), a failure exit path if the dev server never starts, and a `trap` for process cleanup on cancellation.
- Removed stale `continue-newsletter-implementation` branch from quality-gates push trigger (branch inactive since Nov 2025).

## [0.0.4.2] - 2026-04-04

### Fixed
- Pipeline no longer silently misses filings during downtime. The null watermark edge case in `filterNewFilings` now returns all filings instead of an empty array, so the Submissions API discovery path catches up after any gap.
- Fast-poll handler detects recovery mode (polling gap > 30 min) and cross-references discovered filings against `RssFilingCheck` to backfill any records missed during downtime.

### Added
- Manual backfill endpoint: `GET /api/cron?action=backfill-missed&days=N` compares SEC Submissions API against local records and queues jobs for any missed filings. Capped at 50 per ticker per run.

## [0.0.4.1] - 2026-04-04

### Changed
- Email 3 ("Your Trial Is Ready") rewritten with Hormozi Grand Slam Offer framework: pain-first intro, CTA above the fold, value-first FAQ, honest CC disclosure with risk reversal
- A/B variant testing for below-CTA copy (variant A: risk reversal first, variant B: outcome first)
- All 3 campaign emails now use dynamic filing data from the database, ranked by materiality, size, and rarity (falls back to hardcoded samples if no summaries exist)
- Gmail/Outlook-safe inline HTML with table layout, MSO conditionals, preheader text with whitespace padding
- Added plaintext MIME parts to all campaign emails for improved deliverability

## [0.0.4.0] - 2026-04-04

### Fixed
- Onboarding sector tiles overflow viewport on smaller screens (now 2/3/4 column responsive grid)
- Companies never loaded after sector selection ("No companies available" error) due to missing sector data in SEC cache
- Sector filter pills used raw HTML buttons instead of design system components
- Dev-facing error message ("Run the SIC population script") replaced with user-friendly copy

### Added
- Staggered fade-in animation on sector tiles (reuses existing `animate-slideUp`, a11y-safe with `prefers-reduced-motion`)
- Curated list of ~190 popular S&P-class companies mapped to all 11 GICS sectors for onboarding browse
- "Showing companies in X, Y" subtitle in step 2 to validate sector choice
- ScrollArea viewport containment for both sector grid and company list

### Changed
- Sector filter pills now use `badgeVariants()` styling while keeping `<button>` for keyboard accessibility
- Sector browse API (`/api/companies?sectors=`) uses curated popular companies instead of unenriched SEC cache
- Sector card sizing reduced (p-3, h-10 icon box) for better viewport fit

## [0.0.3.1] - 2026-04-04

### Fixed
- JSON-LD structured data used wrong domain (`tldrsec.ai` instead of `tldrsec.app`)
- Removed broken SearchAction and unverified sameAs social links from structured data
- Sitemap listed non-existent routes (`/pricing`, `/about`) and auth-gated `/dashboard`
- robots.txt only blocked `/dashboard/settings` and `/dashboard/billing`, now blocks all auth-gated routes
- Homepage used `force-dynamic` unnecessarily, now statically generated for faster crawling

### Added
- Dynamic OG image generation (`app/opengraph-image.tsx`) with error handling and 24h cache
- High-intent SEC filing keywords across homepage and root metadata (10-K, 10-Q, 8-K, Form 4)
- SEO validation test suite (11 tests) preventing regression on crawlability fixes
- `/subscribe` and `/waitlist` added to sitemap as actual public routes

## [0.0.3.0] - 2026-04-04

### Changed
- Pricing toggle upgraded to Grok-inspired pill design with green savings-mode switch
- Price animation replaced with `@number-flow/react` slot-machine digit scroll (same library Grok uses)
- Savings indicator unified to emerald green across landing page and subscribe page
- BillingToggle extracted as shared component, disabled during checkout to prevent mismatch
- AnimatedPrice simplified from 161 lines of custom framer-motion to ~50 lines using NumberFlow

### Fixed
- Landing page pricing had no digit animation on toggle (now matches subscribe page)
- Savings colour inconsistency between landing (green badge) and subscribe (orange text)

## [0.0.2.1] - 2026-04-04

### Changed
- Campaign emails redesigned with clean table-based layout matching Nike-style design artifacts
- Replaced baseTemplate() wrapper with self-contained campaign HTML for better email client compatibility
- Added founder P.S. story to Email 1 and Email 2 with italic styling and border separator
- Email 3 (conversion) left clean to keep CTA focus
- Purple CTAs, system font stack, monospace financial figures, rounded card design

## [0.0.2.0] - 2026-04-04

### Added
- Trial nurture email cron: automated day 3/4/6 nurture sequence with cumulative day logic
- Win-back emails at day 10 and 14 for expired trial users
- Setup nudge email for trial users who haven't added any tickers
- Engagement scoring (0-100) based on views, deliveries, feedback, tickers, onboarding
- Conversion metrics utility for measuring nurture-to-paid conversion rates by stage and engagement band
- `nurture-trials` action wired to consolidated cron route and Cloudflare Worker daily tasks

### Fixed
- Hero section test: add auth context mock after upstream component change
- Cloudflare Worker wrangler.toml: sync cron schedule `*/1` to `*/5` to match root config
- Cron routing test: update schedule assertion to match actual config

## [0.0.1.0] - 2026-04-03

### Fixed
- Summary page no longer redirects to nonexistent `/error` page when database errors occur
- Next.js internal redirect/notFound errors are no longer swallowed by the catch block
- Server-side error logging added for summary page failures (previously silent)
- Dashboard page overflow from unconstrained activity feed and `min-h-[1550px]` mobile tickers view
- "Show more" button label no longer displays incorrect count when Form 4 filings are grouped

### Changed
- Dashboard stats row, tab wrappers, and empty state now use shadcn Card components instead of raw divs
- Activity feed limited to 10 items with "Show all" expansion for faster initial render
- Activity feed date groups separated with shadcn Separator for visual breathing room
- Form 4 expand/collapse button uses shadcn Button component
- Dashboard shell and content spacing reduced for tighter layout
- Activity feed uses ScrollArea with viewport-relative max-height for feeds with 4+ items
- Sparse feeds (1-3 items) render without scroll container

### Added
- Custom 404 page for missing summaries (`app/summary/[id]/not-found.tsx`)
