# Issue Reproduction and Verification Workflows

## Overview
This document provides systematic approaches for reproducing PR issues locally and verifying fixes before merge. Reproduction-first methodology ensures we're solving actual problems, not symptoms.

## Issue Reproduction Framework

### Reproduction Philosophy
1. **Reproduce Before Analyzing**: Never assume you understand an issue without reproducing it
2. **Environment Matching**: Match CI/CD environment as closely as possible
3. **Evidence Collection**: Capture complete error output and environmental context
4. **Systematic Testing**: Use consistent, repeatable reproduction steps

### General Reproduction Workflow

#### 1. Environment Preparation
```bash
# Ensure clean environment matching CI/CD
git status --porcelain  # Should be empty
git checkout [target-branch]
git pull origin [target-branch]

# Match Node/npm versions with CI
nvm use $(cat .nvmrc || echo "20")  # Use project version or default
npm ci  # Use exact lock file versions

# Verify environment matches CI
node --version
npm --version
git rev-parse HEAD  # Note exact commit
```

#### 2. Systematic Issue Categories

### Category 1: Test Failures

#### Test Failure Reproduction
```bash
# Step 1: Reproduce exact failing tests
npm test [specific-test-file]  # Run only failing tests
npm test -- --verbose         # Get detailed output
npm test -- --no-cache       # Ensure no cache issues

# Step 2: Capture complete output
npm test 2>&1 | tee test_reproduction.log

# Step 3: Analyze test expectations vs reality
grep -A 5 -B 5 "Expected\|Received\|AssertionError" test_reproduction.log

# Step 4: Environment-specific testing
npm test -- --detectOpenHandles  # Check for async issues
npm test -- --forceExit          # Check for hanging processes
```

#### Test Failure Analysis Template
```bash
#!/bin/bash
# Test Reproduction Script
set -e

echo "=== Test Reproduction Analysis ==="
echo "Date: $(date)"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Commit: $(git rev-parse HEAD)"
echo "Node: $(node --version)"
echo "NPM: $(npm --version)"
echo ""

echo "=== Running Specific Failing Test ==="
echo "Command: npm test $1"
npm test "$1" 2>&1 | tee "test_output_$(date +%s).log"

echo ""
echo "=== Test Analysis ==="
# Extract key information from test output
echo "Failed Assertions:"
grep -n "Expected\|Received\|AssertionError" "test_output_$(date +%s).log" || echo "No assertion failures found"

echo ""
echo "Stack Traces:"
grep -A 10 "at.*test" "test_output_$(date +%s).log" || echo "No stack traces found"

echo ""
echo "Environment Issues:"
grep -i "timeout\|memory\|async\|promise\|handle" "test_output_$(date +%s).log" || echo "No environment issues detected"
```

### Category 2: Build Failures

#### Build Failure Reproduction
```bash
# Step 1: Clean build environment
rm -rf node_modules package-lock.json
npm ci

# Step 2: Reproduce build with verbose output  
npm run build 2>&1 | tee build_reproduction.log

# Step 3: TypeScript specific issues (if applicable)
npx tsc --noEmit --listFiles > typescript_files.log 2>&1
npx tsc --showConfig > typescript_config.log

# Step 4: Dependency analysis
npm ls > dependency_tree.log 2>&1
npm audit > security_audit.log 2>&1
```

#### Build Issue Analysis
```bash
#!/bin/bash
# Build Reproduction Script
set -e

echo "=== Build Reproduction Analysis ==="
echo "Date: $(date)"
echo "Environment: $(uname -a)"
echo "Node: $(node --version)"
echo "NPM: $(npm --version)"
echo ""

# Clean environment
echo "=== Cleaning Environment ==="
rm -rf node_modules package-lock.json .next build dist

# Install dependencies
echo "=== Installing Dependencies ==="
npm ci

# Reproduce build
echo "=== Reproducing Build ==="
npm run build 2>&1 | tee "build_output_$(date +%s).log"
BUILD_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== Build Analysis ==="
echo "Build exit code: $BUILD_EXIT_CODE"

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "Build Failed - Analyzing errors:"
    
    echo "TypeScript Errors:"
    grep -n "error TS" "build_output_$(date +%s).log" || echo "No TypeScript errors"
    
    echo "Module Resolution Errors:"
    grep -n "Cannot resolve\|Module not found" "build_output_$(date +%s).log" || echo "No module resolution errors"
    
    echo "Syntax Errors:"
    grep -n "SyntaxError\|Unexpected token" "build_output_$(date +%s).log" || echo "No syntax errors"
    
    echo "Memory/Resource Issues:"
    grep -n "out of memory\|ENOMEM\|heap" "build_output_$(date +%s).log" || echo "No memory issues"
else
    echo "Build Succeeded"
fi
```

### Category 3: Linting/Code Quality Issues

#### Lint Issue Reproduction
```bash
# Step 1: Reproduce exact lint failures
npm run lint 2>&1 | tee lint_reproduction.log

# Step 2: Detailed ESLint analysis
npx eslint . --format=unix --output-file=eslint_detailed.log
npx eslint . --format=json --output-file=eslint_json.log

# Step 3: TypeScript checking (if applicable)
npx tsc --noEmit 2>&1 | tee typescript_check.log

# Step 4: Prettier formatting check
npx prettier --check . 2>&1 | tee prettier_check.log
```

#### Lint Analysis Template
```bash
#!/bin/bash
# Lint Reproduction Script

echo "=== Lint Reproduction Analysis ==="

# Run all linting tools
echo "=== ESLint Analysis ==="
npm run lint 2>&1 | tee "eslint_output_$(date +%s).log"
ESLINT_EXIT_CODE=${PIPESTATUS[0]}

echo "=== TypeScript Analysis ==="
npx tsc --noEmit 2>&1 | tee "typescript_output_$(date +%s).log"
TSC_EXIT_CODE=${PIPESTATUS[0]}

echo "=== Prettier Analysis ==="
npx prettier --check . 2>&1 | tee "prettier_output_$(date +%s).log"
PRETTIER_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== Summary ==="
echo "ESLint exit code: $ESLINT_EXIT_CODE"
echo "TypeScript exit code: $TSC_EXIT_CODE" 
echo "Prettier exit code: $PRETTIER_EXIT_CODE"

# Categorize issues
echo ""
echo "=== Issue Categories ==="
echo "Auto-fixable ESLint issues:"
grep -c "✖.*fixable with.*--fix" "eslint_output_$(date +%s).log" || echo "0"

echo "TypeScript type errors:"
grep -c "error TS" "typescript_output_$(date +%s).log" || echo "0"

echo "Formatting issues:"
grep -c "Code style issues found" "prettier_output_$(date +%s).log" || echo "0"
```

### Category 4: Merge Conflicts

#### Merge Conflict Analysis
```bash
# Step 1: Identify conflict sources
git status --porcelain | grep "^UU\|^AA\|^DD"

# Step 2: Analyze conflict complexity
git diff --check  # Check for whitespace issues
git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main > merge_analysis.txt

# Step 3: Understand conflicting changes
git log --oneline --graph HEAD...origin/main

# Step 4: Identify conflict resolution strategy
git show-branch HEAD origin/main
```

### Category 5: CI/CD Environment Differences

#### CI Environment Simulation
```bash
#!/bin/bash
# Simulate CI Environment

echo "=== CI Environment Simulation ==="

# Use exact CI node version
echo "Setting up Node version from CI config..."
if [ -f ".github/workflows/ci.yml" ]; then
    CI_NODE_VERSION=$(grep -o "node-version: [0-9]*" .github/workflows/ci.yml | cut -d' ' -f2)
    echo "CI uses Node $CI_NODE_VERSION"
    nvm use "$CI_NODE_VERSION" || echo "Warning: Could not switch to Node $CI_NODE_VERSION"
fi

# Clean install like CI
echo "Clean installing dependencies..."
rm -rf node_modules package-lock.json
npm ci

# Set CI environment variables
export CI=true
export NODE_ENV=test

# Run same commands as CI
echo "Running CI test sequence..."
npm run lint
npm run typecheck
npm run test
npm run build

echo "CI simulation complete"
```

## Advanced Reproduction Techniques

### 1. Race Condition Reproduction
```bash
# For intermittent failures that might be race conditions
for i in {1..10}; do
    echo "Test run $i"
    npm test [failing-test] || echo "Failed on run $i"
done

# Concurrent execution testing
npm test & npm test & npm test &
wait
```

### 2. Memory/Performance Issue Reproduction
```bash
# Monitor memory usage during tests
/usr/bin/time -v npm test 2>&1 | tee memory_usage.log

# Check for memory leaks
node --max-old-space-size=512 ./node_modules/.bin/jest
node --inspect ./node_modules/.bin/jest  # For debugging
```

### 3. Timing-Dependent Issue Reproduction
```bash
# Add artificial delays to expose timing issues
export NODE_OPTIONS="--max-old-space-size=4096"
npm test -- --detectOpenHandles --forceExit

# Run with different timing
npm test -- --testTimeout=10000  # Longer timeout
npm test -- --maxWorkers=1       # Single threaded
```

## Verification Frameworks

### Pre-Fix Verification Checklist
```bash
#!/bin/bash
# Pre-Fix Verification Script

echo "=== Pre-Fix State Verification ==="

# 1. Confirm issues exist
echo "1. Confirming issue reproduction..."
npm test 2>&1 | grep -q "FAIL\|failing" && echo "✅ Issues confirmed" || echo "❌ No issues found"

# 2. Document current state
echo "2. Documenting current state..."
git status > pre_fix_git_status.log
npm test 2>&1 | tee pre_fix_test_results.log
npm run lint 2>&1 | tee pre_fix_lint_results.log

# 3. Create baseline metrics
echo "3. Creating baseline metrics..."
echo "Failed tests: $(grep -c 'FAIL' pre_fix_test_results.log)"
echo "ESLint errors: $(grep -c 'error' pre_fix_lint_results.log)"
echo "TypeScript errors: $(npx tsc --noEmit 2>&1 | grep -c 'error')"

echo "Pre-fix verification complete"
```

### Post-Fix Verification Workflow
```bash
#!/bin/bash
# Post-Fix Verification Script

echo "=== Post-Fix Verification ==="

# 1. Run all quality checks
echo "1. Running comprehensive test suite..."
npm test 2>&1 | tee post_fix_test_results.log
TEST_EXIT_CODE=${PIPESTATUS[0]}

echo "2. Running code quality checks..."
npm run lint 2>&1 | tee post_fix_lint_results.log  
LINT_EXIT_CODE=${PIPESTATUS[0]}

echo "3. Running build verification..."
npm run build 2>&1 | tee post_fix_build_results.log
BUILD_EXIT_CODE=${PIPESTATUS[0]}

echo "4. Running type checking..."
npx tsc --noEmit 2>&1 | tee post_fix_typescript_results.log
TSC_EXIT_CODE=${PIPESTATUS[0]}

# 2. Compare with pre-fix state
echo ""
echo "=== Verification Results ==="
echo "Tests: $([[ $TEST_EXIT_CODE -eq 0 ]] && echo "✅ PASS" || echo "❌ FAIL")"
echo "Lint: $([[ $LINT_EXIT_CODE -eq 0 ]] && echo "✅ PASS" || echo "❌ FAIL")"  
echo "Build: $([[ $BUILD_EXIT_CODE -eq 0 ]] && echo "✅ PASS" || echo "❌ FAIL")"
echo "TypeScript: $([[ $TSC_EXIT_CODE -eq 0 ]] && echo "✅ PASS" || echo "❌ FAIL")"

# 3. Regression testing
echo ""
echo "=== Regression Analysis ==="
if [ -f "pre_fix_test_results.log" ]; then
    PRE_FAILURES=$(grep -c 'FAIL' pre_fix_test_results.log)
    POST_FAILURES=$(grep -c 'FAIL' post_fix_test_results.log)
    echo "Test failures: $PRE_FAILURES → $POST_FAILURES"
fi

# 4. Overall verdict
if [[ $TEST_EXIT_CODE -eq 0 && $LINT_EXIT_CODE -eq 0 && $BUILD_EXIT_CODE -eq 0 && $TSC_EXIT_CODE -eq 0 ]]; then
    echo ""
    echo "🎉 ALL CHECKS PASSED - Ready for merge!"
else
    echo ""
    echo "❌ Some checks failed - Additional work needed"
fi
```

### End-to-End Verification
```bash
#!/bin/bash
# End-to-End Verification (matches CI exactly)

echo "=== End-to-End Verification (CI Simulation) ==="

# Step 1: Fresh environment
echo "1. Creating fresh environment..."
rm -rf node_modules package-lock.json .next build dist
npm ci

# Step 2: All CI checks in order
echo "2. Running CI check sequence..."

echo "  → ESLint..."
npm run lint
LINT_CODE=$?

echo "  → TypeScript..."
npx tsc --noEmit
TSC_CODE=$?

echo "  → Tests..."
npm run test
TEST_CODE=$?

echo "  → Build..."
npm run build
BUILD_CODE=$?

echo "  → E2E tests (if configured)..."
if npm run | grep -q "test:e2e"; then
    npm run test:e2e
    E2E_CODE=$?
else
    E2E_CODE=0
    echo "    (No E2E tests configured)"
fi

# Step 3: Final verification
echo ""
echo "=== Final Verification Results ==="
echo "ESLint:     $([[ $LINT_CODE -eq 0 ]] && echo "✅" || echo "❌") ($LINT_CODE)"
echo "TypeScript: $([[ $TSC_CODE -eq 0 ]] && echo "✅" || echo "❌") ($TSC_CODE)"
echo "Tests:      $([[ $TEST_CODE -eq 0 ]] && echo "✅" || echo "❌") ($TEST_CODE)"
echo "Build:      $([[ $BUILD_CODE -eq 0 ]] && echo "✅" || echo "❌") ($BUILD_CODE)"
echo "E2E:        $([[ $E2E_CODE -eq 0 ]] && echo "✅" || echo "❌") ($E2E_CODE)"

TOTAL_CODE=$((LINT_CODE + TSC_CODE + TEST_CODE + BUILD_CODE + E2E_CODE))

if [[ $TOTAL_CODE -eq 0 ]]; then
    echo ""
    echo "🚀 READY FOR MERGE - All CI checks would pass!"
    exit 0
else
    echo ""
    echo "🔧 NEEDS WORK - Some CI checks would fail"
    exit 1
fi
```

## Issue-Specific Reproduction Guides

### Flaky Test Investigation
```bash
# Run test multiple times to identify flakiness patterns
for run in {1..20}; do
    echo "Run $run: $(date)"
    timeout 30s npm test [test-file] && echo "PASS" || echo "FAIL"
done | tee flaky_test_analysis.log

# Analyze patterns
echo "Pass rate: $(grep -c PASS flaky_test_analysis.log)/20"
echo "Failure pattern: $(grep -B1 -A1 FAIL flaky_test_analysis.log)"
```

### Performance Regression Detection
```bash
# Baseline performance on main branch
git checkout main
npm ci
time npm test > main_performance.log 2>&1

# Compare with PR branch  
git checkout [pr-branch]
npm ci
time npm test > pr_performance.log 2>&1

# Analyze difference
echo "Performance comparison:"
grep "real.*user.*sys" main_performance.log
grep "real.*user.*sys" pr_performance.log
```

### Environment Variable Issues
```bash
# Test with different environment configurations
export NODE_ENV=test && npm test
export NODE_ENV=development && npm test
export NODE_ENV=production && npm test

# Missing environment variables
env -i PATH=$PATH npm test  # Minimal environment
```

This comprehensive reproduction and verification framework ensures that all issues are properly reproduced before analysis and thoroughly verified after fixes, following the evidence-based approach of the debug_pr command.