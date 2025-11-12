# Agent Coordination Templates for PR Debugging

## Overview
This document provides standardized prompt templates for coordinating multiple agents in the debug_pr workflow, ensuring consistent context sharing and optimal agent utilization.

## Shared Context Package Structure

### Base Context Template
```json
{
  "pr_context": {
    "repository": "owner/repo",
    "pr_number": 226,
    "title": "Fix landing page copy optimization",
    "description": "PR description...",
    "branch": {
      "head": "landing-page-copy-optimization",
      "base": "main"
    },
    "changed_files": [
      {
        "path": "app/page.tsx",
        "status": "modified",
        "additions": 15,
        "deletions": 8,
        "changes": 23
      }
    ],
    "status_checks": [
      {
        "context": "ci/tests",
        "state": "failure",
        "description": "3 tests failing",
        "target_url": "https://..."
      }
    ],
    "review_comments": [],
    "mergeable": false,
    "conflicts": true
  },
  "local_environment": {
    "branch": "landing-page-copy-optimization",
    "uncommitted_changes": false,
    "test_results": {
      "exit_code": 1,
      "failing_tests": ["hero.test.tsx"],
      "error_output": "Expected 'Get Started' but received 'Join the Waitlist'"
    },
    "build_results": {
      "exit_code": 0,
      "warnings": []
    },
    "lint_results": {
      "exit_code": 1,
      "errors": ["Unused variable 'oldText' at line 45"]
    }
  },
  "historical_context": {
    "related_progress_entries": [],
    "similar_past_issues": [],
    "team_conventions": []
  }
}
```

## Agent Coordination Workflows

### Phase 1: Discovery Phase Agents

#### 1. codebase-locator Agent
**Purpose**: Map all relevant files for PR analysis

**Prompt Template**:
```
I need you to locate ALL files relevant to this PR for comprehensive analysis.

## PR Context
**Repository**: {repository}
**PR #{pr_number}**: {title}
**Branch**: {head_branch} → {base_branch}

## Changed Files
{changed_files_list}

## Current Issues Detected
{issues_summary}

## Your Task
Find and categorize ALL files that are relevant to:
1. **Direct Changes**: Files modified in this PR
2. **Test Coverage**: Test files for all changed components  
3. **Dependencies**: Files that import/use the changed components
4. **Configuration**: Build, lint, deployment configs that might affect these changes
5. **Documentation**: READMEs, docs that might need updates
6. **Related Components**: Similar patterns or shared utilities

## Expected Output Format
Organize your findings by:
- Implementation Files (core logic)
- Test Files (unit, integration, e2e) 
- Configuration Files
- Documentation Files
- Related/Dependent Files

Include full file paths and brief purpose descriptions.

**Focus on being comprehensive** - we need to understand the full scope of what this PR affects.
```

#### 2. codebase-pattern-finder Agent  
**Purpose**: Find reference implementations and patterns

**Prompt Template**:
```
I need you to find similar patterns and working examples that can guide resolution of PR issues.

## PR Context
{pr_context_block}

## Specific Issues Found
{specific_issues_list}

## Your Task
Find existing code patterns for:
1. **Similar Components**: Other implementations like the changed components
2. **Test Patterns**: How similar components are tested in this codebase
3. **Configuration Examples**: Working examples of similar configs
4. **Error Handling**: How similar issues have been handled
5. **Integration Patterns**: How similar features integrate with the system

## Focus Areas Based on Issues
{focus_areas_based_on_detected_issues}

## Expected Output
For each pattern found:
- **Location**: Exact file:line references
- **Purpose**: What this pattern accomplishes
- **Code Examples**: Actual working code snippets
- **Key Aspects**: What makes this pattern work
- **Usage Context**: Where/how it's used in the codebase

Show multiple variations where they exist, and note which approaches are most commonly used.
```

### Phase 2: Analysis Phase Agents

#### 3. codebase-analyzer Agent
**Purpose**: Deep technical analysis of implementation issues

**Prompt Template**:
```
I need you to perform deep technical analysis of the issues found in this PR.

## PR Context  
{pr_context_block}

## Issue Reproduction Evidence
{reproduction_evidence}

## Files to Analyze (from codebase-locator)
{file_locations_from_locator}

## Patterns Found (from pattern-finder)
{relevant_patterns_from_pattern_finder}

## Your Task
Analyze the exact technical workings of:
1. **Failing Components**: Trace data flow and execution paths
2. **Integration Points**: How components interact with each other
3. **Error Sources**: Where exactly errors are originating
4. **State Management**: How data flows through the problematic areas
5. **Side Effects**: What else might be affected by these changes

## Analysis Focus
{specific_technical_questions_to_answer}

## Expected Output
- **Overview**: 2-3 sentence technical summary
- **Entry Points**: Key functions/methods with file:line references
- **Core Implementation**: Step-by-step technical breakdown
- **Data Flow**: How data moves through the system
- **Key Patterns**: Technical patterns being used
- **Configuration**: Important settings affecting behavior

**Be precise** with file:line references and exact function/variable names.
```

#### 4. thoughts-analyzer Agent
**Purpose**: Extract historical context and decisions

**Prompt Template**:
```
I need you to extract relevant historical context for this PR's issues from project documentation.

## PR Context
{pr_context_block}

## Current Issues
{issue_summary}

## Files to Analyze
Please analyze these files for relevant historical context:
- PROGRESS.md
- .claude/history/TIMELINE.md
- .claude/history/2025/Nov/*.md (most recent files)
- Any related historical documents

## Your Task
Extract insights about:
1. **Similar Past Issues**: Previous problems like current ones
2. **Team Decisions**: Documented choices affecting current work
3. **Known Constraints**: Limitations or requirements mentioned
4. **Previous Solutions**: How similar issues were resolved
5. **Lessons Learned**: Patterns to follow or avoid

## Focus Areas
{specific_historical_questions}

## Expected Output
- **Document Context**: What documents you analyzed and their relevance
- **Key Decisions**: Firm decisions that affect current work
- **Critical Constraints**: Documented limitations to consider
- **Previous Solutions**: Proven approaches for similar issues
- **Actionable Insights**: Specific guidance for current situation
- **Relevance Assessment**: Whether historical info is still applicable

**Filter aggressively** - only return high-value, actionable historical context.
```

### Phase 3: Diagnostic Phase Agents

#### Issue-Specific Agent Templates

**For Build/CI Failures → senior-software-engineer**:
```
I need you to resolve complex build and CI/CD issues in this PR.

## PR Context
{pr_context_block}

## Build Failure Evidence
{build_error_logs}

## Codebase Analysis Results
**File Locations**: {from_codebase_locator}
**Patterns Found**: {from_pattern_finder}
**Technical Analysis**: {from_codebase_analyzer}
**Historical Context**: {from_thoughts_analyzer}

## Your Task
As a senior engineer, provide architectural thinking and pragmatic solutions for:
1. **Root Cause Analysis**: Why these build issues are happening
2. **System Design Impact**: How changes affect the broader system
3. **Configuration Resolution**: Fix complex config/environment issues
4. **Cross-Service Integration**: Address integration problems
5. **Production Readiness**: Ensure changes are deployment-safe

## Expected Output
- **Requirements Analysis**: Complete understanding of the problem
- **Technical Design**: Pragmatic solution approach
- **Risk Assessment**: Potential risks and mitigations
- **Implementation Plan**: Step-by-step resolution strategy
- **Code Quality**: Maintainable, production-ready solutions

Balance ideal technical solutions with delivery timeline constraints.
```

**For Test Failures → qa-test-engineer + code-analyzer-debugger**:
```
QA Engineer Task:
I need comprehensive test analysis and strategy for this PR's test failures.

## PR Context & Evidence
{combined_context_from_all_previous_agents}

## Your QA Task
1. **Test Failure Analysis**: Systematically analyze each failing test
2. **Coverage Assessment**: Determine if test coverage is adequate
3. **Quality Gate Evaluation**: Check if changes meet quality standards
4. **Edge Case Identification**: Find untested scenarios
5. **Test Strategy**: Recommend comprehensive testing approach

## Expected Output
- **Test Failure Root Causes**: Why each test is failing
- **Coverage Gaps**: Missing test scenarios
- **Quality Metrics**: Current vs target quality measures
- **Test Improvements**: Specific test enhancements needed
- **Quality Assessment**: Whether PR meets quality gates

---

Code Analyzer Debugger Task:
I need systematic investigation of the test failure root causes.

## Context (Same as above)

## Your Investigation Task
1. **Reproduce Failures**: Confirm exact reproduction steps
2. **Evidence Collection**: Gather all failure symptoms and logs
3. **Hypothesis Formation**: Generate multiple theories about causes
4. **Systematic Testing**: Design experiments to validate theories
5. **Root Cause Analysis**: Identify fundamental issues, not symptoms

## Expected Output  
- **Investigation Timeline**: Step-by-step analysis progression
- **Hypothesis Matrix**: All theories with supporting/refuting evidence
- **Root Cause Findings**: Evidence-based conclusions
- **Reproduction Steps**: Exact procedures to recreate issues

Think like Sherlock Holmes - follow evidence, not assumptions.
```

**For Code Review Issues → codebase-pattern-finder + senior-software-engineer**:
```
I need to address reviewer feedback systematically using existing patterns.

## PR Context & Review Feedback
{pr_context_plus_review_comments}

## Codebase Analysis Results
{results_from_all_previous_agents}

## Pattern Finder Task
Find existing patterns for addressing each piece of reviewer feedback:
1. **Architectural Patterns**: How similar architectural concerns are handled
2. **Code Style Patterns**: Team conventions for style issues raised
3. **Performance Patterns**: How performance concerns are typically addressed
4. **Security Patterns**: Standard security practices in this codebase
5. **Documentation Patterns**: How similar features are documented

## Senior Engineer Task  
Provide strategic guidance for addressing reviewer concerns:
1. **Technical Leadership**: Guide architectural decisions
2. **Trade-off Analysis**: Evaluate reviewer suggestions vs constraints  
3. **Implementation Strategy**: Pragmatic approach to address feedback
4. **Quality Standards**: Ensure solutions meet team standards
5. **Knowledge Sharing**: Document decisions for team learning

## Coordination
Pattern finder provides "how it's done here" examples, senior engineer provides "how to decide what to do" guidance.
```

### Phase 4: Resolution Coordination

#### Resolution Summary Agent Template
```
I need you to coordinate all agent findings into a comprehensive resolution plan.

## All Agent Results
**codebase-locator**: {file_locations_and_mappings}
**codebase-pattern-finder**: {patterns_and_examples}
**codebase-analyzer**: {technical_analysis}
**thoughts-analyzer**: {historical_context}
**diagnostic-agents**: {issue_specific_analysis}

## Your Coordination Task
Create a unified resolution plan that:
1. **Prioritizes Issues**: Order by impact and effort required
2. **Identifies Dependencies**: What must be done in sequence
3. **Automates Where Possible**: Flag safe automated fixes
4. **Guides Manual Work**: Provide clear manual resolution steps
5. **Ensures Verification**: Define how to confirm each fix works

## Expected Output
- **Executive Summary**: High-level status and next steps
- **Automated Fixes**: Safe changes that can be applied immediately
- **Manual Resolution Guide**: Step-by-step instructions for complex issues
- **Verification Plan**: How to confirm everything works
- **Risk Assessment**: Potential issues with proposed solutions

Synthesize all agent findings into actionable, prioritized guidance.
```

## Agent Error Handling

### Agent Timeout/Failure Recovery
```
If any agent fails or times out:

1. **Continue with Other Agents**: Don't block the entire workflow
2. **Fallback Strategies**: 
   - codebase-locator fails → Use manual Grep/Glob commands
   - pattern-finder fails → Senior engineer provides guidance without examples
   - analyzer fails → Use QA engineer + manual investigation
   - thoughts-analyzer fails → Skip historical context

3. **Partial Results**: Use whatever information was gathered
4. **User Notification**: Clearly communicate what information is missing
```

### Context Size Management
```
If context becomes too large for agents:

1. **Prioritize by Issue Type**: Focus on most critical issues first
2. **Split by Domain**: Separate frontend/backend/config issues
3. **Progressive Disclosure**: Start with high-level, dive deeper as needed
4. **Summary Handoffs**: Each agent provides concise summary for next agent
```

## Quality Assurance for Agent Coordination

### Agent Output Validation
- **codebase-locator**: Verify all file paths exist and are accurate
- **pattern-finder**: Confirm code examples compile and work
- **analyzer**: Validate file:line references are correct
- **thoughts-analyzer**: Check that historical context is still relevant

### Inter-Agent Consistency
- Cross-reference findings between agents
- Identify contradictions in analysis
- Reconcile different perspectives on same issues
- Ensure final recommendations are coherent

This coordination system ensures all agents work together effectively while maintaining the reproduction-first, evidence-based approach of the debug_pr command.