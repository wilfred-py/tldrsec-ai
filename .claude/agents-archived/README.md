# Archived Agent Descriptions

These agent directories were archived on 2026-02-07 to reduce token usage from 16,500 to under 15,000 tokens.

## Why These Were Archived

These agents are not relevant to the SEC filing summarization project and were consuming unnecessary context window tokens:

- **account-team-agents/** - Account management, customer success, sales operations
- **finance-strategy/** - Financial planning and strategy (distinct from SEC filing analysis)
- **growth-revenue-operations/** - Growth hacking, customer acquisition, revenue operations
- **market-research-agents/** - Market research and competitive analysis
- **marketing/** - Social media marketing (Instagram, Twitter, TikTok, Reddit)
- **operations/** - General operations (analytics reporting, finance tracking)
- **product/** - Product management (sprint planning, feedback synthesis)
- **project-management/** - Project shipping, experiment tracking

## Active Agents (Kept in /agents/)

The following agent categories remain active as they're relevant to SEC filing work:

- **core/** - Core software engineering agents
- **humanlayer/** - Codebase navigation (locator, analyzer, pattern-finder)
- **edgar-api-specialist.md** - SEC Edgar API integration
- **sec-filing-analyzer.md** - SEC filing analysis
- **sec-filing-token-optimizer.md** - Token optimization for large filings
- **testing/** - Testing agents
- **ai-automation-specialists/** - AI/ML integration (Claude API work)
- **design/** - UI/UX agents (for dashboard)
- **specialized-agents/** - UI/UX analyst, product requirements

## Restoring Agents

If you need any of these agents later, simply move the directory back:

```bash
mv .claude/agents-archived/DIRECTORY_NAME .claude/agents/
```

## Token Savings

**Before:** ~16,500 tokens (above 15,000 limit)
**After:** Estimated ~8,000-10,000 tokens (well under limit)
**Savings:** ~40-50% reduction in agent description token usage
