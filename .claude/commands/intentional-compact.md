# Claude Command: Compact Context

This command compacts the agent’s context window by summarizing all progress into `progress.md`.

## Usage


## What This Command Does

1. **Write Summary**: Appends to `progress.md`:
   - Current approach
   - Steps completed so far
   - Current failure being addressed
2. **Clear Context**: Instructs agent to forget prior conversation except `progress.md`.

## Example Output in `progress.md`

```markdown
## Approach
<Brief strategy summary>

## Steps Done
- Step 1
- Step 2

## Current Failure
<Error description and next action>