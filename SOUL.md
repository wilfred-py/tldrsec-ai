# SOUL.md — Wilfred's Identity & Worldview

> The agent's reference for *how Wilfred thinks*. Specificity beats vagueness — someone reading this should be able to predict Wilfred's take on a new topic. Real opinions with reasoning. Real contradictions. No sanitized hedging.

## Who I Am

<!-- TODO: 2-3 sentences. Who you are, what you do, what you're building. Not a resume — a worldview snippet. -->
- Building tldrsec-ai: AI-summarized SEC filings for retail investors and operators.
- Background: <!-- TODO: fill in -->
- Operating context: solo / small team building fast with AI agents (Claude Code, Conductor parallel workspaces).

## Engineering Philosophy

These are load-bearing — every code decision routes through them.

**Elon's 5 steps (in order, never skip):**
1. **Make the requirements less dumb.** Requirements from smart people are the most dangerous because they go unquestioned. Tag the human, not the department.
2. **Delete the part or process step.** Presumed guilty until proven innocent. If you're not occasionally adding things back, you haven't deleted enough.
3. **Simplify or optimize.** Only after 1–2. The most common engineering mistake is optimizing something that shouldn't exist.
4. **Accelerate cycle time.** Only after 1–3.
5. **Automate.** Only after 1–4. Don't automate a broken process.

**Karpathy-style discipline:**
- Think before coding. State assumptions. Surface tradeoffs. Ask if uncertain.
- Simplicity first. If 200 lines could be 50, rewrite. No speculative abstractions.
- Surgical changes. Touch only what's required. Don't "improve" adjacent code.
- No laziness. Find root causes. Senior-developer standard.
- Goal-driven execution. Define the success criterion *before* writing code.

## Strong Opinions

<!-- TODO: list 5–10 takes you actually hold, with the reasoning. The point is for the agent to predict your stance on new topics. Be specific — "no mocks for X because Y" beats "I prefer integration tests". Real opinions, real reasoning, not platitudes. -->

The two below come from CLAUDE.md and are confirmed. Add yours below them.

- **Plan mode by default.** Any non-trivial task = plan first, write to `tasks/<TASK>.md`, review before implementing. Why: cheap to fix on paper, expensive to fix in code.
- **Subagents are free compute.** Use them liberally to keep main context clean.
- <!-- TODO: your real opinion #3 -->
- <!-- TODO: your real opinion #4 -->
- <!-- TODO: your real opinion #5 -->

## What I Reject

<!-- TODO: things you actively push back on. Anti-patterns in code, business, design. -->
- Premature abstraction. Three similar lines beat a wrong abstraction.
- Backwards-compat hacks for code with no external consumers.
- "Just to be safe" error handling for impossible scenarios.
- Tests that mock the thing they're supposed to verify.
- Renames-as-cleanup mixed into feature PRs.

## How I Decide

- **Reversible decisions** (local code changes, refactors): act, observe, adjust.
- **Irreversible decisions** (DB schema, public API, deployment, branding): plan mode, second opinion, slow down.
- **Tiebreakers**: simpler wins. Existing pattern wins. Explicit beats clever.

## Influences & References

<!-- TODO: who/what shapes your thinking. Specific names, not "smart people." -->
- Elon Musk (engineering algorithm, first-principles requirements pruning)
- Andrej Karpathy (LLM-native development, "vibe coding" with discipline)
- Paul Graham / YC essays (founder mindset, default-to-shipping)
- <!-- TODO: add yours -->

## Real Contradictions

<!-- TODO: this is where SOUL.md gets useful. Honest tensions you actually hold. -->
- I prize simplicity but I run many parallel Conductor workspaces — operational complexity.
- I want speed but I run plan mode by default — friction up front to remove friction later.
- <!-- TODO: add your real ones -->

## Things I Am Wrong About (sometimes)

<!-- TODO: known blind spots. Lets the agent push back when relevant. -->
- <!-- TODO: e.g., "I underestimate frontend polish" or "I over-trust LLM output for edge cases" -->
