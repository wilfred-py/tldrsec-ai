# Context

Domain glossary for tldrsec-ai. The architecture review process ([process/improve-codebase-architecture.md](process/improve-codebase-architecture.md)) reads this file to name modules in the project's own vocabulary rather than generic abstractions.

This file is **lazily populated**. The autonomous review routine adds terms here as it names deepened modules. Hand-edit freely — the routine respects existing entries.

## Format

Each term is a short heading + one paragraph. Cross-link with `[term]` references. Keep entries tight: a term earns a place here when it shows up in module names, function names, or test descriptions.

## Terms

<!-- Seed entries — replace as the routine populates real domain terms. -->

### Filing
A document filed with the SEC by a public company or insider (10-K, 10-Q, 8-K, Form 4, etc.). The atomic unit of everything tldrsec-ai ingests, summarizes, and emails about.

### Summary
A short, AI-generated digest of one Filing, tuned for retail-investor scanning. The user-facing artifact.

### Subscription
A user's saved interest in a [Filing] type or ticker. Drives which [Summary] payloads they receive in their email.

### Onboarding
The first-run flow that turns a new signup into an engaged subscriber: ticker selection, preview email, account creation, first cached [Summary] delivery.

### X Sentiment
An enrichment of a [Summary] that captures public discussion on X (Twitter) about the ticker over a 7-day window. Direction (bullish/bearish/mixed/neutral/no_signal), shift, confidence, and citation-backed claims. Gated by form importance + a large-cap allowlist (S&P 500) to keep cost and pump-and-dump risk bounded. Runs only for paid-tier callers via the enrichment gate.

### Extractable
A property of a [Filing] meaning the SEC document body, after fetching and cleaning, contains enough structured financial-statement signal for the AI to produce a usable [Summary]. After the NVDA 10-Q fix shipped in this branch, "extractable" has a precise definition: the filing passes both `hasFinancialStatementSignal()` pre-LLM (3 of 5 signals present in the cleaned text: period header, statement title, line items, dollar density, minimum length — see `lib/ai/parsers/financial-content-gate.ts`) AND `hasUsableFinancialHighlights()` post-LLM (at least one `financialHighlights` row passes `isUsableMetricRow`). When the user-facing email says "no extractable financial results," it means one of these gates failed. Filings where `requiresFinancialContent(formType)` is true (10-K, 10-Q, 20-F, 6-K, and amendments) MUST be extractable; failure is treated as a parser bug and the email is not sent. Filings outside that set (Form 4, NT-10-K, etc.) may legitimately be non-extractable and fall through to the minimal-content metadata path.

### SEC Section
A semantic region of a [Filing] — "Risk Factors", "Management Discussion", "Financial Statements", "Business Overview", etc. Canonical type: `SECFilingSection` in `lib/ai/prompts/prompt-types.ts`. Per-section token budgets and (forthcoming) priority order live alongside that type in `lib/ai/prompts/context-manager.ts`. Anything that segments filing text into these buckets, or assigns budgets to them, must reuse `SECFilingSection` — do not define parallel section vocabularies. Not to be confused with `FilingSection` in `lib/parsers/html-parser.ts`, which is a different concept: structural HTML element types (TITLE, HEADER, PARAGRAPH, TABLE, LIST) used only by the standalone html-parser module.

### Lifetime Seat
A user who claimed one of the first 25 lifetime seats via a one-time $499 payment. Entitled to all MAX-tier features (see `lib/stripe/plans.ts`) forever, with no recurring subscription. Modeled as a `User.foundingMember: Boolean` flag rather than a new `SubscriptionTier` value, since the entitlement set is identical to MAX. Purchased via a one-time Stripe `Price` (env: `STRIPE_FOUNDING_LIFETIME_PRICE_ID`) under the existing MAX `Product`, not a recurring subscription. Not to be confused with [Subscription] (watchlist interest) or `UserSubscription` (Stripe-side recurring plan record, which Lifetime Seat holders do not have).

### Template Selection
Resolving a [Filing] type to the minimalist email template that renders it, plus a canonical template name for analytics tags. Implemented as one deep module (`lib/email/template-selection.ts`) behind a single `selectFilingTemplate(filingType)` function. Form-type matching is case- and prefix-insensitive (`Form 4`, `FORM 4`, `4` all resolve identically), and unknown types fall back to a generic template so callers never handle a miss. Form 3/4/5 share the insider-trading template. Replaces three drifting copies of the alias→template map that previously lived in `template-registry.ts`, `templates.ts`, and the filings `emailGenerator.ts` — the filings copy had silently regressed to rendering the generic template for DEF 14A, S-1, S-3, 11-K, and 13D filings.

### Email Link Token
An HMAC-signed token embedded in an outbound email link, covering both the feedback links (`userId:summaryId:expiry:signature`, 30-day) and the unsubscribe links (`email:expiry:signature`, 90-day) that ride the `List-Unsubscribe` header. Implemented as one deep module (`lib/email/email-link-tokens.ts`) behind generate/validate pairs that share a single CRON_SECRET-keyed signing layer. Replaces two drifting modules (`feedback-tokens.ts`, `unsubscribe-tokens.ts`) that each carried their own copy of the signing internals AND exported `generateUnsubscribeToken`/`validateUnsubscribeToken` with *incompatible* wire formats — a token minted by one failed validation in the other, so an unsubscribe link's success depended on which entry point (`/unsubscribe` vs `/api/unsubscribe`) it reached. The consolidated `validateUnsubscribeToken` accepts both the canonical and the legacy purpose-marked (`email:unsubscribe:expiry:signature`) format, so links already delivered keep working.

### Historical Context
A prompt enrichment that folds the most recent prior [Summary] entries for a ticker into the current [Filing] prompt so the model can reference continuity (e.g. "Q3 follows the Q2 guidance cut"). Capped at the last 3 summaries, each truncated to 1500 characters to bound token cost. Implemented as private functions inside the Summarize module (`lib/ai/summarize.ts`) — not a separate module — because the only caller is the summarization pipeline itself and the prior extraction-for-testability split offered no leverage. Failures are non-fatal: a Postgres error logs and proceeds without history.

### Filing Prompt
The system+user+JSON-schema bundle handed to the LLM to summarize one [Filing]. Implemented as one deep module (`lib/ai/prompts/unified-prompts.ts`) behind two functions — `generateFilingPrompt(formType, content, options)` and `getSchemaForFormType(formType)` — plus the `FORM_SCHEMAS` registry. The module dispatches form-type-specific schema and journalist-tone instructions internally; callers (`lib/ai/summarize.ts`, `lib/ai/filing-analyzer.ts`, `lib/ai/parsers/simple-parser.ts`, `lib/ai/summarization/chunk-processor.ts`) never branch on form type. Replaces the legacy dual-prompt system — a `PromptTemplate` base class plus five `Form10KPrompt` / `Form10QPrompt` / `Form8KPrompt` / `FormForm4Prompt` / `GenericFilingPrompt` subclasses (each ~100 LOC of inlined system+user+schema strings) — which had drifted from production for months: zero non-test callers, and the journalist-tone copy lived in two places (the subclasses AND `unified-prompts.ts`) with the unified copy as the only one production actually used. The subclasses' tests asserted on internal substrings of `getSystemPrompt()` output — past the interface, not behaviour — so deleting them removed test mass that wasn't anchored to anything the system shipped.

### Tier Scheduling
How a [Subscription] tier drives the cron pipeline, along two axes that intentionally classify the same tier strings differently. The **priority axis** sets where a job sits in the queue once enqueued (MAX→9, PRO→7, FREE/unknown→5; active trials borrow MAX's 9), with a per-form-type materiality bonus folded in by `getCompositePriority` (8-K most urgent). The **cadence axis** decides whether a user is due for processing and how often (`normalizeTier` buckets both MAX and PRO into one processing frequency — 5 min — while FREE falls to HOBBY's 120 min). Implemented as one deep module (`lib/cron/tier-eligibility.ts`) behind the priority/cadence function set; trial eligibility is delegated to `lib/auth/tier-eligibility.ts` (`isActiveTrial`), the cross-cutting authority shared with auth and summarization. Absorbs the former `tier-priority.ts`, so a maintainer changing tier behaviour reads one place and can see that the two axes disagree on MAX by design.
