---
description: Compact context by archiving old completed projects and updating progress tracking
---

# Compact Context

You are tasked with compacting the context window by managing PROGRESS.md size and archiving completed projects.

## Process

### Step 1: Analyze Current State

1. **Read PROGRESS.md completely**:
   - Count total lines using: `wc -l PROGRESS.md`
   - Identify all sections marked with `✅ COMPLETE` or similar completion markers
   - Note the completion date for each completed section

2. **Read TIMELINE.md completely**:
   - Review `.claude/history/TIMELINE.md` for existing archive structure
   - Note the last archive update date

3. **Check archive directory**:
   - Run: `ls -la .claude/history/` to see current archive structure
   - Identify the most recent archive file

### Step 2: Determine Archival Needs

**Archive Trigger Conditions** (ALL must be true):
- PROGRESS.md exceeds **500 lines** AND
- There are completed projects older than **30 days**

**If conditions NOT met**:
- Report: "No archival needed. PROGRESS.md is [X] lines (threshold: 500). No projects older than 30 days."
- Skip to Step 5

**If conditions ARE met**:
- List projects to be archived with their completion dates
- Proceed to Step 3

### Step 3: Archive Old Projects (if needed)

1. **Calculate target archive file**:
   - Find the Sunday that starts the week of the project's completion date
   - Format: `DD-MMM-YYYY.md` (e.g., `24-Nov-2025.md`)
   - Path: `.claude/history/[Year]/[Month]/DD-MMM-YYYY.md` (e.g., `.claude/history/2025/Nov/24-Nov-2025.md`)

2. **Create or update the archive file**:
   - If file doesn't exist, create it with header:
     ```markdown
     # Week of DD-MMM-YYYY to DD-MMM-YYYY
     <!-- Archive created: YYYY-MM-DD -->
     <!-- Projects: [comma-separated list] -->

     ## Completed Projects This Week
     ```
   - If file exists, append the new project to the existing content
   - Include FULL technical implementation details (approach, steps completed, files modified, verification results)

3. **Update TIMELINE.md**:
   - Add entry for the week if not present:
     ```markdown
     **Week of DD-MMM-YYYY** → [DD-MMM-YYYY.md]([Year]/[Month]/DD-MMM-YYYY.md)
     - [Project Name] (YYYY-MM-DD) ✅
     ```
   - Update Archive Statistics section with new counts

4. **Remove archived content from PROGRESS.md**:
   - Remove the full project section that was archived
   - Add reference at bottom: `*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*`

### Step 4: Synchronize TIMELINE.md with PROGRESS.md

Ensure TIMELINE.md accurately reflects all archived content:

1. **Verify Archive Statistics are current**:
   - Count total archived projects
   - Update "Current PROGRESS.md Lines" count
   - Update "Last Archive Update" date to today

2. **Verify all archive links work**:
   - Each weekly entry should have a valid relative link
   - Each project bullet should accurately describe what was archived

### Step 5: Update Progress Summary

1. **Summarize current PROGRESS.md state**:
   - Report current line count
   - List active/in-progress work
   - List recently completed work (last 30 days)

2. **Report archival actions taken**:
   - If archived: "Archived [N] project(s) to [file path(s)]"
   - If not archived: "No archival performed"

3. **Clear context instruction**:
   - State: "Context compacted. For future sessions, refer to PROGRESS.md for current state and TIMELINE.md for historical context."

## Archive File Format Reference

### Weekly Archive File Structure
```markdown
# Week of DD-MMM-YYYY to DD-MMM-YYYY
<!-- Archive created: YYYY-MM-DD -->
<!-- Projects: Project1, Project2, ... -->

## Completed Projects This Week

### [Project Name] - COMPLETE (YYYY-MM-DD)

#### Approach
[Brief description of what was accomplished and why]

#### Steps Completed
1. ✅ **[Step description]**
   - [Technical details]
   - [Files modified]

2. ✅ **[Next step]**
   ...

#### Verification Results
- ✅ [Test/check that passed]
- ✅ [Another verification]

#### Files Modified
- `path/to/file.ext` - [Description of change]

---
```

### TIMELINE.md Structure
```markdown
# Master Timeline - Project History Archive

## Navigation
- **Current Active Work**: See main `PROGRESS.md`
- **Recent Completed (Last 30 Days)**: See main `PROGRESS.md`
- **Historical Archives**: See weekly files below

---

## 2025

### [Month] 2025

**Week of DD-MMM-YYYY** → [DD-MMM-YYYY.md]([Year]/[Month]/DD-MMM-YYYY.md)
- [Project Name] (YYYY-MM-DD) ✅
- [Another Project] (YYYY-MM-DD) ✅

---

## Archive Statistics
- **Total Archived Projects**: [count]
- **Current PROGRESS.md Lines**: [count]
- **Last Archive Update**: YYYY-MM-DD
- **Archive System**: ✅ ACTIVE
```

## Helper: Calculate Sunday Week Start

To find the Sunday that starts a given week:
1. Take the completion date
2. Subtract days to reach the previous Sunday (or same day if already Sunday)
3. Format as `DD-MMM-YYYY`

Example: If project completed on Wednesday Nov 27, 2025:
- Nov 27 is a Thursday → subtract 4 days
- Sunday week start = Nov 24, 2025
- Archive file = `24-Nov-2025.md`

## Remember

- **Always preserve full technical details** when archiving - nothing gets summarized or lost
- **Update both TIMELINE.md AND the archive file** when archiving
- **Keep PROGRESS.md under 500 lines** for optimal context window performance
- **Never archive active/in-progress work** - only completed projects >30 days old
