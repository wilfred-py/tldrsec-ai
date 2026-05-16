---
name: grill-with-docs
description: Interactive grilling session that stress-tests a plan against this repo's domain language and architectural decisions. Sharpens terminology and updates CONTEXT.md / docs/adr/ inline as decisions crystallise. Use after /office-hours and before /autoplan when a plan needs its language and assumptions pressure-tested against what's already documented.
---

<what-to-do>

Interview the user relentlessly about every aspect of this plan until you reach shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask questions one at a time, waiting for feedback on each before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead of asking.

</what-to-do>

<supporting-info>

## Repo conventions (read these first)

This repo has existing conventions. Use them — do not invent your own format.

- **Glossary lives at** `/CONTEXT.md`. Format rules are in the file itself (header + paragraph per term, cross-link with `[term]`). A term earns a place when it shows up in module names, function names, or test descriptions.
- **ADRs live at** `/docs/adr/`. Format and "when to write" rules are in `/docs/adr/README.md`. ADRs are stricter than typical grill-with-docs ADRs — they require Date, Status, Context, Decision, Consequences sections.
- An autonomous architecture review routine also writes to CONTEXT.md. Respect existing entries. When in doubt, append rather than rewrite.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with or duplicates an existing CONTEXT.md term, call it out immediately. "CONTEXT.md defines [Subscription] as a user's saved interest in a filing type or ticker — you seem to mean the Stripe plan tier. Different concept. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'user' — do you mean the Clerk auth principal or the email recipient? CONTEXT.md doesn't have either yet."

### Discuss concrete scenarios

When domain relationships are discussed, stress-test with specific scenarios. Invent edge cases that force precision about boundaries between concepts.

### Cross-reference with code

When the user states how something works, verify against the code. If you find a contradiction, surface it: "You said partial cancellations are possible, but `cancelSubscription` in `lib/billing/` always cancels the whole subscription. Which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` immediately. Don't batch. Follow the existing `### Term` + paragraph format. Use `[term]` cross-links.

CONTEXT.md is a glossary — not a spec, not a scratch pad, not a decision log. Implementation details go in code or ADRs.

### Offer ADRs sparingly

Only offer an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful.
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons.

If any is missing, skip the ADR. When you do write one, follow the full template in `/docs/adr/README.md` (Date / Status / Context / Decision / Consequences). Numbering is sequential, zero-padded to 4 digits — scan `/docs/adr/` for the highest number and increment.

## When this skill ends

The session ends when the user is satisfied the plan is sharp enough to hand to `/autoplan`. Summarize:

- Terms added or changed in CONTEXT.md
- ADRs written (with paths)
- Unresolved questions worth surfacing to the next step

</supporting-info>
