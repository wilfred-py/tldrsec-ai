# Fix intentional-compact Archive System Implementation Plan

**Date**: 2025-11-30 08:06:18 +1100
**Git Commit**: fabb9c35d894aca537c532e025431bf649b42c81
**Branch**: feature/daily-pipeline-verification
**Repository**: tldrsec-ai

## Overview

The `/intentional-compact` slash command is not properly registered because it's missing required YAML frontmatter. Additionally, the command file describes behavior rather than providing imperative instructions for Claude to execute. This plan fixes both issues to ensure the archive system properly maintains `PROGRESS.md` and `.claude/history/TIMELINE.md` in sync.

## Current State Analysis

### Problem Summary
The research document [thoughts/shared/research/2025-11-30-archive-system-not-updating.md](thoughts/shared/research/2025-11-30-archive-system-not-updating.md) identified:

1. **Missing YAML frontmatter** - The file starts with `# Claude Command: Compact Context` instead of proper frontmatter
2. **Descriptive vs imperative style** - Explains what "should happen" rather than instructing Claude what to do
3. **No explicit workflow steps** - Unlike working commands that have numbered action steps

### Current File State
- [.claude/commands/intentional-compact.md](.claude/commands/intentional-compact.md) - 98 lines, missing frontmatter
- [PROGRESS.md](PROGRESS.md) - 119 lines (well below 500 threshold)
- [.claude/history/TIMELINE.md](.claude/history/TIMELINE.md) - Last updated Nov 13, 2025
- Last archive: [.claude/history/2025/Nov/10-Nov-2025.md](.claude/history/2025/Nov/10-Nov-2025.md) - Created Nov 14

### Key Discoveries
- Working commands like `commit.md` and `implement_plan.md` have YAML frontmatter with `description` field
- Working commands use imperative instructions: "You are tasked with...", "Run `git status`", etc.
- Archive files use format: `DD-MMM-YYYY.md` representing Sunday week start
- TIMELINE.md serves as master index linking to weekly archive files

## Desired End State

After this plan is complete:

1. `/intentional-compact` appears in Claude Code's available slash commands list
2. When invoked, Claude executes explicit steps to:
   - Check PROGRESS.md line count
   - Archive completed projects >30 days old (if >500 lines)
   - Update TIMELINE.md to match PROGRESS.md structure
   - Clear context for fresh start
3. TIMELINE.md and PROGRESS.md stay synchronized:
   - TIMELINE.md contains pointers to all archived work
   - PROGRESS.md contains current + last 30 days of completed work
   - Archive files contain full technical details

### Verification
- Run `/intentional-compact` and confirm it's recognized as a command
- Check that TIMELINE.md gets updated when new entries are archived
- Verify console output shows Claude executing the steps

## What We're NOT Doing

- **NOT changing archive file format** - The `DD-MMM-YYYY.md` naming convention works well
- **NOT modifying PROGRESS.md structure** - Current format is good
- **NOT automating archival** - This remains a manual command invocation
- **NOT changing the 500-line threshold** - Current threshold is appropriate

## Implementation Approach

Rewrite `intentional-compact.md` to:
1. Add proper YAML frontmatter with description
2. Convert descriptive content to imperative instructions
3. Add explicit numbered steps for Claude to follow
4. Include verification checks at each step

## Phase 1: Rewrite intentional-compact.md

### Overview
Completely rewrite the command file with proper frontmatter and imperative instructions.

### Changes Required

**File**: `.claude/commands/intentional-compact.md`

Replace the entire file with imperative instructions:

```markdown
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
```

### Success Criteria

#### Automated Verification:
- [x] File exists at `.claude/commands/intentional-compact.md`
- [x] File starts with `---` (YAML frontmatter)
- [x] File contains `description:` in frontmatter
- [x] Build passes: `npm run build`
- [x] Lint passes: `npm run lint` (pre-existing lint warnings in other files, not related to this change)

#### Manual Verification:
- [x] Command `/intentional-compact` appears in Claude Code's available commands
- [x] Running the command produces clear step-by-step output
- [x] Claude reports current PROGRESS.md line count (110 lines)
- [x] Claude checks archive conditions correctly (correctly identified no archival needed)

**Implementation Note**: Phase 1 complete - command registered and executes properly.

---

## Phase 2: Validate with Test Run

### Overview
Test the rewritten command to ensure it works correctly with current state.

### Test Steps

1. **Invoke the command**:
   - Run `/intentional-compact` in Claude Code

2. **Expected behavior (current state)**:
   - Claude reads PROGRESS.md (currently ~119 lines)
   - Claude reports: "No archival needed. PROGRESS.md is 119 lines (threshold: 500)."
   - Claude summarizes current state

3. **Verify TIMELINE.md sync**:
   - Check that TIMELINE.md statistics are accurate
   - Verify all archive links are valid

### Success Criteria

#### Automated Verification:
- [x] Command executes without errors
- [x] TIMELINE.md statistics match reality (13 archived projects, last update Nov 13)

#### Manual Verification:
- [x] Output shows clear step-by-step execution
- [x] No archival performed (correct since below threshold - 110 lines)
- [x] Summary accurately reflects current PROGRESS.md state

---

## Testing Strategy

### Unit Tests
Not applicable - this is a Claude command file, not code.

### Integration Tests
- Test command registration by checking available commands list
- Test execution produces expected output format

### Manual Testing Steps
1. Clear any previous session context
2. Invoke `/intentional-compact`
3. Verify output shows:
   - Step 1: State analysis with line counts
   - Step 2: Archival decision with reasoning
   - Step 5: Progress summary
4. Verify no files were incorrectly modified (since below threshold)

## Performance Considerations

None - this is a manual command that reads and writes markdown files.

## Migration Notes

None - this is a fix to an existing command file, not a data migration.

## References

- Research document: `thoughts/shared/research/2025-11-30-archive-system-not-updating.md`
- Working command example: `.claude/commands/commit.md`
- Working command example: `.claude/commands/implement_plan.md`
- Current TIMELINE.md: `.claude/history/TIMELINE.md`
- Latest archive: `.claude/history/2025/Nov/10-Nov-2025.md`
