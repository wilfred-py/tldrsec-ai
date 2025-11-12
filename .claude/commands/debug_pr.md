# Debug PR Command

## Purpose
Systematically diagnose and resolve pull request blocking issues using comprehensive reproduction, multi-agent analysis, and automated fixes.

## Usage
```bash
debug_pr [options] [pr-number]
```

### Options
- `--reproduce-first` - Focus on reproducing issues before analysis
- `--auto-fix` - Apply safe automated fixes (formatting, simple tests)
- `--report-only` - Generate diagnosis without making changes
- `--include-history` - Analyze PROGRESS.md and .claude/history files
- `--agent=NAME` - Use specific agent for targeted analysis  
- `--focus=AREA` - Focus on specific areas (tests, build, conflicts, reviews)

### Examples
```bash
# Full analysis with automatic reproduction
debug_pr --reproduce-first --auto-fix

# Analyze specific PR with historical context
debug_pr --include-history 226

# Generate report without making changes
debug_pr --report-only --focus=tests

# Use specific agent for targeted analysis
debug_pr --agent=code-analyzer-debugger
```

## Workflow Phases

### Phase 1: Issue Discovery & Reproduction

#### GitHub Integration
Use GitHub MCP tools to gather comprehensive PR context:

1. **Repository Detection**
   ```bash
   # Extract owner/repo from git remote
   git remote -v | head -1 | sed 's/.*github.com[:/]\([^/]*\)\/\([^. ]*\).*/\1\/\2/'
   ```

2. **PR Identification**
   - If no PR number specified, find PR for current branch
   - Get detailed PR information including files, status, comments

3. **MCP Tool Sequence**
   ```
   mcp__github__list_pull_requests(state: "open") 
   ’ mcp__github__get_pull_request(pull_number)
   ’ mcp__github__get_pull_request_files()
   ’ mcp__github__get_pull_request_status()
   ’ mcp__github__get_pull_request_comments()
   ```

#### Local Environment Analysis
```bash
# Check current git status
git status --porcelain

# Check for merge conflicts
git diff --check

# Run test suite to identify failures
npm run test 2>&1 | tee test_results.log

# Run build to identify compilation issues
npm run build 2>&1 | tee build_results.log

# Run lint for code quality issues  
npm run lint 2>&1 | tee lint_results.log
```

#### Issue Reproduction Strategy
**For Each Detected Issue:**

1. **Reproduce Locally**
   - Execute exact failing command from CI
   - Document environment differences
   - Capture complete error output with stack traces

2. **Classify Issue Type**
   - Test failures (unit, integration, e2e)
   - Build failures (compilation, dependency)
   - Code quality issues (lint, type checking)
   - Merge conflicts
   - Review feedback

### Phase 2: Codebase Analysis (Humanlayer Agents)

#### 1. File Location Mapping
```
Agent: codebase-locator
Purpose: Find all files relevant to PR changes and failures

Tasks:
- Locate test files for changed components
- Find configuration files affecting build/CI
- Identify dependencies and related components
- Map file relationships and import chains
```

#### 2. Pattern Analysis
```
Agent: codebase-pattern-finder  
Purpose: Find similar implementations and working examples

Tasks:
- Locate similar test patterns for fixing failures
- Find configuration patterns for CI/build fixes
- Identify error handling patterns used elsewhere
- Extract reference implementations
```

#### 3. Implementation Analysis
```
Agent: codebase-analyzer
Purpose: Deep dive into technical implementation details

Tasks:
- Analyze failing tests for expected vs actual behavior
- Trace data flow in problematic components  
- Identify integration points causing failures
- Document exact technical workings
```

#### 4. Historical Context
```
Agent: thoughts-analyzer
Purpose: Extract relevant historical context and decisions

Tasks:
- Analyze PROGRESS.md for related issues and fixes
- Extract insights from .claude/history/ files
- Identify previous solutions for similar problems
- Find documented constraints affecting current work
```

### Phase 3: Multi-Agent Diagnosis

#### Issue Classification & Agent Assignment

**Build/CI Failures** ’ `senior-software-engineer`
```
Scenarios:
- Configuration issues (package.json, tsconfig, etc.)
- Environment problems (Node version, dependencies)
- Complex dependency conflicts
- Infrastructure/deployment issues

Agent Prompt Context:
- Complete error logs from CI/local builds
- Changed files affecting build configuration
- Environment details and version requirements
- Historical build fixes from PROGRESS.md
```

**Test Failures** ’ `qa-test-engineer` + `code-analyzer-debugger`  
```
Scenarios:
- Unit test assertion failures
- Integration test environment issues
- E2E test flakiness or timeouts
- Test configuration problems
- Mock/stub issues

Agent Prompt Context:
- Failed test output with assertions
- Test file locations and patterns
- Changed components affecting tests
- Test configuration and setup files
```

**Complex Bugs** ’ `code-analyzer-debugger`
```
Scenarios:
- Runtime errors or exceptions
- Logic errors in business rules
- Performance issues or timeouts
- Data integrity problems
- Race conditions or async issues

Agent Prompt Context:
- Complete stack traces and error logs
- Steps to reproduce the issue
- Environmental factors
- Related code components and data flow
```

**Code Review Issues** ’ `codebase-pattern-finder` + `senior-software-engineer`
```
Scenarios:
- Architectural concerns from reviewers
- Code style and convention issues
- Security or performance feedback
- API design suggestions
- Documentation requests

Agent Prompt Context:
- Complete review comments and suggestions
- Files mentioned in review feedback
- Existing patterns for similar implementations
- Team conventions and style guides
```

#### Agent Coordination Protocol

**Shared Context Package for All Agents:**
```json
{
  "pr_details": {
    "number": 226,
    "title": "Fix landing page copy optimization",
    "branch": "landing-page-copy-optimization",
    "changed_files": ["app/page.tsx", "components/landing/hero.tsx"],
    "review_comments": [...],
    "status_checks": [...]
  },
  "reproduction_evidence": {
    "failing_tests": [...],
    "error_logs": [...],
    "environment_details": {...}
  },
  "historical_context": {
    "related_progress_entries": [...],
    "similar_past_issues": [...]
  },
  "codebase_analysis": {
    "file_locations": {...},
    "patterns_found": [...],
    "dependencies": [...]
  }
}
```

### Phase 4: Resolution & Verification

#### Automated Fix Categories

**Safe Automated Fixes:**
```bash
# Code formatting and style
npm run lint --fix

# TypeScript compilation issues
npm run typecheck --fix

# Simple test fixes (snapshots, imports)
npm test -- --updateSnapshot

# Dependency resolution
npm audit fix --force

# Git conflict resolution (simple cases)
git checkout --ours file.txt  # or --theirs
```

**Automated Fix Decision Matrix:**
| Issue Type | Auto-Fix Criteria | Command |
|------------|-------------------|---------|
| ESLint errors | No logic changes required | `npm run lint --fix` |
| Test snapshots | Only snapshot mismatches | `npm test -- --updateSnapshot` |
| Import errors | Simple import path fixes | Automated import correction |
| Merge conflicts | Non-overlapping changes | `git checkout --ours/--theirs` |

#### Manual Resolution Guidance

**Complex Issue Templates:**
```markdown
## Issue: [Test Failure in UserService.test.ts]

### Root Cause Analysis
Based on code-analyzer-debugger investigation:
- Expected behavior: User creation should return user ID
- Actual behavior: Returns undefined due to missing await
- Location: `services/UserService.ts:45`

### Reproduction Steps
1. Run `npm test UserService.test.ts`
2. Observe assertion failure on line 67
3. Error: "Expected 123, received undefined"

### Resolution Steps
1. Add missing `await` keyword in UserService.ts:45
   ```typescript
   // Change this:
   const user = createUser(userData);
   
   // To this:
   const user = await createUser(userData);
   ```

2. Verify fix:
   ```bash
   npm test UserService.test.ts
   ```

3. Run full test suite:
   ```bash
   npm test
   ```

### Files to Modify
- `services/UserService.ts:45` - Add missing await
- `__tests__/services/UserService.test.ts` - Already correct

### Verification
- [ ] Single test passes
- [ ] Full test suite passes  
- [ ] No new ESLint errors
- [ ] Build succeeds
```

#### Verification Workflow
```bash
# Step 1: Verify all automated fixes
npm run test
npm run lint  
npm run build
npm run typecheck

# Step 2: Check git status is clean
git status --porcelain

# Step 3: Simulate CI environment
npm run test:e2e
npm run test:security

# Step 4: Final PR readiness check
echo " All tests passing"
echo " All lints passing"  
echo " Build successful"
echo " Git status clean"
echo "=€ Ready for PR review"
```

## Output & Reporting

### Diagnosis Report Template
```markdown
# PR Debug Report: #[PR_NUMBER]

## Executive Summary
- **Branch**: [branch_name]
- **Issue Count**: [total_issues] ([critical]/[warning]/[info])
- **Auto-Fixed**: [auto_fixed_count] issues
- **Manual Action Required**: [manual_count] issues
- **Status**: [READY/BLOCKED/IN_PROGRESS]

## Issues Found

### Critical Issues L
1. **[Issue Type]**: [Brief description]
   - **Location**: [file:line]
   - **Status**: [FIXED/PENDING]
   - **Agent**: [agent_name]

### Warnings  
[Similar format for warnings]

### Info 9  
[Similar format for info items]

## Agent Analysis Results

### codebase-locator
- **Files Analyzed**: [count]
- **Key Locations Found**: [list]

### codebase-analyzer  
- **Root Causes Identified**: [count]
- **Data Flow Issues**: [list]

### [Other agents and their findings]

## Resolution Summary

### Automated Fixes Applied
-  ESLint formatting (12 files)
-  Test snapshots updated (3 files)
-  Import paths corrected (5 files)

### Manual Actions Required
1. **Fix async/await in UserService** (5 min)
2. **Resolve merge conflict in app.tsx** (10 min)  
3. **Address review feedback on API design** (30 min)

## Verification Results
- [x] All tests passing
- [x] Build successful
- [x] Lint checks pass
- [ ] Manual review items addressed

## Next Steps
1. Complete manual fixes above
2. Request re-review from [reviewer_name]
3. Monitor CI/CD pipeline after push

## Historical Context
- Related to previous fix in PROGRESS.md dated [date]
- Similar issue resolved in commit [hash]
- Pattern matches [previous_pattern] from [file]
```

### Progress Documentation Update
After successful resolution, update PROGRESS.md:
```markdown
---

# PR #[NUMBER] Blocking Issues Resolution - COMPLETED 

## Approach  
[Systematic reproduction and multi-agent analysis approach used]

## Steps Done
-  **Issue Reproduction**: [details]
-  **Root Cause Analysis**: [findings]  
-  **Automated Fixes**: [applied fixes]
-  **Manual Resolution**: [manual actions]

## Current Status
**RESOLVED** - All blocking issues fixed and verified

## Files Modified
[List of files and changes made]

---
```

## Error Handling & Edge Cases

### Common Issues & Resolutions

**GitHub API Access Issues:**
```bash
# Check if GitHub token is configured
gh auth status

# If not authenticated:
gh auth login
```

**Agent Coordination Failures:**
```bash
# Fall back to manual agent invocation
# If codebase-locator fails, use manual Grep/Glob
# If specific agent times out, continue with others
```

**Local Reproduction Issues:**
```bash
# Environment mismatch with CI
nvm use [node_version]
npm ci  # Use exact CI dependencies

# Permission or path issues  
chmod +x scripts/test.sh
export PATH=$PATH:./node_modules/.bin
```

**Merge Conflict Resolution:**
```bash
# For complex conflicts requiring human decision
git mergetool

# For simple conflicts, provide clear guidance:
echo "Conflict in [file]: Keep local changes or remote changes?"
echo "Review lines [X-Y] and choose appropriate resolution"
```

## Integration Notes

### GitHub MCP Requirements
- Repository must be accessible via GitHub API
- User must have read permissions for PR details
- For private repositories, authentication required

### Agent Dependencies
- All humanlayer agents require read access to codebase
- thoughts-analyzer requires .claude/history/ directory
- Pattern-finder needs existing implementations to reference

### Local Environment Requirements  
```bash
# Required commands available:
git --version
npm --version  
node --version

# Required npm scripts in package.json:
npm run test
npm run lint
npm run build
npm run typecheck  # if using TypeScript
```

### File System Requirements
```
.claude/
   agents/           # Agent definitions
   commands/         # This command file
   history/         # Historical context (optional)
   tasks/          # Task tracking (optional)

PROGRESS.md          # Progress tracking file
package.json         # npm scripts and dependencies
```

This comprehensive command provides systematic PR debugging with reproduction-first methodology, multi-agent analysis, and verification workflows.