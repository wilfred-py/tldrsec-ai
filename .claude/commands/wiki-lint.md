Wiki Lint: Check .context/ wiki health and flag stale pages.

Steps:

1. For each .context/wiki/*.md file:
   - Read the `last_verified` date from YAML frontmatter
   - If older than 14 days from today, flag as STALE
   - Read the `sources` list and check if any source files were modified after `last_verified` (use `git log --since`)
   - If modified sources found, flag as NEEDS_UPDATE

2. Check .context/active-plans/README.md:
   - Verify all linked plans still exist
   - Flag plans that appear completed for archival

3. Check .context/wiki/corrections.md:
   - Count pending corrections
   - List which pages have unresolved corrections

4. Report summary:
   ```
   Wiki Health Report
   ==================
   Total pages: X
   Verified (current): X
   Stale (>14 days): X
   Needs update (source changed): X
   Pending corrections: X
   
   Action items:
   - [page] — stale since YYYY-MM-DD, run /wiki-ingest page-name
   - [page] — sources modified, run /wiki-ingest page-name
   ```

5. If any pages need updating, offer to run /wiki-ingest for them.

This is a read-only audit — it reports but does not modify wiki pages.
