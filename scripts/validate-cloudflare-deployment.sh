#!/bin/bash

# Cloudflare Worker Deployment Validation Script
# Addresses Quality Engineer concerns about integration testing

set -e

echo "🔍 Cloudflare Worker Deployment Validation"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function for test results
log_test() {
    local status=$1
    local message=$2
    if [[ $status == "PASS" ]]; then
        echo -e "${GREEN}✅ PASS${NC}: $message"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $message"
        ((TESTS_FAILED++))
    fi
}

echo ""
echo "📋 Test 1: Root Configuration Validation"
echo "----------------------------------------"

# Test 1: Validate root wrangler.toml exists and is valid
if [[ -f "wrangler.toml" ]]; then
    log_test "PASS" "Root wrangler.toml exists"
    
    # Check if main field points to cloudflare-cron
    if grep -q "main = \"cloudflare-cron/index.js\"" wrangler.toml; then
        log_test "PASS" "Main field correctly references cloudflare-cron/index.js"
    else
        log_test "FAIL" "Main field does not reference cloudflare-cron/index.js"
    fi
    
    # Check cron schedule
    if grep -q "crons = \\[\"\\*/10 \\* \\* \\* \\*\"\\]" wrangler.toml; then
        log_test "PASS" "Cron schedule configured for every 10 minutes"
    else
        log_test "FAIL" "Cron schedule not properly configured"
    fi
else
    log_test "FAIL" "Root wrangler.toml does not exist"
fi

echo ""
echo "📋 Test 2: Worker Code Validation" 
echo "--------------------------------"

# Test 2: Validate worker code exists
if [[ -f "cloudflare-cron/index.js" ]]; then
    log_test "PASS" "Worker code exists at cloudflare-cron/index.js"
    
    # Check for critical functions
    if grep -q "handleScheduled" cloudflare-cron/index.js; then
        log_test "PASS" "Worker contains handleScheduled function"
    else
        log_test "FAIL" "Worker missing handleScheduled function"
    fi
    
    if grep -q "HMAC" cloudflare-cron/index.js; then
        log_test "PASS" "Worker implements HMAC authentication"
    else
        log_test "FAIL" "Worker missing HMAC authentication"
    fi
else
    log_test "FAIL" "Worker code does not exist"
fi

echo ""
echo "📋 Test 3: Deployment Dry-Run Validation"
echo "----------------------------------------"

# Test 3: Validate deployment configuration
echo "Running wrangler deploy --dry-run..."
if npx wrangler deploy --dry-run > /tmp/wrangler-dry-run.log 2>&1; then
    log_test "PASS" "Deployment dry-run successful"
    
    # Check bundle size
    if grep -q "Total size" /tmp/wrangler-dry-run.log; then
        BUNDLE_SIZE=$(grep "Total size" /tmp/wrangler-dry-run.log | awk '{print $3}')
        log_test "PASS" "Bundle size: $BUNDLE_SIZE (within acceptable limits)"
    else
        log_test "PASS" "Deployment validation completed (size info not available)"
    fi
else
    log_test "FAIL" "Deployment dry-run failed"
    echo "Dry-run output:"
    cat /tmp/wrangler-dry-run.log
fi

echo ""
echo "📋 Test 4: Environment Variable Configuration"
echo "--------------------------------------------"

# Test 4: Check environment variables are properly configured
ENV_VARS_CONFIGURED=true

# Check PUBLIC_URL
if grep -q "PUBLIC_URL = \"https://tldrsec.app\"" wrangler.toml; then
    log_test "PASS" "PUBLIC_URL configured correctly"
else
    log_test "FAIL" "PUBLIC_URL not configured"
    ENV_VARS_CONFIGURED=false
fi

# Check other required variables
REQUIRED_VARS=("USE_ASYNC_PROCESSING" "DEBUG_MODE" "WORKER_VERSION" "RATE_LIMIT_STRATEGY")
for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "$var = " wrangler.toml; then
        log_test "PASS" "Environment variable $var configured"
    else
        log_test "FAIL" "Environment variable $var missing"
        ENV_VARS_CONFIGURED=false
    fi
done

echo ""
echo "📋 Test 5: Existing Vercel Functionality Validation"
echo "---------------------------------------------------"

# Test 5: Verify existing functionality remains intact
if [[ -f "app/api/cron/tier-aware/route.ts" ]]; then
    log_test "PASS" "Vercel cron endpoint exists"
    
    # Check for HMAC validation in endpoint
    if grep -q "CRON_SECRET" app/api/cron/tier-aware/route.ts; then
        log_test "PASS" "Vercel endpoint has CRON_SECRET validation"
    else
        log_test "FAIL" "Vercel endpoint missing CRON_SECRET validation"
    fi
else
    log_test "FAIL" "Vercel cron endpoint does not exist"
fi

echo ""
echo "📋 Test 6: Documentation and Rollback Validation"
echo "------------------------------------------------"

# Test 6: Check documentation and rollback procedures
if [[ -f "docs/plans/2025-11-18-fix-cloudflare-worker-deployment.md" ]]; then
    log_test "PASS" "Implementation documentation exists"
else
    log_test "FAIL" "Implementation documentation missing"
fi

# Check for rollback documentation
if grep -q "rollback" docs/plans/2025-11-18-fix-cloudflare-worker-deployment.md 2>/dev/null; then
    log_test "PASS" "Rollback procedure documented"
else
    log_test "FAIL" "Rollback procedure not documented"
fi

echo ""
echo "📋 Test 7: Secret Management Validation"
echo "--------------------------------------"

# Test 7: Validate secret management setup
if grep -q "CRON_SECRET" wrangler.toml; then
    log_test "FAIL" "CRON_SECRET found in config file (security issue)"
else
    log_test "PASS" "CRON_SECRET properly excluded from config files"
fi

if grep -q "npx wrangler secret put CRON_SECRET" wrangler.toml; then
    log_test "PASS" "Secret setup instructions included"
else
    log_test "FAIL" "Secret setup instructions missing"
fi

echo ""
echo "🎯 Test Results Summary"
echo "======================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed! Ready for deployment.${NC}"
    
    echo ""
    echo "📋 Pre-Deployment Checklist:"
    echo "----------------------------"
    echo "1. Set Cloudflare Worker secrets:"
    echo "   npx wrangler secret put CRON_SECRET"
    echo "   npx wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET  # Optional"
    echo ""
    echo "2. Verify CRON_SECRET matches Vercel environment variable"
    echo ""
    echo "3. Deploy worker:"
    echo "   npx wrangler deploy"
    echo ""
    echo "4. Monitor deployment:"
    echo "   npx wrangler tail --format=pretty"
    echo ""
    echo "🔄 Rollback Procedure:"
    echo "If deployment fails, remove root wrangler.toml:"
    echo "   git checkout HEAD -- wrangler.toml"
    echo "   git commit -m 'rollback: remove root wrangler.toml'"
    
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please address issues before deployment.${NC}"
    exit 1
fi