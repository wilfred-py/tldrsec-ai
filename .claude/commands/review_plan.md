---
description: Review implementation plans with structured architecture, code quality, test, and performance analysis
---

# Review Plan

## Context Loading (profile:review)
Before reviewing, read from the Obsidian vault wiki (`/Users/wilf/Software/Obsidian/tldrsec-ai/wiki/`):
- `wiki/product/` — product architecture, patterns, exemplar files
- `wiki/sec/` — SEC filing domain knowledge
- The relevant wiki page for the plan's domain
Use wiki knowledge to catch architectural mismatches without re-exploring the raw codebase.

You are tasked with reviewing a technical implementation plan before code changes begin. Your goal is to surface concrete tradeoffs, give opinionated recommendations mapped to the user's engineering preferences, and get explicit buy-in before proceeding.

## Engineering Preferences (always use these to guide recommendations)

Reference the Engineering Preferences section in CLAUDE.md. Key principles:
- **DRY is important** - Flag repetition aggressively
- **Well-tested is non-negotiable** - Rather too many tests than too few
- **"Engineered enough"** - Not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity)
- **Handle more edge cases, not fewer** - Thoughtfulness > speed
- **Explicit over clever** - Readability and maintainability trump cleverness

**Core Philosophy: Elon's 5-Step Engineering Algorithm and Test-Driven Development (TDD)**

**Elon's 5-Step Engineering Algorithm**

Apply this rigorously during requirements analysis and design (Steps 1–2 of the process) to ensure the leanest, most fundamental implementation before phasing.

1. **Question every requirement**
   Challenge all assumptions and specifications, regardless of source. Ask "why" repeatedly until requirements are undeniably necessary and not dumb.

2. **Delete any part or process**
   Ruthlessly remove unnecessary requirements, features, components, or steps. Aim to delete at least 50%; only add back ~10% later if proven essential.

3. **Simplify and optimize**
   Only after maximum deletion. Streamline what remains—avoid optimizing things that should not exist.

4. **Accelerate cycle time**
   Speed up development only after steps 1–3. Use small, frequent TDD increments and checkpoints.

5. **Automate**
   Last step—automate remaining essential processes.

## Initial Response

When this command is invoked:

1. **Check if a plan path was provided as a parameter**:
   - If yes, read it FULLY (no limit/offset) and begin the review
   - If no, check `docs/plans/` for recent plans and ask which one to review

2. **Ask for review scope** using AskUserQuestion:

```
I'll review this plan thoroughly before any code changes.

Which review depth do you want?
```

Options:
- **BIG CHANGE**: Work through all 4 sections interactively (Architecture -> Code Quality -> Tests -> Performance), surfacing up to 4 top issues per section
- **SMALL CHANGE**: Work through all 4 sections but only the single most important issue per section

Then wait for the user's choice before proceeding.

## Review Sections

Work through each section in order. **After each section, pause and ask for feedback before moving on.**

### Section 1: Architecture Review

Evaluate the plan against the existing codebase:
- Overall system design and component boundaries
- Dependency graph and coupling concerns
- Data flow patterns and potential bottlenecks
- Scaling characteristics and single points of failure
- Security architecture (auth, data access, API boundaries)

**Research approach**: Use codebase-locator and codebase-analyzer agents to verify the plan's assumptions about the current architecture. Don't guess - verify.

### Section 2: Code Quality Review

Evaluate:
- Code organization and module structure proposed
- DRY violations - be aggressive here (per engineering preferences)
- Error handling patterns and missing edge cases (call these out explicitly)
- Technical debt the plan might introduce or miss
- Whether the approach is "engineered enough" - not under-engineered (fragile) and not over-engineered (premature abstraction)

### Section 3: Test Review

Evaluate:
- Test coverage gaps (unit, integration, e2e) relative to the plan
- Test quality and assertion strength in proposed tests
- Missing edge case coverage - be thorough (per engineering preferences)
- Untested failure modes and error paths
- Whether the TDD structure (Red-Green-Refactor) is properly applied

### Section 4: Performance Review

Evaluate:
- N+1 queries and database access patterns
- Memory-usage concerns
- Caching opportunities
- Slow or high-complexity code paths
- Impact on existing system performance

## Issue Presentation Format

For EVERY specific issue found (bug, smell, design concern, or risk):

```markdown
### Issue [N]: [Concise Title]

**Problem**: [Concrete description with file and line references where applicable]

**Options**:

**A) [Action option]** (Recommended)
- Effort: [Low/Medium/High]
- Risk: [What could go wrong]
- Impact: [Effect on other code]
- Maintenance: [Ongoing burden]
- Why recommended: [Map to specific engineering preference]

**B) [Alternative option]**
- Effort: [Low/Medium/High]
- Risk: [What could go wrong]
- Impact: [Effect on other code]
- Maintenance: [Ongoing burden]

**C) Do nothing**
- Risk: [What happens if we skip this]
- When acceptable: [Circumstances where this is fine]
```

Then use AskUserQuestion with the recommended option FIRST, clearly labeling each option with the issue number and letter (e.g., "Issue 1A", "Issue 1B", "Issue 1C").

## AskUserQuestion Format

When presenting issues for a section, batch them into a single AskUserQuestion call. Each question should:
- Reference the issue number in the header
- List options with clear labels (e.g., "1A: Extract shared validation (Recommended)")
- Put the recommended option first
- Include "Do nothing" as the last option where reasonable

Example:
```
questions:
  - question: "Issue 1: [Title] - Which approach?"
    header: "Issue 1"
    options:
      - label: "1A: [Recommended action] (Recommended)"
        description: "[Brief rationale mapped to preferences]"
      - label: "1B: [Alternative]"
        description: "[Brief rationale]"
      - label: "1C: Do nothing"
        description: "[When this is acceptable]"
    multiSelect: false
```

## Workflow Rules

1. **Do NOT assume priorities on timeline or scale** - Ask when unclear
2. **Do NOT make code changes during review** - This is analysis only
3. **Do NOT skip sections** - Even if you think they're fine, briefly confirm "no issues found"
4. **Pause after each section** - Wait for user feedback before proceeding
5. **After all sections complete**, present a summary of all decisions made and ask if the user wants to update the plan before implementation
6. **Use agents for verification** - Don't guess about the current codebase state. Use codebase-locator and codebase-analyzer to verify claims in the plan

## Post-Review

After all 4 sections are reviewed and decisions are captured:

1. **Summarize all decisions** in a concise list:
   ```
   ## Review Decisions Summary
   - Issue 1: [Decision] - [Brief rationale]
   - Issue 2: [Decision] - [Brief rationale]
   ...
   ```

2. **Ask if the plan should be updated** before implementation:
   - If yes, apply the agreed changes to the plan file
   - Update the plan's frontmatter with review metadata
   - Add a `## Review Notes` section to the plan documenting decisions

3. **Confirm readiness** for `/implement_plan`

## Important Notes

- This command is designed to run AFTER `/create_plan` and BEFORE `/implement_plan`
- The review should reference the actual codebase, not just the plan text
- Be opinionated but transparent about your reasoning
- Map every recommendation back to a specific engineering preference
- When the plan references existing code, verify it still matches reality
- If a plan was written days ago, the codebase may have changed - check
