# Claude Command: Compact Context

This command compacts the agent's context window by summarizing all progress into `progress.md` with intelligent archival when the file becomes too large.

## Usage

The command automatically manages PROGRESS.md size and archives old completed projects to maintain optimal context window performance.

## What This Command Does

### 1. **Archive Management** (Automatic when PROGRESS.md > 500 lines)
- **Check File Size**: Counts lines in current PROGRESS.md
- **Archive Old Projects**: Moves completed projects >30 days old to weekly archive files
- **Update Timeline**: Adds archived projects to `.claude/history/TIMELINE.md`
- **Preserve Details**: All technical implementation details preserved in archives

### 2. **Archive File Organization**
- **Directory Structure**: `.claude/history/YYYY/MMM/DD-MMM-YYYY.md`
- **Naming Convention**: Sunday week start (e.g., `03-Nov-2025.md` for week of Nov 3-9)
- **Content**: Full project details with metadata headers
- **Cross-References**: Master timeline for navigation across archives

### 3. **Current Progress Update**
- **Write Summary**: Appends new progress to `PROGRESS.md`:
  - Current approach
  - Steps completed so far  
  - Current failure being addressed
- **Keep Recent**: Maintains last 30 days of completed projects
- **Active Work**: All ongoing/active projects remain in main file

### 4. **Clear Context**
Instructs agent to forget prior conversation except current `PROGRESS.md` and archive system.

## Archive System Details

### File Structure
```
.claude/history/
├── TIMELINE.md (Master index)
├── 2025/
│   ├── Nov/
│   │   ├── 03-Nov-2025.md
│   │   ├── 10-Nov-2025.md
│   │   └── 17-Nov-2025.md
│   └── Dec/
└── 2026/
```

### Weekly Archive Format
```markdown
# Week of DD-MMM-YYYY to DD-MMM-YYYY
<!-- Archive created: YYYY-MM-DD -->
<!-- Projects: Project1, Project2, ... -->

## Completed Projects This Week
[Full technical implementation details]
```

### Archive Trigger Logic
1. **Line Count Check**: If PROGRESS.md > 500 lines
2. **Age Analysis**: Identify completed projects marked with ✅ COMPLETE
3. **Date Calculation**: Find projects completed >30 days ago
4. **Week Assignment**: Calculate Sunday week start for target archive
5. **Content Migration**: Move full project details to appropriate weekly file
6. **Timeline Update**: Add entries to master TIMELINE.md
7. **Cross-Reference**: Maintain links between current and archived content

## Example Output in `PROGRESS.md`

```markdown
## Current Status
<Current approach and active work>

## Recently Completed (Last 30 Days)
- Recent Project 1 ✅ COMPLETE
- Recent Project 2 ✅ COMPLETE

## Approach
<Brief strategy summary for current work>

## Steps Done
- Step 1 ✅
- Step 2 ✅
- Step 3 (in progress)

## Current Failure
<Error description and next action>

---
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*
```

## Benefits
- **Optimal Performance**: PROGRESS.md stays under 500 lines
- **Zero Data Loss**: All implementation details preserved in weekly archives
- **Quick Navigation**: Master timeline provides fast access to historical projects  
- **Scalable**: Handles years of development history efficiently
- **Context Focus**: Agent loads only relevant recent progress