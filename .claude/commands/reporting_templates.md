# PR Debugging Reporting Templates

## Overview
This document provides standardized reporting templates for documenting PR debugging results, ensuring consistent communication and knowledge capture across all debug_pr command executions.

## Main Report Template

### Executive Debug Report
```markdown
# PR Debug Report: #{PR_NUMBER}

**Generated**: {timestamp}
**Repository**: {owner}/{repo}
**Branch**: {head_branch} → {base_branch}
**Debug Duration**: {total_time}
**Status**: {READY|BLOCKED|IN_PROGRESS}

## Executive Summary

**Issue Count**: {total_issues} ({critical_count} critical, {warning_count} warnings, {info_count} info)
**Automated Fixes Applied**: {auto_fixed_count} issues resolved
**Manual Actions Required**: {manual_count} actions needed
**Estimated Resolution Time**: {time_estimate}

### Quick Status
- ✅ **Reproduction**: {reproduction_status}
- ✅ **Analysis**: {analysis_status}  
- 🔧 **Resolution**: {resolution_status}
- 🧪 **Verification**: {verification_status}

---

## Issues Found

### 🚨 Critical Issues (Block Merge)
{critical_issues_section}

### ⚠️ Warnings (Should Fix)
{warnings_section}

### ℹ️ Informational (Optional)
{info_section}

---

## Agent Analysis Results

{agent_results_section}

---

## Resolution Summary

### ✅ Automated Fixes Applied
{automated_fixes_section}

### 🔧 Manual Actions Required
{manual_actions_section}

---

## Verification Results
{verification_section}

---

## Next Steps
{next_steps_section}

---

## Technical Details
{technical_details_section}

---

## Appendices
{appendices_section}
```

## Issue Templates

### Critical Issue Template
```markdown
### Critical Issue #{issue_id}: {issue_title}

**Type**: {Test Failure|Build Error|Merge Conflict|Security Issue}
**Impact**: Blocks merge
**Location**: `{file_path}:{line_number}`
**Agent**: {analyzing_agent}
**Estimated Fix Time**: {time_estimate}

#### Problem Description
{clear_description_of_issue}

#### Reproduction Steps
```bash
{exact_commands_to_reproduce}
```

#### Root Cause Analysis
{evidence_based_root_cause_from_agents}

#### Resolution Strategy
{step_by_step_resolution_approach}

#### Verification Steps
```bash
{commands_to_verify_fix}
```

#### Related Files
- `{file1}` - {purpose}
- `{file2}` - {purpose}

#### Dependencies
{any_blocking_dependencies}
```

### Warning Issue Template
```markdown
### Warning #{issue_id}: {issue_title}

**Type**: {Code Quality|Performance|Documentation}
**Impact**: Should fix before merge
**Location**: `{file_path}:{line_number}`
**Agent**: {analyzing_agent}

#### Description
{brief_issue_description}

#### Quick Fix
{simple_resolution_steps_if_available}

#### Alternative
{can_be_addressed_post_merge_if_urgent}
```

### Info Issue Template  
```markdown
### Info #{issue_id}: {issue_title}

**Type**: {Enhancement|Convention|Documentation}
**Impact**: Optional improvement
**Location**: `{file_path}:{line_number}`

#### Suggestion
{helpful_suggestion_for_improvement}

#### Reference
{link_to_existing_patterns_or_docs}
```

## Agent Result Templates

### codebase-locator Results Template
```markdown
### codebase-locator Analysis

**Files Analyzed**: {file_count}
**Execution Time**: {duration}

#### File Mapping
**Implementation Files**:
- `{file}` - {purpose}

**Test Files**:
- `{test_file}` - {coverage_area}

**Configuration Files**:
- `{config_file}` - {config_purpose}

**Dependencies**:
- `{dependent_file}` - {relationship}

#### Key Findings
- **Scope Impact**: {affected_areas}
- **Missing Coverage**: {gaps_identified}
- **Critical Paths**: {important_file_relationships}
```

### codebase-analyzer Results Template  
```markdown
### codebase-analyzer Analysis

**Components Analyzed**: {component_count}
**Execution Time**: {duration}

#### Technical Analysis Summary
{high_level_technical_summary}

#### Data Flow Analysis
```
{entry_point} → {processing_steps} → {output_point}
```

#### Integration Points
- **External APIs**: {api_dependencies}
- **Database**: {db_interactions}
- **State Management**: {state_flow}

#### Key Technical Findings
1. **{finding_category}**: {specific_technical_detail}
2. **{finding_category}**: {specific_technical_detail}

#### Error Sources
- `{file}:{line}` - {error_cause}
```

### qa-test-engineer Results Template
```markdown
### qa-test-engineer Analysis

**Tests Analyzed**: {test_count}
**Coverage Assessment**: {coverage_percentage}%
**Quality Gate Status**: {PASS|FAIL}

#### Test Failure Analysis
| Test File | Failure Type | Root Cause | Fix Complexity |
|-----------|--------------|------------|----------------|
| {test_file} | {failure_type} | {cause} | {complexity} |

#### Coverage Gaps
- **Uncovered Scenarios**: {scenarios_list}
- **Edge Cases Missing**: {edge_cases}
- **Integration Gaps**: {integration_missing}

#### Quality Recommendations
1. **{priority}**: {specific_test_improvement}
2. **{priority}**: {specific_test_improvement}

#### Risk Assessment
- **High Risk**: {high_risk_areas}
- **Medium Risk**: {medium_risk_areas}
- **Low Risk**: {acceptable_gaps}
```

### code-analyzer-debugger Results Template
```markdown
### code-analyzer-debugger Investigation

**Investigation Time**: {duration}
**Hypotheses Tested**: {hypothesis_count}
**Evidence Collected**: {evidence_count}

#### Investigation Timeline
1. **{timestamp}**: {investigation_step}
2. **{timestamp}**: {investigation_step}
3. **{timestamp}**: {conclusion_reached}

#### Root Cause Analysis
**Primary Cause**: {main_root_cause}
**Contributing Factors**:
- {factor_1}
- {factor_2}

#### Evidence Matrix
| Hypothesis | Supporting Evidence | Contradicting Evidence | Conclusion |
|------------|-------------------|----------------------|------------|
| {hypothesis} | {evidence_for} | {evidence_against} | {valid/invalid} |

#### Reproduction Confirmation
```bash
{exact_reproduction_steps_verified}
```

#### Technical Solution Path
{evidence_based_solution_approach}
```

### thoughts-analyzer Results Template
```markdown
### thoughts-analyzer Historical Context

**Documents Analyzed**: {doc_count}
**Relevant Entries Found**: {relevant_count}
**Historical Timeframe**: {date_range}

#### Key Historical Insights
1. **{insight_category}**: {actionable_insight}
2. **{insight_category}**: {actionable_insight}

#### Previous Similar Issues
- **{date}**: {similar_issue} - {resolution_approach}
- **{date}**: {similar_issue} - {resolution_approach}

#### Team Decisions Affecting Current Work
- **{decision_topic}**: {specific_decision} (Source: {document})
- **{decision_topic}**: {specific_decision} (Source: {document})

#### Documented Constraints
- **{constraint_type}**: {specific_limitation}
- **{constraint_type}**: {specific_limitation}

#### Lessons Learned
- **{pattern_to_follow}**: {specific_guidance}
- **{pattern_to_avoid}**: {specific_warning}

#### Relevance Assessment
{assessment_of_historical_context_applicability}
```

## Automated Fix Templates

### Safe Automated Fixes Summary
```markdown
### ✅ Automated Fixes Applied

**Total Fixes**: {auto_fix_count}
**Execution Time**: {duration}
**Success Rate**: {success_percentage}%

#### ESLint Fixes
```bash
npm run lint --fix
```
**Result**: {lint_fix_count} issues resolved
**Files Modified**: {modified_file_count}

#### Test Snapshot Updates  
```bash
npm test -- --updateSnapshot
```
**Result**: {snapshot_count} snapshots updated
**Test Files**: {test_file_list}

#### Import Path Corrections
**Result**: {import_fix_count} import statements corrected
**Files**: {files_with_import_fixes}

#### Git Conflict Resolution
**Conflicts Resolved**: {simple_conflict_count}
**Strategy**: {auto_resolution_strategy}
**Files**: {conflict_files}

#### Verification
All automated fixes have been verified with:
```bash
npm test && npm run lint && npm run build
```
**Status**: ✅ All checks pass
```

### Manual Action Templates

#### Complex Manual Fix Template
```markdown
### 🔧 Manual Action Required: {action_title}

**Priority**: {High|Medium|Low}
**Estimated Time**: {time_estimate}
**Complexity**: {Simple|Moderate|Complex}
**Dependencies**: {blocking_dependencies}

#### Problem
{clear_problem_description}

#### Solution Approach
{step_by_step_solution_strategy}

#### Implementation Steps
1. **{step_title}**: {detailed_step_instruction}
   ```bash
   {specific_commands_if_applicable}
   ```
2. **{step_title}**: {detailed_step_instruction}
3. **{step_title}**: {detailed_step_instruction}

#### Files to Modify
- `{file_path}` - {modification_description}
- `{file_path}` - {modification_description}

#### Testing Strategy
```bash
{verification_commands}
```

#### Rollback Plan
{how_to_undo_if_something_goes_wrong}

#### Success Criteria
- [ ] {specific_success_criterion}
- [ ] {specific_success_criterion}
- [ ] All tests pass
- [ ] Build succeeds
```

## Verification Report Template

### Comprehensive Verification Results
```markdown
### 🧪 Verification Results

**Verification Time**: {timestamp}
**Environment**: {node_version}, {npm_version}
**Verification Method**: {Full CI Simulation|Local Testing|Selective Testing}

#### Test Results
```bash
npm test
```
**Exit Code**: {exit_code}
**Duration**: {test_duration}
**Results**: {pass_count} passed, {fail_count} failed, {skip_count} skipped

{test_failure_details_if_any}

#### Build Verification
```bash
npm run build
```
**Exit Code**: {exit_code}
**Duration**: {build_duration}
**Bundle Size**: {bundle_size_info}

{build_issues_if_any}

#### Code Quality
```bash
npm run lint && npx tsc --noEmit
```
**ESLint**: {pass_fail} ({error_count} errors, {warning_count} warnings)
**TypeScript**: {pass_fail} ({error_count} type errors)

#### E2E Verification (if applicable)
```bash
npm run test:e2e
```
**Status**: {pass_fail}
**Critical Paths Tested**: {path_list}

#### Performance Impact
- **Bundle Size Change**: {size_delta}
- **Test Suite Duration Change**: {time_delta}
- **Memory Usage**: {memory_usage}

#### Final Verification Status
| Check | Status | Details |
|-------|---------|---------|
| Tests | {✅|❌} | {summary} |
| Build | {✅|❌} | {summary} |  
| Lint | {✅|❌} | {summary} |
| TypeScript | {✅|❌} | {summary} |
| E2E | {✅|❌} | {summary} |

**Overall Status**: {🚀 READY FOR MERGE|🔧 NEEDS WORK|🚨 BLOCKED}
```

## Next Steps Template

### Actionable Next Steps
```markdown
### 🎯 Next Steps

#### Immediate Actions (< 30 min)
1. **{action}** - {description} ({time_estimate})
2. **{action}** - {description} ({time_estimate})

#### Short-term Actions (< 2 hours)  
1. **{action}** - {description} ({time_estimate})
2. **{action}** - {description} ({time_estimate})

#### Follow-up Actions (Post-merge)
1. **{action}** - {description}
2. **{action}** - {description}

#### Dependencies Waiting On
- **{dependency}**: {description} (Owner: {person})
- **{dependency}**: {description} (ETA: {estimate})

#### Review Requirements
- **Code Review**: {reviewer_suggestions}
- **Technical Review**: {technical_areas_needing_review}
- **QA Sign-off**: {qa_requirements}

#### Merge Checklist
- [ ] All automated fixes verified
- [ ] Manual actions completed  
- [ ] Tests passing
- [ ] Build successful
- [ ] Code review approved
- [ ] No merge conflicts
- [ ] CI/CD pipeline green

#### Post-Merge Monitoring
- [ ] Monitor deployment for {specific_metrics}
- [ ] Watch for {potential_issues}
- [ ] Follow up on {post_merge_actions}
```

## Progress Documentation Template

### PROGRESS.md Update Template
```markdown
---

# PR #{pr_number} Debug Resolution - COMPLETED ✅

## Approach  
{systematic_approach_description}

## Issues Identified & Resolved
- ✅ **{issue_type}**: {issue_description}
  - Root Cause: {root_cause}
  - Resolution: {solution_applied}
  - Verification: {verification_method}

## Agent Analysis Summary
- **codebase-locator**: {key_findings}
- **codebase-analyzer**: {technical_insights}
- **qa-test-engineer**: {quality_assessment}
- **code-analyzer-debugger**: {investigation_results}
- **thoughts-analyzer**: {historical_context}

## Current Status
**RESOLVED** - All blocking issues addressed and verified

## Files Modified
{list_of_modified_files_with_purposes}

## Lessons Learned
- **Pattern**: {reusable_pattern_identified}
- **Approach**: {effective_debugging_technique}
- **Prevention**: {how_to_avoid_similar_issues}

## Future Considerations
- {technical_debt_or_improvements_noted}
- {process_improvements_identified}

---
```

## Error Report Template

### Debug Command Failure Report
```markdown
# Debug PR Command Error Report

**Timestamp**: {error_timestamp}
**Command**: `debug_pr {options}`
**Exit Code**: {exit_code}
**Duration Before Failure**: {duration}

## Error Summary
**Error Type**: {github_api|agent_timeout|local_environment|other}
**Primary Error**: {main_error_message}

## Reproduction Context
**Repository**: {repo_info}
**Branch**: {branch_info}  
**Local Environment**: {environment_details}
**Git Status**: {git_status_summary}

## Error Details
```
{full_error_output_and_stack_trace}
```

## Recovery Actions Attempted
- {recovery_action_1}
- {recovery_action_2}

## Manual Fallback Required
{what_user_should_do_manually}

## Error Classification
- [ ] Transient (retry may succeed)
- [ ] Environmental (local setup issue)  
- [ ] Service (GitHub API/external dependency)
- [ ] Bug (debug_pr command issue)

## Recommended Resolution
{specific_steps_to_resolve_error}
```

## Summary Templates

### One-Line Status Summary
```markdown
**PR #{pr_number}**: {✅ READY|🔧 {issue_count} issues|🚨 BLOCKED} - {time_estimate} remaining
```

### Slack/Chat Summary Template
```markdown
🔍 **PR #{pr_number} Debug Complete**
📊 Found {issue_count} issues: {critical}/{warning}/{info}
🤖 Auto-fixed: {auto_fix_count}
🔧 Manual work: {manual_count} items ({time_estimate})
✅ Status: {READY_FOR_MERGE|NEEDS_WORK|BLOCKED}

{critical_blocker_summary_if_any}

📋 Full report: {link_to_detailed_report}
```

These comprehensive reporting templates ensure consistent documentation of debug_pr command results while providing clear communication for both technical teams and stakeholders.