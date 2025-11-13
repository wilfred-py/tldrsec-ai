# GitHub MCP Integration for PR Debugging

## Overview
This document provides standardized patterns for using GitHub MCP tools in the debug_pr command workflow.

## Repository Detection Pattern

### Extract Owner/Repo from Git Remote
```bash
# Standard pattern for getting GitHub repository details
REPO_REMOTE=$(git remote get-url origin)
REPO_INFO=$(echo $REPO_REMOTE | sed 's/.*github\.com[:/]\([^/]*\)\/\([^.]*\).*/\1\/\2/')
OWNER=$(echo $REPO_INFO | cut -d'/' -f1)
REPO=$(echo $REPO_INFO | cut -d'/' -f2)

echo "Repository: $OWNER/$REPO"
```

### Current Branch Detection
```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"
```

## GitHub MCP Tool Sequence

### 1. Find PR for Current Branch
```
Tools: mcp__github__list_pull_requests

Strategy:
1. List open PRs for the repository
2. Filter by head branch matching current git branch
3. If no match, prompt user for PR number
4. If multiple matches, show options for user selection

Example Usage:
mcp__github__list_pull_requests(
  owner: "wilfred-py",
  repo: "tldrsec-ai", 
  state: "open",
  head: "landing-page-copy-optimization"
)
```

### 2. Get Comprehensive PR Details
```
Tools: mcp__github__get_pull_request

Purpose: Gather complete PR information for context

Data to Extract:
- PR title and description
- Base and head branch information
- Merge status and conflicts
- Review status and approvals
- Labels and milestones

Example Usage:
mcp__github__get_pull_request(
  owner: "wilfred-py",
  repo: "tldrsec-ai",
  pull_number: 226
)
```

### 3. Analyze Changed Files
```
Tools: mcp__github__get_pull_request_files

Purpose: Understand scope of changes and affected components

Analysis Points:
- File paths and extensions (identify frontend/backend/config changes)
- Lines added/deleted (scale of changes)
- File status (modified/added/deleted/renamed)
- Patch content for critical files

Example Usage:
mcp__github__get_pull_request_files(
  owner: "wilfred-py", 
  repo: "tldrsec-ai",
  pull_number: 226
)
```

### 4. Check CI/CD Status
```
Tools: mcp__github__get_pull_request_status

Purpose: Identify failing status checks and CI issues

Status Check Analysis:
- Build status (success/failure/pending)
- Test suite results
- Code quality checks (ESLint, TypeScript)
- Security scans
- Deployment previews

Example Usage:
mcp__github__get_pull_request_status(
  owner: "wilfred-py",
  repo: "tldrsec-ai", 
  pull_number: 226
)
```

### 5. Gather Review Feedback
```
Tools: mcp__github__get_pull_request_comments

Purpose: Understand reviewer concerns and blockers

Comment Analysis:
- Unresolved review comments
- Change requests
- Specific file/line feedback
- General architectural concerns

Example Usage:
mcp__github__get_pull_request_comments(
  owner: "wilfred-py",
  repo: "tldrsec-ai",
  pull_number: 226
)
```

## Error Handling Patterns

### Repository Not Found
```javascript
// Error Response Pattern:
{
  error: "Not Found: Resource not found: Not Found"
}

// Resolution Strategy:
1. Verify repository exists and is accessible
2. Check authentication status with `gh auth status`
3. Confirm correct owner/repo format
4. Try with different capitalization
```

### Authentication Issues
```javascript
// Detection:
- 401 Unauthorized responses
- 403 Forbidden for private repositories

// Resolution:
1. Check GitHub CLI authentication: `gh auth status`
2. Login if needed: `gh auth login` 
3. Verify token permissions for repository access
4. For private repos, ensure collaborator access
```

### Rate Limiting
```javascript
// Detection:
- 403 responses with rate limit headers
- "API rate limit exceeded" messages

// Resolution:
1. Implement exponential backoff
2. Use authenticated requests (higher rate limits)
3. Cache responses to avoid repeated API calls
4. Batch related requests where possible
```

## Data Transformation Patterns

### PR Context Package Creation
```javascript
function createPRContext(prData, filesData, statusData, commentsData) {
  return {
    pr_details: {
      number: prData.number,
      title: prData.title,
      description: prData.body,
      state: prData.state,
      branch: {
        head: prData.head.ref,
        base: prData.base.ref
      },
      mergeable: prData.mergeable,
      mergeable_state: prData.mergeable_state,
      changed_files: filesData.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes
      })),
      status_checks: statusData.statuses.map(status => ({
        context: status.context,
        state: status.state,
        description: status.description,
        target_url: status.target_url
      })),
      review_comments: commentsData.map(comment => ({
        body: comment.body,
        path: comment.path,
        line: comment.line,
        user: comment.user.login,
        created_at: comment.created_at
      }))
    },
    analysis: {
      file_types: categorizeFileTypes(filesData),
      impact_areas: identifyImpactAreas(filesData),
      complexity_score: calculateComplexityScore(filesData),
      review_priorities: prioritizeReviewComments(commentsData)
    }
  };
}
```

### File Type Categorization
```javascript
function categorizeFileTypes(files) {
  const categories = {
    frontend: [],
    backend: [], 
    tests: [],
    config: [],
    docs: [],
    infrastructure: []
  };
  
  files.forEach(file => {
    const path = file.filename.toLowerCase();
    
    if (path.includes('test') || path.includes('spec') || path.includes('__tests__')) {
      categories.tests.push(file.filename);
    } else if (path.endsWith('.tsx') || path.endsWith('.jsx') || path.startsWith('components/') || path.startsWith('app/')) {
      categories.frontend.push(file.filename);
    } else if (path.startsWith('lib/') || path.startsWith('services/') || path.startsWith('api/')) {
      categories.backend.push(file.filename);
    } else if (path.includes('config') || path.endsWith('.json') || path.endsWith('.yml') || path.endsWith('.yaml')) {
      categories.config.push(file.filename);
    } else if (path.endsWith('.md') || path.startsWith('docs/')) {
      categories.docs.push(file.filename);
    } else if (path.includes('docker') || path.includes('deploy') || path.includes('.github/')) {
      categories.infrastructure.push(file.filename);
    }
  });
  
  return categories;
}
```

### Status Check Failure Analysis  
```javascript
function analyzeFailedChecks(statusChecks) {
  const failures = statusChecks.filter(check => check.state === 'failure' || check.state === 'error');
  
  return {
    total_failures: failures.length,
    build_failures: failures.filter(f => f.context.includes('build')),
    test_failures: failures.filter(f => f.context.includes('test')),
    lint_failures: failures.filter(f => f.context.includes('lint') || f.context.includes('eslint')),
    security_failures: failures.filter(f => f.context.includes('security') || f.context.includes('audit')),
    deployment_failures: failures.filter(f => f.context.includes('deploy')),
    other_failures: failures.filter(f => !f.context.match(/(build|test|lint|eslint|security|audit|deploy)/))
  };
}
```

## Agent Context Templates

### For codebase-locator Agent
```markdown
## PR Context for File Location Analysis

**PR #226**: Fix landing page copy optimization  
**Branch**: landing-page-copy-optimization
**Changed Files**: 
- app/page.tsx (modified, +15 -8)
- components/landing/hero.tsx (modified, +23 -12)
- package.json (modified, +1 -1)

**Task**: Find all files related to these changes that might be affected by or need testing with these modifications.

**Focus Areas**:
- Test files for the modified components
- Configuration files that might affect build/deployment
- Related components that import or use the modified files
- Style/CSS files that might be affected by component changes
```

### For codebase-analyzer Agent
```markdown
## PR Context for Implementation Analysis

**Issue**: Build failing on CI with TypeScript errors
**Error Log**: 
```
Type 'string | undefined' is not assignable to type 'string'
  at components/landing/hero.tsx:45:12
```

**Changed Files**: [list]
**PR Details**: [PR context]

**Task**: Analyze the specific TypeScript error in the context of the PR changes. Understand why this error is occurring and what the exact type requirements are.

**Analysis Focus**:
- Trace the data flow leading to line 45 in hero.tsx
- Identify the source of the potentially undefined value
- Understand the expected type contract
- Document the exact technical issue without suggesting fixes
```

### For qa-test-engineer Agent
```markdown
## PR Context for Test Analysis

**Test Failures**: 
- components/landing/hero.test.tsx: 3 failing assertions
- app/page.test.tsx: snapshot mismatch

**PR Changes**: Landing page copy optimization
**Changed Files**: [list]

**Task**: Analyze the failing tests in the context of the copy changes. Understand what behavior the tests expect vs what's being delivered.

**Focus Areas**:
- Test assertion expectations vs new copy
- Component behavior changes due to text updates  
- Snapshot differences from UI changes
- Integration test impacts of copy modifications
```

### For code-analyzer-debugger Agent
```markdown
## PR Context for Bug Investigation

**Reproduction Evidence**:
```bash
npm test components/landing/hero.test.tsx
# Output: Expected "Get Started" but received "Join the Waitlist"
```

**Issue**: Test expectations don't match new copy implementation
**PR Context**: Copy optimization changing button text
**Environment**: Local development, Node 20, npm 10

**Investigation Focus**:
1. Reproduce the exact test failure locally
2. Trace why the test expects "Get Started" 
3. Understand if this is a test update needed or implementation issue
4. Gather evidence about intended behavior vs actual behavior
```

## Integration Examples

### Complete MCP Workflow
```typescript
async function analyzePR(prNumber?: number) {
  // 1. Repository detection
  const repoInfo = await getRepositoryInfo();
  
  // 2. PR identification
  const targetPR = prNumber || await findPRForCurrentBranch(repoInfo);
  
  // 3. Gather all PR data
  const [prDetails, prFiles, prStatus, prComments] = await Promise.all([
    mcp__github__get_pull_request(repoInfo.owner, repoInfo.repo, targetPR),
    mcp__github__get_pull_request_files(repoInfo.owner, repoInfo.repo, targetPR),
    mcp__github__get_pull_request_status(repoInfo.owner, repoInfo.repo, targetPR), 
    mcp__github__get_pull_request_comments(repoInfo.owner, repoInfo.repo, targetPR)
  ]);
  
  // 4. Create unified context
  const prContext = createPRContext(prDetails, prFiles, prStatus, prComments);
  
  // 5. Analyze failures and issues
  const issues = analyzeIssues(prContext);
  
  return {
    context: prContext,
    issues: issues,
    recommendations: generateAgentAssignments(issues)
  };
}
```

### Error Recovery Pattern
```typescript
async function robustGitHubCall(operation, ...args) {
  try {
    return await operation(...args);
  } catch (error) {
    if (error.message.includes('Not Found')) {
      // Repository or PR not found
      console.log('❌ Repository or PR not accessible');
      console.log('💡 Check repository name and permissions');
      return null;
    }
    
    if (error.message.includes('rate limit')) {
      // Rate limiting
      console.log('⏳ Rate limited, waiting 60 seconds...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      return await operation(...args);
    }
    
    // Other errors
    console.error('Unexpected error:', error.message);
    throw error;
  }
}
```

This integration pattern provides robust GitHub MCP usage with proper error handling and context creation for the debug_pr command.