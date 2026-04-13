Wiki Ingest: Update or create a wiki page in .context/wiki/.

For the specified wiki page (or all pages if none specified):

1. Read the `sources` list from the page's YAML frontmatter
2. Read each source file (use glob patterns if specified)
3. Distill into a concise summary: purpose, key functions/exports, data flow, gotchas
4. Update the `last_verified` date to today
5. Keep each page under 200 lines (~4 KB)
6. Preserve the existing structure — update content, don't restructure

If creating a new page, use this template:
```markdown
---
last_verified: YYYY-MM-DD
sources: [file/paths/here]
---
# Page Title

[distilled summary]
```

After updating, check .context/wiki/corrections.md for any pending corrections related to this page and resolve them.

Usage: /wiki-ingest [page-name]
Examples:
  /wiki-ingest pipeline-flow
  /wiki-ingest data-models
  /wiki-ingest (updates all pages)
