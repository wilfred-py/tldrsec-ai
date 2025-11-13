---
description: Push committed changes to remote, create PR, initiate code review, iterate until ready, merge if approved
---

# Push, PR, Review, and Merge

You are tasked with handling the post-commit Git workflow: pushing to remote, creating PR, reviewing iteratively, and merging if approved.

## Process:

### 1. Assess Current State
- Run `git status` to confirm commits exist
- Check current branch name
- If on main/master, create feature branch with descriptive name based on commits
- Ensure branch naming follows: `<type>/<short-description>` (e.g., `feat/email-validation`, `fix/auth-bug`)

### 2. Push to Remote
- Run `git push origin <branch>` or `git push -u origin <branch>` if first push
- Handle any push errors (authentication, conflicts, etc.)
- Verify push succeeded

### 3. Create Pull Request
Use GitHub CLI (`gh`) to create PR:
```bash
gh pr create --title "PR Title" --body "PR Description"
```

**PR Title Format:**
- Imperative mood, present tense
- Concise summary of changes
- Example: "Add email validation with comprehensive security testing"

**PR Body Structure:**
```markdown
## Summary
[Brief overview of what changed and why]

## Changes
- [Change 1]
- [Change 2]
- [Change 3]

## Test Plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing completed

## Related Issues
Closes #[issue-number] (if applicable)

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 4. Initiate Multi-Perspective Code Review

Conduct comprehensive reviews from 6 different perspectives. For EACH perspective:

#### a) Product Manager Review
**Focus Areas:**
- Business value and ROI assessment
- User experience impact
- Strategic alignment with product goals
- Feature completeness

**Action:** Post review comment with:
- Approval/Request Changes decision
- Business impact assessment
- Recommended improvements (if any)

#### b) Developer Review
**Focus Areas:**
- Code quality and maintainability
- Performance and scalability
- Adherence to coding standards
- Architecture consistency
- Documentation completeness

**Action:** Post review comment with:
- Approval/Request Changes decision
- Technical issues found
- Code improvement suggestions
- Performance concerns

#### c) Quality Engineer Review
**Focus Areas:**
- Test coverage (unit, integration, E2E)
- Edge cases and potential bugs
- Regression risk assessment
- Test quality and effectiveness

**Action:** Post review comment with:
- Approval/Request Changes decision
- Missing test scenarios
- Edge cases not covered
- Recommended additional tests

#### d) Security Engineer Review
**Focus Areas:**
- Security vulnerabilities (OWASP Top 10)
- Data handling and privacy
- Authentication/authorization issues
- Input validation and sanitization
- Compliance (GDPR, HIPAA if applicable)

**Action:** Post review comment with:
- Approval/Request Changes decision
- Security issues identified
- Vulnerability severity ratings
- Required security fixes

#### e) DevOps Review
**Focus Areas:**
- CI/CD pipeline compatibility
- Infrastructure and configuration changes
- Monitoring and alerting needs
- Deployment considerations
- Performance monitoring

**Action:** Post review comment with:
- Approval/Request Changes decision
- Infrastructure requirements
- Deployment risks
- Monitoring recommendations

#### f) UI/UX Designer Review
**Focus Areas:**
- Visual consistency with design system
- Usability and accessibility (WCAG)
- User flow and interaction design
- Responsive design considerations

**Action:** Post review comment with:
- Approval/Request Changes decision
- Design inconsistencies
- Accessibility issues
- UX improvements

### 5. Iterative Review Process

After posting all 6 reviews:

1. **Analyze Review Feedback:**
   - Count approvals vs requests for changes
   - Identify blocking issues
   - Categorize issues by severity (critical, important, minor)

2. **Apply Fixes for Issues:**
   - For each blocking issue found:
     - Implement the fix
     - Create atomic commit for the fix
     - Push fix to branch
     - Post comment acknowledging fix

3. **Re-review After Fixes:**
   - Re-run reviews from perspectives that requested changes
   - Verify issues are resolved
   - Update approval status

4. **Track Approval Status:**
   ```
   Product Manager: ✅ Approved
   Developer: ✅ Approved
   Quality Engineer: ⚠️ Requested Changes
   Security Engineer: ✅ Approved
   DevOps: ✅ Approved
   UI/UX Designer: ✅ Approved

   Status: 5/6 approvals (1 pending fixes)
   ```

5. **Iterate Until Ready:**
   - Continue fixing and re-reviewing until all 6 perspectives approve
   - Maximum 3 iteration cycles (prevent infinite loops)
   - If stuck after 3 cycles, report issues and request human intervention

### 6. Merge if Approved

**Approval Criteria:**
- All 6 perspective reviews approve
- No blocking comments remain
- CI checks pass (if configured)
- Branch is up-to-date with base branch

**Merge Process:**
```bash
# Check PR status
gh pr view --json state,mergeable,reviewDecision

# If approved and mergeable:
gh pr merge --squash --delete-branch

# Or use rebase strategy if preferred:
gh pr merge --rebase --delete-branch
```

**Post-Merge:**
- Confirm merge succeeded
- Verify branch was deleted
- Post summary of merge

## Review Comment Format

Use GitHub CLI to post reviews:
```bash
gh pr review <PR-number> --comment --body "Review comment here"
gh pr review <PR-number> --approve --body "Approval comment here"
gh pr review <PR-number> --request-changes --body "Issues found"
```

**Review Comment Structure:**
```markdown
### [Perspective] Review

**Decision:** ✅ Approve / ⚠️ Request Changes

**Summary:**
[Brief assessment from this perspective]

**Issues Found:**
- 🚨 **[Critical]** Issue description and location
- ⚠️ **[Important]** Issue description and location
- 💡 **[Minor]** Suggestion for improvement

**Recommendations:**
1. [Specific actionable recommendation]
2. [Another recommendation]

**Verdict:**
[Final verdict with reasoning]
```

## Error Handling

### Push Failures
- Authentication errors: Check git credentials
- Conflict errors: Fetch and rebase/merge latest changes
- Branch protection: Request appropriate permissions

### PR Creation Failures
- Branch already has PR: Fetch existing PR and proceed to review
- No commits difference: Abort with message
- API errors: Retry with exponential backoff

### Review Process Failures
- Unable to post review: Log error, continue with other reviews
- Timeout: Skip review after 30 seconds
- Rate limits: Wait and retry

### Merge Failures
- Conflicts: Report to user, provide conflict resolution guidance
- Branch protection rules: Request required approvals from humans
- CI failures: Block merge, report failed checks

## Important Rules

1. **Never merge without full approval** - All 6 perspectives must approve
2. **No placeholder comments** - Every review must be substantive
3. **Automatic iteration** - Fix issues automatically when possible
4. **No user interaction required** - Process runs fully autonomously
5. **Maximum 3 fix iterations** - Prevent infinite loops
6. **Document all actions** - Log every step for audit trail
7. **Use GitHub CLI** - All GitHub operations via `gh` command
8. **Atomic fixes** - Each fix is its own commit
9. **Track approval status** - Maintain clear status of all reviews
10. **Post-merge cleanup** - Always delete merged branch

## GitHub CLI Commands Reference

```bash
# Check if PR exists for current branch
gh pr view

# Create PR
gh pr create --title "Title" --body "Body"

# Post review comment
gh pr review --comment --body "Comment"

# Approve PR
gh pr review --approve --body "LGTM"

# Request changes
gh pr review --request-changes --body "Issues found"

# Check PR status
gh pr view --json state,mergeable,reviewDecision

# Merge PR
gh pr merge --squash --delete-branch

# List PR checks
gh pr checks

# View PR diff
gh pr diff
```

## Success Criteria

✅ Branch pushed to remote successfully
✅ PR created with comprehensive description
✅ All 6 perspective reviews completed
✅ All blocking issues fixed
✅ All 6 perspectives approved
✅ PR merged successfully
✅ Branch deleted post-merge
✅ Complete audit trail of all actions

## Example Workflow Output

```
🔍 Assessing current state...
   ✓ On branch: feat/email-validation
   ✓ 3 commits ready to push

🚀 Pushing to remote...
   ✓ Pushed to origin/feat/email-validation

📝 Creating Pull Request...
   ✓ PR #123 created: "Add email validation with security testing"

🔬 Initiating Multi-Perspective Review...

   👔 Product Manager Review...
      ✓ Approved - Strong business value, excellent UX

   💻 Developer Review...
      ⚠️ Requested Changes - Found 2 issues
      - Missing error handling in validation.ts:45
      - Performance concern with regex in validation.ts:67

   🧪 Quality Engineer Review...
      ⚠️ Requested Changes - Missing edge case tests
      - No test for empty string input
      - No test for extremely long input (>10000 chars)

   🔒 Security Engineer Review...
      ✅ Approved - ReDoS protection verified, input sanitization correct

   🏗️ DevOps Review...
      ✅ Approved - CI pipeline compatible, no infra changes needed

   🎨 UI/UX Designer Review...
      ✅ Approved - Error messages clear, consistent with design system

   Status: 4/6 approvals (2 perspectives requested changes)

🔧 Fixing identified issues...
   ✓ Added error handling in validation.ts:45
   ✓ Optimized regex performance in validation.ts:67
   ✓ Added empty string test case
   ✓ Added long input test case
   ✓ Pushed 2 fix commits

🔄 Re-reviewing changed perspectives...

   💻 Developer Review (Re-review)...
      ✅ Approved - Issues resolved, code quality excellent

   🧪 Quality Engineer Review (Re-review)...
      ✅ Approved - Test coverage now comprehensive

   Status: 6/6 approvals ✅

✅ All reviews approved!

🎯 Merging PR...
   ✓ PR #123 merged and closed
   ✓ Branch feat/email-validation deleted

✨ Complete! All changes merged to main.
```

---

Remember: This command operates autonomously. It will push, create PR, conduct comprehensive multi-perspective reviews, fix issues iteratively, and merge only when all 6 perspectives approve. No user interaction required unless errors occur.
