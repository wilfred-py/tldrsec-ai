# Changelog

All notable changes to this project will be documented in this file.

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
