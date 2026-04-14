Wiki Ingest: Update or create a wiki page in the Obsidian vault.

Vault path: /Users/wilf/Software/Obsidian/tldrsec-ai/
Vault schema: Read the vault's CLAUDE.md for page conventions, frontmatter format, and directory structure.

For the specified wiki page (or all pages if none specified):

1. Read the `sources` list from the page's YAML frontmatter
2. Read each source file (use glob patterns if specified)
3. Distill into a concise summary: purpose, key functions/exports, data flow, gotchas
4. Update the `updated` date in frontmatter to today
5. Keep each page under 200 lines (~4 KB)
6. Preserve the existing structure — update content, don't restructure
7. Use `[[wikilinks]]` for cross-references to other vault pages

If creating a new page, use the vault's frontmatter template:
```markdown
---
title: Page Title
type: source | entity | concept | analysis | overview
category: sources | sec | product | growth | competitors | people | concepts | analysis
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags:
  - relevant-tag
sources:
  - "[[Source Page Name]]"
---

# Page Title

[distilled summary]
```

After updating, add new pages to `wiki/index.md` and append to `wiki/log.md`.

Usage: /wiki-ingest [page-name]
Examples:
  /wiki-ingest product/pipeline
  /wiki-ingest sec/form-4
  /wiki-ingest (updates all pages)
