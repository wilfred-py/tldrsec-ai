# USER.md — Operating Profile

> Practical context for the agent. *How to work with Wilfred*, not who he is. Read this before responding; SOUL.md tells you *why*, this tells you *how*.

## Identity

- **Name:** Wilfred Chen
- **Email:** wilfredchen1@gmail.com (primary), wilfred.chen.python@gmail.com (project-tagged)
- **Project:** tldrsec-ai — SEC filing summarization product
- **Working directory:** `/Users/wilf/conductor/workspaces/tldrsec-ai/casablanca` (one of several parallel Conductor workspaces)

## Tools & Environment

- **Editor/agent:** Claude Code, with parallel Conductor workspaces. Multiple workspaces may share `localhost:3000` — verify which workspace owns the port before diagnosing dev-only bugs.
- **LLM provider for product features:** xAI Grok (NOT Anthropic). All AI features in this codebase route through Grok.
- **Knowledge base:** Obsidian vault at `~/Software/Obsidian/tldrsec-ai/` — single source of truth for domain knowledge. Read `wiki/overview.md`, `wiki/product/`, `wiki/sec/` before exploring raw source files.
- **Env files:** `.env.local` per workspace; do NOT put API keys in shell config.

## Communication Style

- Terse responses. Short and concise. No trailing summary if the diff already shows it.
- Don't explain what changed line-by-line — give the high-level "why".
- Use `path:line` for code references.
- Surface tradeoffs and assumptions explicitly. Ask before guessing.
- One sentence updates between tool calls when working; not a running monologue.

## Workflow Defaults

- **Plan mode** for any non-trivial task (3+ steps or architectural). Write plans to `tasks/<TASK_NAME>.md`. Review with Wilfred before implementing. List unresolved questions at the end.
- **Self-improvement loop:** after corrections, append the lesson to `tasks/lessons.md`. Read at session start.
- **Verification before "done":** never mark complete without proof. Run tests, check logs, demonstrate.
- **Git hygiene:** new commits, never amend. Don't push without explicit ask. Branch naming: `wilfred-py/<concise-name>`.
- **Pre-commit:** run `git status` and `npm test` before committing.

## Recurring Manual Tasks

- **Landing-page Gmail fixtures** (`lib/landing/gmail-mock-summaries.ts`) — refresh weekly.
  - Run `npx tsx scripts/refresh-landing-fixtures.ts` against prod (uses `.env.local`).
  - Pick 15 from candidates, hand-curate (editorial voice, news-verified, ≥8 brand-recognition tickers).
  - "Updated weekly" footer copy in the hero is a public promise — don't let this slip.

## Project-Specific Gotchas

- Use `getPrismaClient()`, NOT direct `prisma` import (direct import fails in API routes).
- `CRON_SECRET` must be exactly 80 chars.
- Look up users by `authProviderId` not just `id` — Clerk userId lives in `authProviderId`.
- Sync `User.subscriptionTier` via `syncUserSubscriptionTier()` in Stripe webhooks.
- Jest mock hoisting: don't reference `const` in `jest.mock()` factories.
- Don't use `{ not: null }` on required Prisma fields.
- Define CSS animations explicitly via `@layer utilities` in `app/globals.css`.

## What I'm Optimizing For

<!-- TODO: confirm/edit -->
- Shipping useful features for retail investors fast.
- Compounding knowledge in the Obsidian vault, not scratch markdown files.
- Keeping email as the primary product surface.

## What I'm NOT Optimizing For

- Pixel-perfect dashboard polish (until it's the bottleneck).
- Backwards compatibility with hypothetical future consumers.
- Test coverage for impossible edge cases.

## Boundaries / Don'ts

- Don't write speculative abstractions or "future-proofing" code.
- Don't add comments explaining WHAT — only non-obvious WHY.
- Don't create planning/decision/analysis docs unless asked.
- Don't auto-commit. Don't push to remote without explicit ask.
- Don't modify shared infrastructure or `git config` without confirming.
- Don't summarize what you just did at the end of every response.

## When to Interrupt Me

- You've found something genuinely surprising in the code.
- The plan is about to do something irreversible.
- Two interpretations of the request exist — ask, don't pick.
- You hit a blocker you can't reason past.
