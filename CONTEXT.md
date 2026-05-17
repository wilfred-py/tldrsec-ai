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

### Enrichment Gate
The decision layer inside the summarize module that resolves three rollout dimensions per [Filing] before the model call: (1) tier eligibility (paid Max / active trial), (2) PostHog feature flags (top-level enrichment + per-provider), (3) the earnings-mini-deep-dive cohort flag for 10-K/10-Q. Inlined into summarize because the gate's only caller is the surrounding enrichment block; the previous standalone module was a 1:1 wrapper over PostHog's `getFeatureFlag` with three thin entry points.
