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

### Historical Context
Prompt prefix attached to a new [Summary] generation that quotes the three most recent prior [Summary] rows for the same ticker. Gives the model continuity ("vs the prior 10-Q...") and pattern detection. Bounded at 1500 chars per prior summary to keep the prompt budget predictable. Inlined into the summarize module — it is private prompt-build state, not a standalone seam.
