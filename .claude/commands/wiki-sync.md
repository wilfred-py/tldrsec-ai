Post-ship knowledge sync: distill dev cycle changes into the Obsidian vault wiki.

Vault path: /Users/wilf/Software/Obsidian/tldrsec-ai/
Vault schema: Read the vault's CLAUDE.md for page conventions, frontmatter format, and directory structure.

## Steps

1. **Read recent changes**: Run `git log --oneline -20` and `git diff HEAD~5..HEAD --stat` to understand what shipped recently.

2. **Read vault state**: Read `wiki/index.md` and `wiki/log.md` to understand current wiki coverage and the last sync date.

3. **Identify knowledge to distill**: For each significant change shipped, determine:
   - Does this affect product architecture? → update/create pages in `wiki/product/`
   - Does this introduce new domain concepts? → update/create pages in `wiki/concepts/`
   - Does this change how we handle SEC filings? → update pages in `wiki/sec/`
   - Does this affect growth/pricing/email? → update pages in `wiki/growth/`
   - Were there non-obvious debugging insights? → write to `wiki/analysis/`
   - Were there architectural decisions worth recording? → write to `wiki/analysis/`

4. **Write or update pages**: Follow the vault's CLAUDE.md schema:
   - YAML frontmatter: title, type, category, created, updated, tags, sources
   - Use `[[wikilinks]]` aggressively for cross-references
   - Concise and direct — lead with key insight, no filler
   - Attribute claims to sources

5. **Update index and log**:
   - Add new pages to `wiki/index.md`
   - Append an entry to `wiki/log.md` with today's date, what was synced, and pages touched

6. **Surface knowledge gaps**: List pages that should exist but don't yet based on the codebase.

## Output

Report what was updated:
```
Wiki Sync Report
================
Date: YYYY-MM-DD
Changes synced: [list of commits/features]
Pages created: [list]
Pages updated: [list]
Knowledge gaps identified: [list of suggested pages to create]
```

Usage: /wiki-sync
