---
description: Create detailed implementation plans through interactive research and iteration
---

# Implementation Plan

## Context Loading (profile:plan)
Before exploring the codebase, read from the Obsidian vault wiki (`/Users/wilf/Software/Obsidian/tldrsec-ai/wiki/`):
- `wiki/overview.md` — product goals, open questions, key metrics
- `wiki/product/` — product architecture, pipeline, data models
- `wiki/sec/` — if task involves SEC filings or EDGAR
- `wiki/companies/` — if task involves specific company data
Only read wiki pages relevant to the task. Skip raw source file exploration until wiki pages prove insufficient.

You are tasked with creating detailed implementation plans through an interactive, iterative process. You should be skeptical, thorough, and work collaboratively with the user to produce high-quality technical specifications.

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

**Integration Instructions**  
- In Step 1 (Context Gathering & Initial Analysis): Explicitly question and delete from the task description.  
- In Step 2 (Research & Discovery): Present deletion/simplification rationale and revised scope in findings/design options.  
- Document application of the 5 steps in the final plan under "Implementation Approach".  
- This complements TDD by preventing over-engineering upfront.

Every phase in the plan MUST follow the Red-Green-Refactor cycle:
1. **🔴 Red**: Write well-designed failing tests FIRST that define expected behavior
2. **🟢 Green**: Implement minimal code to make each test pass
3. **🔵 Refactor**: Clean up code while keeping all tests green

This creates maximum checkpoints - each failing test becomes a verifiable milestone.

## Initial Response

When this command is invoked:

1. **Check if parameters were provided**:
   - If a file path or ticket reference was provided as a parameter, skip the default message
   - Immediately read any provided files FULLY
   - Begin the research process

2. **If no parameters provided**, respond with:
```
I'll help you create a detailed implementation plan. Let me start by understanding what we're building.

Please provide:
1. The task/ticket description (or reference to a ticket file)
2. Any relevant context, constraints, or specific requirements
3. Links to related research or previous implementations

I'll analyze this information and work with you to create a comprehensive plan.

Tip: You can also invoke this command with a task file directly: `/create_plan docs/tasks/implement-feature.md`
For deeper analysis, try: `/create_plan think deeply about docs/tasks/implement-feature.md`
```

Then wait for the user's input.

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY**:
   - Task files (e.g., `docs/tasks/implement-feature.md`)
   - Research documents from `docs/research/`
   - Related implementation plans from `docs/plans/`
   - Any JSON/data files mentioned
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files
   - **CRITICAL**: DO NOT spawn sub-tasks before reading these files yourself in the main context
   - **NEVER** read files partially - if a file is mentioned, read it completely

2. **Spawn initial research tasks to gather context**:
   Before asking the user any questions, use specialized agents to research in parallel:

   - Use the **codebase-locator** agent to find all files related to the ticket/task
   - Use the **codebase-analyzer** agent to understand how the current implementation works
   - If relevant, use the **thoughts-locator** agent to find any existing thoughts documents about this feature
   - Use the **web-search-researcher** agent if external documentation is needed

   These agents will:
   - Find relevant source files, configs, and tests
   - Identify the specific directories to focus on (e.g., app/, lib/, services/)
   - Trace data flow and key functions
   - Return detailed explanations with file:line references

3. **Read all files identified by research tasks**:
   - After research tasks complete, read ALL files they identified as relevant
   - Read them FULLY into the main context
   - This ensures you have complete understanding before proceeding

4. **Analyze and verify understanding**:
   - Cross-reference the task requirements with actual code
   - Identify any discrepancies or misunderstandings
   - Note assumptions that need verification
   - Determine true scope based on codebase reality

5. **Present informed understanding and focused questions**:
   ```
   Based on the task and my research of the codebase, I understand we need to [accurate summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]
   - [Potential complexity or edge case identified]

   Questions that my research couldn't answer:
   - [Specific technical question that requires human judgment]
   - [Business logic clarification]
   - [Design preference that affects implementation]
   ```

   Only ask questions that you genuinely cannot answer through code investigation.

### Step 2: Research & Discovery

After getting initial clarifications:

1. **If the user corrects any misunderstanding**:
   - DO NOT just accept the correction
   - Spawn new research tasks to verify the correct information
   - Read the specific files/directories they mention
   - Only proceed once you've verified the facts yourself

2. **Create a research todo list** using TodoWrite to track exploration tasks

3. **Spawn parallel sub-tasks for comprehensive research**:
   - Create multiple Task agents to research different aspects concurrently
   - Use the right agent for each type of research:

   **For deeper investigation:**
   - **codebase-locator** - To find more specific files (e.g., "find all files that handle SEC filing processing")
   - **codebase-analyzer** - To understand implementation details (e.g., "analyze how the summarization pipeline works")
   - **codebase-pattern-finder** - To find similar features we can model after

   **For historical context:**
   - **thoughts-locator** - To find any research, plans, or decisions about this area
   - **thoughts-analyzer** - To extract key insights from the most relevant documents

   **For external context:**
   - **web-search-researcher** - For Next.js patterns, Prisma best practices, etc.

   Each agent knows how to:
   - Find the right files and code patterns
   - Identify conventions and patterns to follow
   - Look for integration points and dependencies
   - Return specific file:line references
   - Find tests and examples

3. **Wait for ALL sub-tasks to complete** before proceeding

4. **Present findings and design options**:
   ```
   Based on my research, here's what I found:

   **Current State:**
   - [Key discovery about existing code]
   - [Pattern or convention to follow]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   **Open Questions:**
   - [Technical uncertainty]
   - [Design decision needed]

   Which approach aligns best with your vision?
   ```

### Step 3: Plan Structure Development

Once aligned on approach:

1. **Create initial plan outline**:
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   3. [Phase name] - [what it accomplishes]

   Does this phasing make sense? Should I adjust the order or granularity?
   ```

2. **Get feedback on structure** before writing details

### Step 4: Detailed Plan Writing

After structure approval:

1. **Gather metadata for the plan**:
   - Run the `hack/spec_metadata.sh` script to generate all relevant metadata
   - This provides: date/time, git commit, branch, repository name

2. **Write the plan** to `docs/plans/YYYY-MM-DD-description.md`
   - Format: `YYYY-MM-DD-description.md` where:
     - YYYY-MM-DD is today's date
     - description is a brief kebab-case description
   - Examples:
     - `2025-01-30-sec-filing-parser-enhancement.md`
     - `2025-01-30-improve-error-handling.md`

3. **Use this template structure**:

````markdown
# [Feature/Task Name] Implementation Plan

**Date**: [Current date and time with timezone from metadata]
**Git Commit**: [Current commit hash from metadata]
**Branch**: [Current branch name from metadata]
**Repository**: [Repository name from metadata]

## Overview

[Brief description of what we're implementing and why]

## Current State Analysis

[What exists now, what's missing, key constraints discovered]

## Desired End State

[A Specification of the desired end state after this plan is complete, and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach

[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/[feature]/[component].test.ts`

Write these tests FIRST (they should all fail initially):

```typescript
// Test 1: [Description of what we're testing]
describe('[Component/Feature]', () => {
  it('should [expected behavior]', async () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle [edge case]', async () => {
    // Test implementation
  });

  it('should reject [invalid input]', async () => {
    // Test implementation
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="[test-file-pattern]"
# Expected: X failing tests
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 [First Component]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

```[language]
// Specific code to add/modify
```

**Checkpoint 1.2.1**: Verify first test passes:
```bash
npm run test -- --testPathPattern="[pattern]" --testNamePattern="[first-test-name]"
# Expected: 1 passing, X-1 failing
```

#### 1.2.2 [Second Component]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

**Checkpoint 1.2.2**: Verify more tests pass:
```bash
npm run test -- --testPathPattern="[pattern]"
# Expected: 2 passing, X-2 failing
```

[Continue until all tests pass]

### Step 1.3: 🔵 Refactor

- [ ] Extract common patterns
- [ ] Improve naming
- [ ] Add JSDoc comments where needed
- [ ] Ensure code follows existing patterns

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="[pattern]"
# Expected: X passing, 0 failing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="[pattern]"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Feature works as expected when tested via UI
- [ ] Performance is acceptable under load
- [ ] Edge case handling verified manually
- [ ] No regressions in related features

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/[feature]/[component].test.ts`

[Same TDD structure as Phase 1 - write failing tests first]

**Checkpoint 2.1**: Run tests and verify they FAIL as expected

### Step 2.2: 🟢 Implement to Pass Tests

[Implementation steps with checkpoints after each component]

### Step 2.3: 🔵 Refactor

[Refactoring with checkpoint to verify tests still pass]

### Step 2.4: Final Phase Verification

[Same verification structure as Phase 1]

---

## Testing Strategy

### TDD Test Design Principles

When designing failing tests, follow these principles:

1. **One Assertion Per Test** (when practical): Makes failures easier to diagnose
2. **Descriptive Test Names**: Use "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure in every test
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs, not internals
5. **Edge Cases First**: Write tests for edge cases before happy path

### Test Categories (in order of writing):

#### 1. Contract Tests (Write First)
Tests that define the public API/interface:
```typescript
describe('FilingProcessor', () => {
  it('should return Summary when given valid Filing', () => {});
  it('should throw InvalidFilingError when filing is malformed', () => {});
});
```

#### 2. Edge Case Tests (Write Second)
Tests for boundary conditions:
```typescript
it('should handle empty content gracefully', () => {});
it('should reject content exceeding MAX_TOKEN_LIMIT', () => {});
it('should handle special characters in company name', () => {});
```

#### 3. Integration Tests (Write Third)
Tests that verify components work together:
```typescript
it('should process filing through entire pipeline', () => {});
it('should send email after successful summarization', () => {});
```

#### 4. Regression Tests (Add as bugs found)
Tests that prevent bug recurrence - add when bugs are discovered

### Checkpoint Frequency Guidelines

- **Minimum 3 checkpoints per phase**: Red, Green, Refactor
- **Ideal: 1 checkpoint per test group** (every 2-3 related tests)
- **Maximum gap between checkpoints**: 15 minutes of implementation work

### Manual Testing Steps:
1. [Specific step to verify feature]
2. [Another verification step]
3. [Edge case to test manually]

## Performance Considerations

[Any performance implications or optimizations needed]

## Migration Notes

[If applicable, how to handle existing data/systems]

## References

- Original task: `docs/tasks/[relevant].md`
- Related research: `docs/research/[relevant].md`
- Similar implementation: `[file:line]`
- Historical context from thoughts: `thoughts/[relevant].md`
````

### Step 5: Sync and Review

1. **Sync the thoughts directory** (if thoughts were created/updated):
   - Run `bash hack/thoughts_sync.sh` to sync the thoughts directory
   - This creates hard links in `thoughts/searchable/` for better searching

2. **Present the draft plan location**:
   ```
   I've created the initial implementation plan at:
   `docs/plans/YYYY-MM-DD-description.md`

   Please review it and let me know:
   - Are the phases properly scoped?
   - Are the success criteria specific enough?
   - Any technical details that need adjustment?
   - Missing edge cases or considerations?
   ```

3. **Iterate based on feedback** - be ready to:
   - Add missing phases
   - Adjust technical approach
   - Clarify success criteria (both automated and manual)
   - Add/remove scope items
   - After making changes, run `bash hack/thoughts_sync.sh` again if thoughts were modified

4. **Continue refining** until the user is satisfied

## Important Guidelines

1. **Be Skeptical**:
   - Question vague requirements
   - Identify potential issues early
   - Ask "why" and "what about"
   - Don't assume - verify with code

2. **Be Interactive**:
   - Don't write the full plan in one shot
   - Get buy-in at each major step
   - Allow course corrections
   - Work collaboratively

3. **Be Thorough**:
   - Read all context files COMPLETELY before planning
   - Research actual code patterns using parallel sub-tasks
   - Include specific file paths and line numbers
   - Write measurable success criteria with clear automated vs manual distinction
   - Automated steps should use npm scripts from package.json

4. **Be Practical**:
   - Focus on incremental, testable changes
   - Consider migration and rollback
   - Think about edge cases
   - Include "what we're NOT doing"

5. **Track Progress**:
   - Use TodoWrite to track planning tasks
   - Update todos as you complete research
   - Mark planning tasks complete when done

6. **No Open Questions in Final Plan**:
   - If you encounter open questions during planning, STOP
   - Research or ask for clarification immediately
   - Do NOT write the plan with unresolved questions
   - The implementation plan must be complete and actionable
   - Every decision must be made before finalizing the plan

7. **TDD is Non-Negotiable**:
   - NEVER write implementation code before its test
   - Each phase MUST start with failing tests (🔴 Red)
   - Tests define the specification - write them first
   - If you find yourself writing code "to try it out", STOP and write a test
   - Checkpoints after each test group ensure incremental progress
   - A failing test is a FEATURE - it tells you exactly what to build next

8. **Design Tests for Maximum Checkpoints**:
   - Break features into smallest testable units
   - Each test should verify ONE behavior
   - Write tests in order of complexity (simple → complex)
   - Group related tests but keep groups small (2-3 tests)
   - Every test group = one checkpoint opportunity

## Success Criteria Guidelines

**Always separate success criteria into two categories:**

1. **Automated Verification** (can be run by execution agents):
   - Commands that can be run: `npm run test`, `npm run lint`, etc.
   - Specific files that should exist
   - Code compilation/type checking
   - Automated test suites

2. **Manual Verification** (requires human testing):
   - UI/UX functionality
   - Performance under real conditions
   - Edge cases that are hard to automate
   - User acceptance criteria

**Format example:**
```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Database migration runs successfully: `npm run db:migrate`
- [ ] All unit tests pass: `npm run test`
- [ ] No linting errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] API endpoint returns 200: `curl localhost:3000/api/new-endpoint`

#### Manual Verification:
- [ ] New feature appears correctly in the UI
- [ ] Performance is acceptable with 1000+ items
- [ ] Error messages are user-friendly
- [ ] Feature works correctly on mobile devices
```

## Common Patterns

### For Database Changes (TDD Approach):
1. 🔴 Write tests for new model/field behavior
2. 🟢 Update Prisma schema to pass type tests
3. 🔴 Write tests for service layer
4. 🟢 Generate migration: `npx prisma migrate dev`
5. 🟢 Update service methods to pass tests
6. 🔴 Write API route tests
7. 🟢 Update API routes
8. 🔴 Write component tests
9. 🟢 Update UI components

### For New Features (TDD Approach):
1. Research existing patterns and test patterns
2. 🔴 Write contract tests defining the feature's interface
3. 🟢 Create type definitions/interfaces
4. 🔴 Write service layer tests (edge cases first)
5. 🟢 Build service layer incrementally
6. 🔴 Write API endpoint tests
7. 🟢 Add API endpoints
8. 🔴 Write component tests
9. 🟢 Implement UI last

### For Refactoring (TDD Approach):
1. 🔴 Write characterization tests capturing current behavior
2. Verify tests pass with existing code (tests become 🟢)
3. 🔵 Refactor in small steps, keeping tests green
4. Add new tests for improved behavior if needed

### For Bug Fixes (TDD Approach):
1. 🔴 Write a test that reproduces the bug (MUST fail)
2. Verify the test fails for the right reason
3. 🟢 Fix the bug with minimal code change
4. 🔵 Refactor if needed
5. The test becomes a regression test forever

## Sub-task Spawning Best Practices

When spawning research sub-tasks:

1. **Spawn multiple tasks in parallel** for efficiency
2. **Each task should be focused** on a specific area
3. **Provide detailed instructions** including:
   - Exactly what to search for
   - Which directories to focus on
   - What information to extract
   - Expected output format
4. **Be EXTREMELY specific about directories**:
   - For API routes: specify `app/api/` directory
   - For components: specify `components/` directory
   - For business logic: specify `lib/` or `services/` directories
   - Include the full path context in your prompts
5. **Specify read-only tools** to use
6. **Request specific file:line references** in responses
7. **Wait for all tasks to complete** before synthesizing
8. **Verify sub-task results**:
   - If a sub-task returns unexpected results, spawn follow-up tasks
   - Cross-check findings against the actual codebase
   - Don't accept results that seem incorrect

Example of spawning multiple tasks:
```python
# Spawn these tasks concurrently:
tasks = [
    Task("Research database schema", db_research_prompt),
    Task("Find API patterns", api_research_prompt),
    Task("Investigate UI components", ui_research_prompt),
    Task("Check test patterns", test_research_prompt)
]
```

## Available Agents

The following specialized agents are available in `.claude/agents/humanlayer/`:
- **codebase-locator** - Find files and components
- **codebase-analyzer** - Understand how code works
- **codebase-pattern-finder** - Find existing patterns to model after
- **thoughts-locator** - Find documents in thoughts directory
- **thoughts-analyzer** - Extract insights from thoughts documents
- **web-search-researcher** - Research external documentation

## Example Interaction Flow

```
User: /create_plan
Assistant: I'll help you create a detailed implementation plan...

User: We need to add enhanced SEC filing analysis with AI summarization. See docs/tasks/enhance-filing-analysis.md
Assistant: Let me read that task file completely first...

[Reads file fully]

Based on the task, I understand we need to enhance the SEC filing pipeline with improved AI summarization. Let me research the codebase to understand the current implementation...

[Spawns research tasks]

[Interactive process continues...]
```

## Example TDD Phase Structure

Here's a concrete example of how a phase should be structured with TDD:

```markdown
## Phase 1: Add Filing Validation Service

### Overview
Create a validation service that checks SEC filings for completeness and format correctness before processing.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/services/filing-validator.test.ts`

```typescript
import { FilingValidator, ValidationResult } from '@/lib/services/filing-validator';

describe('FilingValidator', () => {
  describe('validate', () => {
    it('should return valid result for complete 10-K filing', async () => {
      const filing = createMockFiling({ formType: '10-K', content: validContent });
      const result = await FilingValidator.validate(filing);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when filing content is empty', async () => {
      const filing = createMockFiling({ content: '' });
      const result = await FilingValidator.validate(filing);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('EMPTY_CONTENT');
    });

    it('should return error when CIK is missing', async () => {
      const filing = createMockFiling({ cik: undefined });
      const result = await FilingValidator.validate(filing);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('MISSING_CIK');
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="filing-validator"
# Expected: 3 failing tests (module not found)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Create Type Definitions
**File**: `lib/services/filing-validator.ts`

```typescript
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class FilingValidator {
  static async validate(filing: Filing): Promise<ValidationResult> {
    throw new Error('Not implemented');
  }
}
```

**Checkpoint 1.2.1**: Tests now fail with better error:
```bash
npm run test -- --testPathPattern="filing-validator"
# Expected: 3 failing (Not implemented error)
```

#### 1.2.2 Implement Empty Content Check
```typescript
static async validate(filing: Filing): Promise<ValidationResult> {
  const errors: string[] = [];

  if (!filing.content || filing.content.trim() === '') {
    errors.push('EMPTY_CONTENT');
  }

  return { isValid: errors.length === 0, errors };
}
```

**Checkpoint 1.2.2**: First test passes:
```bash
npm run test -- --testPathPattern="filing-validator" --testNamePattern="empty"
# Expected: 1 passing
```

#### 1.2.3 Implement CIK Check
```typescript
if (!filing.cik) {
  errors.push('MISSING_CIK');
}
```

**Checkpoint 1.2.3**: Two tests pass:
```bash
npm run test -- --testPathPattern="filing-validator"
# Expected: 2 passing, 1 failing
```

#### 1.2.4 Implement Valid Filing Logic
[Complete implementation]

**Checkpoint 1.2.4**: All tests pass:
```bash
npm run test -- --testPathPattern="filing-validator"
# Expected: 3 passing, 0 failing
```

### Step 1.3: 🔵 Refactor

- [ ] Extract error constants to enum
- [ ] Add JSDoc documentation
- [ ] Ensure consistent error messages

**Checkpoint 1.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="filing-validator"
# Expected: 3 passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="filing-validator"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Validation errors display correctly in UI
- [ ] Invalid filings are properly rejected

**STOP**: Await manual confirmation before Phase 2.
```