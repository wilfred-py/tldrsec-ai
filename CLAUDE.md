# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Engineering Philosophy

### Elon's 5-Step Engineering Algorithm
Apply these steps IN ORDER to every task:

1. **Make the requirements less dumb** - Question every requirement. Requirements from smart people are the most dangerous because you're less likely to question them. Requirements should come with the name of the person who made them — not a department.
2. **Delete the part or process step** - If you're not occasionally adding things back, you're not deleting enough. Every requirement, process, or component should be presumed guilty until proven innocent.
3. **Simplify or optimize** - Only AFTER steps 1-2. The most common engineering mistake is optimizing something that shouldn't exist.
4. **Accelerate cycle time** - Only AFTER steps 1-3. Move faster, but never skip the first three steps.
5. **Automate** - Only AFTER steps 1-4. Don't automate a broken or unnecessary process.

### Core Principles (Karpathy-enhanced)

1. **Think Before Coding** — Don't assume. Don't hide confusion. Surface tradeoffs.
   - State assumptions explicitly. If uncertain, ask.
   - If multiple interpretations exist, present them — don't pick silently.
   - If a simpler approach exists, say so. Push back when warranted.
   - If something is unclear, stop. Name what's confusing. Ask.

2. **Simplicity First** — Minimum code that solves the problem. Nothing speculative.
   - No features beyond what was asked.
   - No abstractions for single-use code.
   - No "flexibility" or "configurability" that wasn't requested.
   - No error handling for impossible scenarios.
   - If 200 lines could be 50, rewrite it.
   - Self-check: "Would a senior engineer say this is overcomplicated?"

3. **Surgical Changes** — Touch only what you must. Clean up only your own mess.
   - Don't "improve" adjacent code, comments, or formatting.
   - Don't refactor things that aren't broken.
   - Match existing style, even if you'd do it differently.
   - If you notice unrelated dead code, mention it — don't delete it.
   - Remove imports/variables/functions that YOUR changes made unused, not pre-existing ones.
   - Test: every changed line should trace directly to the user's request.

4. **No Laziness** — Find root causes. No temporary fixes. Senior developer standards.

5. **Goal-Driven Execution** — Define success criteria. Loop until verified.
   - "Add validation" → "Write tests for invalid inputs, then make them pass"
   - "Fix the bug" → "Write a test that reproduces it, then make it pass"
   - "Refactor X" → "Ensure tests pass before and after"
   - For multi-step tasks: `1. [Step] → verify: [check]`

**These principles are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- Write a plan to .claude/tasks/TASK_NAME.md
- The plan should be a detailed implementation plan with reasoning, broken down into subtasks
- Review the plan with me before implementing
- Always list unresolved questions at the end of the plan
- For any unresolved questions, allow me to answer them before you continue

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### While Implementing
- You should update the plan as you work
- After you complete tasks in the plan, update and append detailed descriptions of the changes you made, so following tasks can be easily handed over to other engineers

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Agent Guidelines

### Common Mistakes to Avoid
1. **Don't guess file locations** - Use codebase-locator agent or Grep/Glob before assuming paths
2. **Use `getPrismaClient()` not direct `prisma` import** - Direct imports fail in API routes
3. **Verify secret lengths** - CRON_SECRET must be exactly 80 chars
4. **Read files fully** - Never use limit/offset when understanding context for planning
5. **Check git status first** - Before any commit, run `git status` to see actual changes
6. **Run tests before committing** - Run `npm test` before committing
7. **Never store API keys in shell config** - API keys belong in `.env.local` files (gitignored)
8. **Define CSS animations explicitly** - Define keyframes in `app/globals.css` using `@layer utilities`
9. **Don't use `/i` flag with name-extraction regexes** - Makes `[A-Z][a-z]+` match verbs as names
10. **Assert on text content, not hex colors, in React tests** - innerHTML doesn't preserve hex strings
11. **Look up users by `authProviderId` not just `id`** - Clerk userId is in `authProviderId`. Use `findFirst({ where: { OR: [{ id }, { authProviderId }] } })`
12. **Check `jest.config.mjs` moduleNameMapper for new `@/` paths** - Missing mappings cause "Cannot find module"
13. **Sync `User.subscriptionTier` in Stripe webhooks** - Also update via `syncUserSubscriptionTier()` when changing `UserSubscription.planType`
14. **Jest mock hoisting: don't reference `const` in `jest.mock()` factories** - Use inline `jest.fn()`, then cast. See `__tests__/cron/handlers/summarize-cached-handler-validation.test.ts`
15. **Don't use `{ not: null }` on required Prisma fields** - Check `prisma/schema.prisma` first
16. **SVG elements need explicit pixel dimensions** - Use `width={px} height={px} viewBox` with React state
17. **Verify correct dev server port in worktrees** - Check `lsof -Pi :3000 -sTCP:LISTEN` and `:3001`

### Recurring Manual Tasks

- **Landing-page Gmail fixtures (`lib/landing/gmail-mock-summaries.ts`) — refresh weekly.** The hero component renders hardcoded summaries; they go stale. Each Monday: run `npx tsx scripts/refresh-landing-fixtures.ts` against prod DB (uses `.env.local`), pick 15 from the candidate output, hand-curate (editorial voice, news-verified, ≥8 brand-recognition tickers), and ship a PR. ~25 min. The `Updated weekly` footer copy (`components/landing/sections-v2/gmail-inbox-hero.tsx`) sets visitor expectations so this cadence cannot silently slip without breaking the promise.

  **Hero-frame ↔ demo-widget coupling.** The hero positioning (currently the Form-4 / insider-buying wedge per `lib/landing/copy.ts` `HOMEPAGE_HERO_VARIANT`) sets an implicit promise about *what kind* of summaries the demo widget showcases. If the hero frame changes — for example, from "insider-buying wedge" to a different positioning — the weekly fixture curation criteria need to follow. Today's criteria optimize for "≥8 brand-recognition tickers" but say nothing about insider-trade representation. When the hero leans on Form 4, the demo should over-index on Form 4 examples to reinforce the claim. Before changing the hero frame, audit the curation criteria here; before changing the curation criteria, audit the hero frame. Tracked as a TODO in `.claude/tasks/landing-copy-rework.md`.

## Knowledge Base (Obsidian Vault)

**IMPORTANT: This project's knowledge base lives in an Obsidian vault, NOT in `.context/wiki/`.**

**Vault path**: `/Users/wilf/Software/Obsidian/tldrsec-ai/`

The vault is the single source of truth for domain knowledge, product decisions, and research. It follows its own schema defined in the vault's `CLAUDE.md`. Read the vault wiki pages before exploring raw source files — they replace the need to read 15-20 source files.

| Vault Path | When to Read |
|------------|-------------|
| `wiki/overview.md` | Product goals, open questions, key metrics |
| `wiki/sec/` | SEC filing types, EDGAR, transaction codes, regulations |
| `wiki/companies/` | Company profiles with financials, insider activity, peer links |
| `wiki/sources/` | Summarized source documents with key takeaways |
| `wiki/product/` | Product architecture, features, decisions, roadmap |
| `wiki/growth/` | Marketing, pricing, distribution, email strategy |
| `wiki/competitors/` | Competitive landscape and comparisons |
| `wiki/concepts/` | SaaS metrics, business models, positioning |
| `wiki/analysis/` | Research syntheses, decision logs, comparisons |
| `wiki/index.md` | Master index of all wiki pages |
| `wiki/log.md` | Chronological record of all wiki operations |

### Context Profiles (load from vault selectively)
- **plan**: wiki/overview.md, wiki/product/, wiki/analysis/ + relevant domain pages
- **implement**: wiki/product/, wiki/sec/ + domain-specific wiki pages
- **review**: wiki/product/, wiki/sec/ + domain-specific wiki pages
- **ship**: wiki/overview.md (for changelog context)
- **debug**: wiki/product/, wiki/sec/ + relevant company pages

### Skill-to-Profile Mapping
When a gstack skill is invoked, load the matching context profile FIRST:
- `/autoplan`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review` → **profile:plan**
- `/implement_plan`, `/qa`, `/design-review` → **profile:implement**
- `/review`, `/codex` → **profile:review**
- `/ship`, `/land-and-deploy`, `/commit` → **profile:ship**
- `/investigate` → **profile:debug**

### Recursive Wiki Improvement

The vault compounds knowledge over time. After each dev cycle, distill what was learned:

1. **After `/land-and-deploy`** → run `/wiki-sync` to update vault with what shipped
2. **After `/investigate`** → write findings to `wiki/analysis/` or relevant category
3. **During `/autoplan`** → read vault pages for domain context before planning
4. **When answering product questions** → write the answer as a vault wiki page so it compounds

Follow the vault's `CLAUDE.md` schema for all writes: YAML frontmatter, wikilinks, update index.md and log.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Sync knowledge to vault after shipping → invoke wiki-sync
- Ingest source into vault wiki → invoke wiki-ingest
- Audit vault wiki health → invoke wiki-lint
