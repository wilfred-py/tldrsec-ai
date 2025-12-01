---
date: 2025-11-30T12:00:00+11:00
researcher: Claude Code
git_commit: fabb9c35d894aca537c532e025431bf649b42c81
branch: feature/validation-dry-run-testing
repository: tldrsec-ai
topic: "Why is the .claude/commands/intentional-compact.md archive system not creating new archive files since November 10, 2025?"
tags: [research, archive-system, claude-commands, progress-tracking]
status: complete
last_updated: 2025-11-30
last_updated_by: Claude Code
---

# Research: Archive System Not Updating Since November 10, 2025

**Date**: 2025-11-30T12:00:00+11:00
**Researcher**: Claude Code
**Git Commit**: fabb9c35d894aca537c532e025431bf649b42c81
**Branch**: feature/validation-dry-run-testing
**Repository**: tldrsec-ai

## Research Question
Why is the `.claude/commands/intentional-compact.md` archive system not adding archived projects as expected? No new archive files have been created since 10-Nov-2025, despite multiple changes made to the codebase.

## Summary

**ROOT CAUSE IDENTIFIED**: The `intentional-compact.md` file is **missing required YAML frontmatter** that would register it as a proper slash command.

### The Problem

The file starts with:
```markdown
# Claude Command: Compact Context
```

But working slash commands start with YAML frontmatter like:
```markdown
---
description: Create git commits for session changes with clear, atomic messages
---
```

Without the frontmatter containing a `description` field, the command:
1. Is NOT registered in Claude Code's available slash commands list
2. When invoked, may be treated as documentation rather than executable instructions
3. Does not provide explicit step-by-step instructions for Claude to execute

### Secondary Issues

The command file also:
1. **Describes behavior** rather than **instructing actions** - it explains *what* should happen but doesn't tell Claude *how* to do it step-by-step
2. **Lacks imperative instructions** - Compare to `commit.md` which says "Run `git status`", "Use `git add`", etc.
3. **No explicit workflow steps** - Other working commands have numbered steps with clear actions

## Detailed Findings

### Current System State

| Component | Location | Status |
|-----------|----------|--------|
| Command Definition | `.claude/commands/intentional-compact.md` | Exists (98 lines) |
| PROGRESS.md | `PROGRESS.md` | 188 lines (below 500 threshold) |
| TIMELINE.md | `.claude/history/TIMELINE.md` | Last updated: 2025-11-13 |
| Latest Archive | `.claude/history/2025/Nov/10-Nov-2025.md` | Created: 2025-11-14 01:38 |

### Archive Directory Structure
```
.claude/history/
├── TIMELINE.md (2728 bytes, last modified Nov 14)
└── 2025/
    ├── Oct/
    │   └── 27-Oct-2025.md
    └── Nov/
        ├── 03-Nov-2025.md
        └── 10-Nov-2025.md
```

### How the Archive System Works

The `intentional-compact.md` file defines a **manual workflow** with these trigger conditions:

1. **Archive Trigger**: When PROGRESS.md exceeds **500 lines**
2. **Age Analysis**: Identifies completed projects marked with `✅ COMPLETE`
3. **Date Calculation**: Archives projects completed **>30 days ago**
4. **Week Assignment**: Calculates Sunday week start for target archive file

### Why No New Archives Have Been Created

**Primary Cause: Missing YAML Frontmatter**

The `intentional-compact.md` file lacks the required frontmatter:

| Command File | Has Frontmatter | Registered? |
|-------------|-----------------|-------------|
| `commit.md` | ✅ `description: Create git commits...` | ✅ Yes |
| `research_codebase.md` | ✅ `description: Document codebase...` | ✅ Yes |
| `implement_plan.md` | ✅ `description: Implement technical plans...` | ✅ Yes |
| `push-pr-review-merge.md` | ✅ `description: Push committed changes...` | ✅ Yes |
| **`intentional-compact.md`** | ❌ None | ❌ No |

**Secondary Causes:**

1. **Command structure is descriptive, not imperative** - File explains the system but doesn't instruct Claude to take specific actions
2. **No explicit steps** - Unlike working commands that say "1. Do X, 2. Do Y", this file just describes what "should happen"
3. **PROGRESS.md is only 188 lines** - Even if command worked, it's below 500-line threshold

### Timeline of Archive Activity

| Date | Action | File Modified |
|------|--------|---------------|
| Nov 14, 2025 01:05 | Created Oct archive | `27-Oct-2025.md` |
| Nov 14, 2025 01:05 | Created Nov 03 archive | `03-Nov-2025.md` |
| Nov 14, 2025 01:38 | Created Nov 10 archive | `10-Nov-2025.md` |
| Nov 14, 2025 01:38 | Updated timeline | `TIMELINE.md` |
| Since then | No activity | - |

### What Would Trigger Archival

Based on the command definition, archival would occur if:

1. Someone runs `/intentional-compact` command
2. AND PROGRESS.md has grown past 500 lines
3. AND there are projects marked `✅ COMPLETE` older than 30 days

Since PROGRESS.md is currently 188 lines, even invoking the command would likely just update the progress summary without archiving anything (no projects old enough).

## Code References

- [.claude/commands/intentional-compact.md:60-67](.claude/commands/intentional-compact.md#L60-L67) - Archive trigger logic description
- [.claude/history/TIMELINE.md](.claude/history/TIMELINE.md) - Master timeline last updated Nov 13
- [.claude/history/2025/Nov/10-Nov-2025.md](.claude/history/2025/Nov/10-Nov-2025.md) - Most recent archive

## Architecture Documentation

### System Design

The archive system is **documentation-driven**, not code-driven:

1. **Command File**: `.claude/commands/intentional-compact.md` is a prompt/instruction set
2. **Execution**: Relies on Claude Code interpreting and following the instructions
3. **Manual Trigger**: User must invoke `/intentional-compact`
4. **Threshold Check**: Claude Code checks if PROGRESS.md > 500 lines
5. **Age Filter**: Archives only projects > 30 days old
6. **File Creation**: Claude Code creates archive files using Write tool

### Archive File Format

Each weekly archive follows this structure:
```markdown
# Week of DD-MMM-YYYY to DD-MMM-YYYY
<!-- Archive created: YYYY-MM-DD -->
<!-- Projects: Project1, Project2, ... -->

## Completed Projects This Week
[Full technical implementation details]
```

## Historical Context

The archive system was set up around November 13-14, 2025:
- TIMELINE.md statistics show "Last Archive Update: 2025-11-13"
- Archive files were created on November 14 based on file timestamps
- The system successfully compacted PROGRESS.md from 556 lines to 188 lines

## Evidence: File Structure Comparison

**Working command (`commit.md`):**
```
---
description: Create git commits for session changes with clear, atomic messages
---

# Commit Changes

You are tasked with creating git commits...

## Process:

1. **Think about what changed:**
   - Review the conversation history...
   - Run `git status` to see current changes
   ...
```

**Broken command (`intentional-compact.md`):**
```
# Claude Command: Compact Context

This command compacts the agent's context window...

## Usage

The command automatically manages PROGRESS.md size...
```

The working command has:
- YAML frontmatter with `description`
- Direct address to Claude ("You are tasked with...")
- Numbered action steps with specific commands to run

The broken command has:
- No frontmatter
- Third-person documentation style
- Description of behavior rather than instructions

## Open Questions

1. **Why was frontmatter omitted?** Was this intentional or an oversight when the file was created?
2. **Has `/intentional-compact` ever worked?** Given the missing frontmatter, it may never have been properly registered

---

*Research completed 2025-11-30*
*Updated after user feedback that command was invoked multiple times*
