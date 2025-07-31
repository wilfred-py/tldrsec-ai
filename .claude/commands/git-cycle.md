# Claude Command: Git Cycle

This command provides a complete Git workflow automation that handles the entire development cycle from commit to merge. It combines atomic commits, branch management, PR creation, comprehensive multi-perspective reviews, and auto-merge functionality.

## Usage

To run the complete Git cycle:
```
/git-cycle
```

With options:
```
/git-cycle --no-verify              # Skip pre-commit checks
/git-cycle --pr-link PR_URL         # Review and merge existing PR
/git-cycle --no-split              # Don't auto-split commits
/git-cycle --no-auto-merge         # Skip auto-merge after approval
```

## What This Command Does

### Complete Workflow
1. **Pre-commit Analysis**: Runs linting, build, and documentation generation (unless `--no-verify`)
2. **Intelligent Commit Creation**: Auto-splits changes into logical atomic commits with emoji conventional format
3. **Branch Management**: Creates appropriately named feature branch if on main
4. **PR Creation**: Pushes branch and creates PR with detailed summary and test plan
5. **Multi-perspective Review**: Conducts comprehensive review from 6 different roles
6. **Auto-merge**: Automatically merges PR after all reviews approve

### Existing PR Workflow (with --pr-link)
1. **PR Analysis**: Fetches existing PR details and changes
2. **Multi-perspective Review**: Conducts the same comprehensive 6-role review
3. **Auto-merge**: Merges if all reviews approve

## Command Behavior Details

### 1. Pre-commit Checks (unless --no-verify)
- Runs `npm run lint` or `pnpm lint` to ensure code quality
- Runs `npm run build` or `pnpm build` to verify build succeeds
- Runs documentation generation if available
- If checks fail, prompts whether to proceed or fix issues

### 2. Commit Analysis and Auto-splitting
- Analyzes `git status` and `git diff` to understand changes
- Automatically detects distinct logical changes that should be separate commits
- Considers splitting based on:
  - Different concerns (unrelated parts of codebase)
  - Different types of changes (features vs fixes vs docs)
  - File patterns (source code vs documentation vs configuration)
  - Logical grouping for easier review
  - Size considerations for clarity

### 3. Atomic Commit Creation
- Creates commits using emoji conventional commit format
- Each commit focuses on a single logical change
- Follows present tense, imperative mood
- Keeps first line under 72 characters
- Uses appropriate emoji and type for each change

### 4. Branch Management
- If on main branch, creates new feature branch with descriptive name
- Branch naming follows pattern: `<type>/<description>` (e.g., `feat/user-authentication`)
- Updates branch name if current branch name doesn't match changes

### 5. PR Creation
- Pushes branch to remote repository
- Creates PR with comprehensive description including:
  - Summary of changes with bullet points
  - Detailed test plan checklist
  - Links related issues
  - Generated with Claude Code attribution

### 6. Multi-perspective Review System
Conducts thorough review from six different perspectives:

#### Product Manager Review
- **Business Value**: Assesses ROI and product goal advancement
- **User Experience**: Evaluates intuitive design and user delight
- **Strategic Alignment**: Confirms alignment with objectives
- **Action**: Provides directives for maximum user/business impact

#### Developer Review
- **Code Quality & Maintainability**: Structure, readability, maintenance
- **Performance & Scalability**: Efficiency at scale
- **Best Practices & Standards**: Coding standards compliance
- **Action**: Complete technical review with immediate improvements

#### Quality Engineer Review
- **Test Coverage**: Unit, integration, and E2E test sufficiency
- **Potential Bugs & Edge Cases**: Comprehensive edge case analysis
- **Regression Risk**: Existing functionality impact assessment
- **Action**: Detailed QA assessment with immediate test additions

#### Security Engineer Review
- **Vulnerabilities**: Security vulnerability assessment
- **Data Handling**: Sensitive data protection validation
- **Compliance**: OWASP, GDPR, HIPAA alignment check
- **Action**: Security assessment with immediate fixes

#### DevOps Review
- **CI/CD Pipeline**: Build/test/deploy process integration
- **Infrastructure & Configuration**: Infrastructure update requirements
- **Monitoring & Alerts**: New monitoring needs identification
- **Action**: DevOps review with immediate infrastructure updates

#### UI/UX Designer Review
- **Visual Consistency**: Brand/design guideline adherence
- **Usability & Accessibility**: Intuitive design and accessibility compliance
- **Interaction Flow**: User flow seamlessness assessment
- **Action**: UI/UX evaluation with immediate enhancements

### 7. Auto-merge Process
- Analyzes all review comments and recommendations
- Checks for approval indicators (labels, comments, GitHub approvals)
- If all reviews approve and no blocking issues:
  - Merges PR using appropriate strategy (squash/rebase based on repo settings)
  - Cleans up feature branch
  - Provides merge confirmation

## Commit Message Format and Emojis

### Conventional Commit Types with Emojis
- ✨ `feat`: New feature
- 🐛 `fix`: Bug fix
- 📝 `docs`: Documentation changes
- 💄 `style`: Code style/formatting
- ♻️ `refactor`: Code refactoring
- ⚡️ `perf`: Performance improvements
- ✅ `test`: Test additions/fixes
- 🔧 `chore`: Tooling, configuration
- 🚀 `ci`: CI/CD improvements
- 🗑️ `revert`: Reverting changes

### Extended Emoji Set
- 🚨 `fix`: Fix compiler/linter warnings
- 🔒️ `fix`: Fix security issues
- 🚚 `refactor`: Move or rename resources
- 🏗️ `refactor`: Architectural changes
- 📦️ `chore`: Update compiled files/packages
- ➕ `chore`: Add dependency
- ➖ `chore`: Remove dependency
- 🧑‍💻 `chore`: Improve developer experience
- 🔍️ `feat`: Improve SEO
- 🏷️ `feat`: Add/update types
- 💬 `feat`: Add/update text and literals
- 🌐 `feat`: Internationalization
- 👔 `feat`: Business logic
- 📱 `feat`: Responsive design
- 🚸 `feat`: UX/usability improvements
- 🩹 `fix`: Simple non-critical fix
- 🥅 `fix`: Catch errors
- 👽️ `fix`: External API changes
- 🔥 `fix`: Remove code/files
- 🎨 `style`: Code structure/format
- 🚑️ `fix`: Critical hotfix
- 🎉 `chore`: Begin project
- 🔖 `chore`: Release/version tags
- 🚧 `wip`: Work in progress
- 💚 `fix`: Fix CI build
- 📌 `chore`: Pin dependencies
- 👷 `ci`: CI build system
- 📈 `feat`: Analytics/tracking
- ✏️ `fix`: Fix typos
- ⏪️ `revert`: Revert changes
- 📄 `chore`: License changes
- 💥 `feat`: Breaking changes
- 🍱 `assets`: Assets
- ♿️ `feat`: Accessibility
- 💡 `docs`: Source code comments
- 🗃️ `db`: Database changes
- 🔊 `feat`: Add logs
- 🔇 `fix`: Remove logs
- 🤡 `test`: Mock things
- 🥚 `feat`: Easter egg
- 🙈 `chore`: .gitignore
- 📸 `test`: Snapshots
- ⚗️ `experiment`: Experiments
- 🚩 `feat`: Feature flags
- 💫 `ui`: Animations/transitions
- ⚰️ `refactor`: Remove dead code
- 🦺 `feat`: Validation
- ✈️ `feat`: Offline support

## Command Options

- `--no-verify`: Skip pre-commit checks (lint, build, docs generation)
- `--pr-link <URL>`: Review and merge existing PR instead of creating new one
- `--no-split`: Don't automatically split commits (create single commit)
- `--no-auto-merge`: Skip automatic merge after reviews (manual merge required)
- `--branch-name <name>`: Specify custom branch name instead of auto-generated
- `--dry-run`: Show what would be done without actually executing

## Examples

### Complete New Feature Cycle
```bash
/git-cycle
```
**Result**: Creates atomic commits, new branch `feat/user-authentication`, pushes, creates PR, reviews from all perspectives, and auto-merges if approved.

### Review Existing PR
```bash
/git-cycle --pr-link https://github.com/user/repo/pull/123
```
**Result**: Conducts comprehensive 6-role review on existing PR and auto-merges if all approve.

### Skip Verification
```bash
/git-cycle --no-verify
```
**Result**: Skips lint/build checks but continues with full workflow.

### Manual Merge Control
```bash
/git-cycle --no-auto-merge
```
**Result**: Completes review process but requires manual merge approval.

## Best Practices Enforced

### Commit Quality
- **Atomic commits**: Each commit serves single purpose
- **Conventional format**: Consistent `<type>: <description>` format
- **Present tense, imperative mood**: Commands like "add feature" not "added feature"
- **Concise messaging**: First line under 72 characters
- **Logical splitting**: Multiple concerns split into separate commits

### Branch Management
- **Descriptive naming**: Branch names reflect actual changes
- **Feature isolation**: Changes isolated from main branch
- **Clean history**: Proper commit organization before PR

### Review Thoroughness
- **Multi-perspective analysis**: Six different role perspectives
- **Immediate action**: No deferrals - "future is now" principle
- **Comprehensive coverage**: Technical, business, security, UX considerations
- **GitHub integration**: Reviews posted directly to PR

### Merge Safety
- **Approval verification**: Confirms all reviews approve before merge
- **Conflict resolution**: Handles merge conflicts appropriately
- **Branch cleanup**: Removes feature branches after successful merge
- **Audit trail**: Maintains complete history of review and merge process

## Error Handling

### Pre-commit Failures
- Prompts user to fix issues or proceed despite failures
- Provides specific error details and suggested fixes

### Commit Splitting Issues
- Falls back to single commit if auto-splitting fails
- Allows manual staging for complex cases

### PR Creation Failures
- Handles authentication issues
- Manages branch naming conflicts
- Deals with remote repository access problems

### Review Process Failures
- Continues with partial reviews if some perspectives fail
- Logs review errors for debugging
- Allows manual review override

### Auto-merge Failures
- Provides detailed failure reasons
- Falls back to manual merge with instructions
- Handles merge conflicts gracefully

## Integration Notes

- **GitHub API**: Uses GitHub API for PR creation, review posting, and merge operations
- **Git Operations**: All git operations use local git configuration and credentials
- **Project Detection**: Auto-detects project type for appropriate lint/build commands
- **Authentication**: Uses existing git and GitHub authentication setup
- **Repository Settings**: Respects repository merge policies and branch protection rules

## Important Notes

- **Immediate Action Philosophy**: All review recommendations must be addressed immediately - no future deferrals
- **Atomic Principle**: Maintains atomic commit structure throughout process
- **Safety First**: Multiple validation steps before any destructive operations
- **Audit Trail**: Complete logging of all operations for transparency
- **Flexibility**: Multiple options to customize workflow while maintaining best practices
- **GitHub Integration**: Seamless integration with GitHub workflows and policies

This command transforms the entire Git workflow from a multi-step manual process into a single, intelligent, automated cycle that maintains code quality, thorough review, and safe merge practices.