# Changelog

All notable changes to this project will be documented in this file.

## [0.0.20.0] - 2026-04-17

### Fixed
- Health endpoint false-CRITICAL during EDGAR quiet hours (22:15-05:45 ET). Three time-sensitive conditions now suppressed overnight via `isEdgarOpen()`: no completions, cron execution gaps, and empty TickerMonitoring. Real CRITICAL conditions (stuck locks, exhausted retries, invalid job types) remain hot 24/7.
- E2E pipeline recovery test suite pointed at deleted routes (`/api/health/pipeline`, `/api/cron/auto-recover`). Updated to current consolidated routes (`/api/health`, `/api/cron?action=auto-recover`). Test suite was dead since PR #371 route consolidation.

### Added
- `edgarOpen` field in `/api/health` response so monitoring integrations can distinguish quiet-hours from real outages.

## [0.0.19.4] - 2026-04-17

### Fixed
- CTA button text now renders white regardless of theme. The shadcn Button default variant applied `text-primary-foreground` which resolved to near-black in dark mode, fighting the brand button CSS. Added `text-white` Tailwind class and `!important` to both `brand-button-primary` and `brand-button-gradient`.

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
