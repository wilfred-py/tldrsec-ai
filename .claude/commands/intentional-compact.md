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

### Step 4: Synchronize PROGRESS.md with TIMELINE.md (Bidirectional Sync)

**ALWAYS perform this step, regardless of whether archival occurred.**

This is a **bidirectional sync** - both files must reflect the same current state.

#### 4A: Update PROGRESS.md (Detailed Context for Fresh Sessions)

PROGRESS.md is the **detailed context file** for fresh agent sessions. It must contain:
- Full implementation details (root causes, fixes, file paths, code snippets)
- Technical specifics needed to continue work or understand decisions
- Enough context that a new session can pick up where the last left off

1. **Update PROGRESS.md header**:
   - Update "Date" to today's date
   - Update "Branch" to current git branch: `git branch --show-current`
   - Update "Status" to reflect current work
   - Update "Last Updated" at bottom of file

2. **Ensure Recently Completed section has DETAILED entries**:
   - Each project should have implementation details, not just one-liners
   - Include: root cause, fix approach, files modified, verification steps
   - Format:
     ```markdown
     ### [Project Name] ✅ (YYYY-MM-DD)
     [Brief description of what was done and why]

     **Root Cause/Issue**: [What was wrong]
     **Fix**: [What was done to fix it]
     **Files**: `path/to/file.ts`, `another/file.ts`
     **Verification**: [How it was verified]
     ```

3. **Move completed Current Session work to Recently Completed**:
   - If previous "Current Session" work is complete, move it with full details
   - Start new "Current Session" if there's active work

4. **Remove projects older than 30 days** from "Recently Completed":
   - These should already be in weekly archive files
   - Keep PROGRESS.md focused on actionable recent context

#### 4B: Update TIMELINE.md (High-Level Master Index)

TIMELINE.md is the **master timeline index**. It provides:
- Quick chronological overview of all work
- Links to archives for deep dives
- High-level status, NOT detailed implementation

1. **Update Recent Activity table**:
   - Simple table format: Date | Project | Status
   - One line per project, no implementation details
   - Point to PROGRESS.md for details

2. **Update Archive Statistics**:
   - Count current PROGRESS.md lines: `wc -l PROGRESS.md`
   - Update "Current PROGRESS.md Lines" to actual count
   - Update "Last Sync" date to today

3. **Verify archive links work**:
   - Each weekly entry should have valid relative link
   - Historical details live in archive files, not TIMELINE.md

### Step 5: Update Progress Summary

1. **Summarize current PROGRESS.md state**:
   - Report current line count
   - List active/in-progress work
   - List recently completed work (last 30 days)

2. **Report archival actions taken**:
   - If archived: "Archived [N] project(s) to [file path(s)]"
   - If not archived: "No archival performed (PROGRESS.md: [X] lines, threshold: 500)"

3. **Report TIMELINE.md sync status** (MANDATORY):
   - State: "TIMELINE.md updated with current statistics:"
   - Report: "Current PROGRESS.md Lines: [X]"
   - Report: "Total Archived Projects: [N]"
   - Report: "Last Archive Update: [date]"
   - If recent completions added: "Recent completions (<30 days) now visible in TIMELINE.md"

4. **Clear context instruction**:
   - State: "Context management complete. TIMELINE.md is now synchronized with current PROGRESS.md state."
   - State: "For future sessions, refer to PROGRESS.md for current state and TIMELINE.md for complete historical context."

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
- **Recent Completed (Last 30 Days)**: See main `PROGRESS.md` and "Recent Activity" below
- **Historical Archives**: See weekly files below

---

## Recent Activity (Not Yet Archived)

**Projects completed in last 30 days** (tracked in PROGRESS.md):
- [Project Name] (YYYY-MM-DD) 🔄 Active in PROGRESS.md
- [Another Recent Project] (YYYY-MM-DD) 🔄 Active in PROGRESS.md

*These will be archived once they are older than 30 days AND PROGRESS.md exceeds 500 lines*

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

- **PROGRESS.md = DETAILED CONTEXT** - Full implementation details for fresh agent sessions
- **TIMELINE.md = HIGH-LEVEL INDEX** - Quick chronological overview with links to archives
- **BIDIRECTIONAL SYNC IS MANDATORY** - Both files must reflect the same projects, but at different detail levels
- **PROGRESS.md is the primary reference** - New sessions should read PROGRESS.md for context
- **TIMELINE.md is for long-term history** - When you need to trace events over months
- **Always preserve full technical details in PROGRESS.md** - Root causes, fixes, files, verification
- **Keep TIMELINE.md entries brief** - Just date, project name, status in a table
- **Archive files have full details** - When projects are >30 days old, archive preserves everything
- **Keep PROGRESS.md under 500 lines** for optimal context window performance
- **Never archive active/in-progress work** - only completed projects >30 days old
