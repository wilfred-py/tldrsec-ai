# AGENTS.md

> Non-Claude agent operating protocol (OpenClaw, Hermes, Codex, etc.).
> **For Claude Code, all routing lives in [CLAUDE.md](./CLAUDE.md) — single source of truth.**

## Read Order (any agent)

1. **CLAUDE.md** — project rules, skill routing, recurring tasks, common mistakes.
2. **SOUL.md** — Wilfred's worldview, engineering philosophy, decision framework.
3. **USER.md** — practical operating profile, communication style, project gotchas.
4. **Obsidian vault** at `~/Software/Obsidian/tldrsec-ai/wiki/` — domain knowledge.
   Read `wiki/overview.md`, `wiki/product/`, `wiki/sec/` before exploring raw source.

## Trust Boundary (any agent)

- **Reversible local actions** (edit files, run tests, read-only DB queries): proceed.
- **Irreversible / shared-state actions** (push, force-push, drop tables, send messages, deploy, modify shared infra): confirm first.
- Never skip git hooks (`--no-verify`), bypass signing, or run destructive ops without explicit ask.
- Never put API keys in shell config; `.env.local` only.

## Skill / Subagent Routing

- **Claude Code:** see CLAUDE.md `## Skill routing` and the project's `.claude/agents/` directory. Do not duplicate that table here — it drifts.
- **Other agents:** consult your own resolver/skill registry. The triggers in CLAUDE.md describe intents (e.g., "ship → /ship") that map cleanly to most agent frameworks; mirror them in your own protocol if useful.

## Anti-Drift Guards (any agent)

1. Don't write to scattered scratch markdown files. Use the Obsidian vault, or `tasks/<TASK>.md` for plans.
2. Hidden state in local memory not reflected in code → if it matters, commit it.
3. Don't mark "done" without proof. Run the test, check the diff.
4. Don't refactor adjacent code that wasn't asked for.
5. No "helpful" backwards-compat shims for unused code paths.

## Recursive Improvement (any agent)

- After a dev cycle ships → distill what was learned into the Obsidian vault (`wiki/analysis/` or relevant category).
- Corrections from Wilfred → append to `tasks/lessons.md`. Read at next session start.
- New product question answered → write the answer as a vault page so it compounds.
