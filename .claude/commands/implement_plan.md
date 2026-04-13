---
description: Implement technical plans from docs/plans with verification
---

# Implement Plan

## Context Loading (profile:implement)
Before exploring the codebase, read these files from `.context/`:
- `.context/architecture.md` — project structure, tech stack, deployment
- `.context/patterns.md` — code patterns and exemplar files to follow
- `.context/commands-reference.md` — test commands you'll need to run
- `.context/git-workflow.md` — pre-commit testing requirements
- The relevant `.context/wiki/` page for your task domain (e.g., `pipeline-flow.md` for pipeline work, `api-routes.md` for API changes, `data-models.md` for DB work)
Only explore raw source files after consulting wiki pages. If you find wiki content that's outdated, append a note to `.context/wiki/corrections.md`.

You are tasked with implementing an approved technical plan from `docs/plans/`. These plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
- Read the plan completely and check for any existing checkmarks (- [x])
- Read the original ticket and all files mentioned in the plan
- **Read files fully** - never use limit/offset parameters, you need complete context
- Think deeply about how the pieces fit together
- Create a todo list to track your progress
- Use specialized agents **strategically** when needed (see Agent-Powered Implementation section)
- Start implementing if you understand what needs to be done

If no plan path provided, ask for one.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.

If you encounter a mismatch:
- STOP and think deeply about why the plan can't be followed
- Present the issue clearly:
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  How should I proceed?
  ```

## Verification Approach

After implementing a phase:
- Run the success criteria checks (usually `make check test` covers everything)
- Fix any issues before proceeding
- Update your progress in both the plan and your todos
- Check off completed items in the plan file itself using Edit
- **Pause for human verification**: After completing all automated verification for a phase, pause and inform the human that the phase is ready for manual testing. Use this format:
  ```
  Phase [N] Complete - Ready for Manual Verification

  Automated verification passed:
  - [List automated checks that passed]

  Please perform the manual verification steps listed in the plan:
  - [List manual verification items from the plan]

  Let me know when manual testing is complete so I can proceed to Phase [N+1].
  ```

If instructed to execute multiple phases consecutively, skip the pause until the last phase. Otherwise, assume you are just doing one phase.

do not check off items in the manual testing steps until confirmed by the user.


## Agent-Powered Implementation

Use specialized agents from `.claude/agents/` strategically during implementation to verify assumptions and maintain consistency.

### When to Use Agents

Unlike planning (which uses agents extensively upfront), implementation should use agents **selectively** when you encounter specific situations:

#### 1. **When Plan Doesn't Match Reality**

If you find the codebase structure differs from what the plan describes:

```
Use Task tool with:
- codebase-analyzer: "Analyze how [component] actually works in [specific files]"
- codebase-locator: "Find all places where [function/endpoint] is used"
```

This helps understand WHY the mismatch exists before proposing changes.

#### 2. **Before Writing New Code**

To maintain consistency with existing patterns:

```
Use Task tool with:
- codebase-pattern-finder: "Find existing implementations of [component type] to model after"
```

Ensures your code matches codebase conventions the plan may not detail.

#### 3. **When Debugging Integration Issues**

If components aren't connecting as expected:

```
Use Task tool with:
- codebase-analyzer: "Trace data flow from [entry point] to [destination]"
- codebase-locator: "Find all callers of [modified interface]"
```

Identifies unexpected dependencies or integration points.

#### 4. **For Complex Refactoring**

When changing code structure across multiple files:

```
Use Task tool with:
- codebase-locator: "Find all files importing [module being refactored]"
- codebase-pattern-finder: "Show how similar refactoring was done for [comparable feature]"
```

Ensures comprehensive changes without breaking existing code.

### Agent Usage Guidelines

**Key Differences from Planning:**
- **Planning**: Uses agents proactively upfront for comprehensive research
- **Implementation**: Uses agents reactively for specific verification and debugging

**Best Practices:**
1. **Read files first** - Try to solve issues by reading code before spawning agents
2. **Specific prompts** - Give agents exact file paths and component names
3. **Targeted use** - Use agents for specific blockers, not general exploration
4. **Verify findings** - Read the files agents identify to confirm their analysis

### Available Agents Reference

Located in `.claude/agents/`:
- **humanlayer/** - Codebase understanding
  - `codebase-locator` - Find files and components
  - `codebase-analyzer` - Understand implementation details
  - `codebase-pattern-finder` - Find similar implementations
  - `thoughts-locator` - Find historical context
  - `web-search-researcher` - Research external docs
- **testing/** - Testing specialists
- **core/** - Core development agents
- **operations/** - Deployment and infrastructure

## If You Get Stuck

When something isn't working as expected:
- First, read and understand all relevant code yourself
- Consider if the codebase has evolved since the plan was written
- **Use targeted agents** (see Agent-Powered Implementation above) for specific investigation
- Present the mismatch clearly with evidence from both plan and actual code
- Ask for guidance on how to proceed

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

Remember: You're implementing a solution, not just checking boxes. Keep the end goal in mind and maintain forward momentum.