Wiki Lint: Check Obsidian vault wiki health and flag stale pages.

Vault path: /Users/wilf/Software/Obsidian/tldrsec-ai/
Vault schema: Read the vault's CLAUDE.md for page conventions and directory structure.

Steps:

1. For each wiki page in the vault (`wiki/**/*.md`):
   - Read the `updated` date from YAML frontmatter
   - If older than 14 days from today, flag as STALE
   - Check if the page's topic has had recent code changes (use `git log --since` in the repo)
   - If relevant code changed after `updated`, flag as NEEDS_UPDATE

2. Check for structural issues:
   - Scan for contradictions between pages
   - Find orphan pages with no inbound wikilinks
   - List unresolved wikilinks (referenced but no page exists)
   - Spot missing cross-references where pages discuss the same topic but don't link
   - Verify all pages have complete YAML frontmatter

3. Check empty directories that should have content:
   - wiki/product/ — should have product architecture, pipeline, data models
   - wiki/growth/ — should have pricing, distribution, email strategy
   - wiki/competitors/ — should have competitive landscape
   - wiki/concepts/ — should have SaaS metrics, business models
   - wiki/analysis/ — should have decision logs, research syntheses
   - wiki/people/ — should have notable people/founders

4. Verify wiki/index.md is up to date with all existing pages.

5. Report summary:
   ```
   Wiki Health Report
   ==================
   Total pages: X
   Current (<14 days): X
   Stale (>14 days): X
   Needs update (code changed): X
   Empty categories: X
   Unresolved wikilinks: X
   Orphan pages: X

   Action items:
   - [page] — stale since YYYY-MM-DD, run /wiki-ingest page-name
   - [category] — empty, suggest pages to create
   - [[Link Target]] — referenced but doesn't exist
   ```

6. If any pages need updating, offer to run /wiki-ingest for them.

This is a read-only audit — it reports but does not modify wiki pages.
