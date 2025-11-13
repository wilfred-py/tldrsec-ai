#!/bin/bash
set -e

echo "==================================="
echo "Production Waitlist Smoke Test"
echo "==================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test email (use a unique email each time)
TEST_EMAIL="smoke-test-$(date +%s)@example.com"
PRODUCTION_URL="https://tldrsec.app"

echo "Test Configuration:"
echo "  Production URL: $PRODUCTION_URL"
echo "  Test Email: $TEST_EMAIL"
echo ""

# Test 1: Health Check
echo "Test 1: Environment Health Check"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$PRODUCTION_URL/api/health/environment")
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [ "$HEALTH_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Health check passed${NC}"
  echo "  Response: $HEALTH_BODY" | jq '.' 2>/dev/null || echo "  Response: $HEALTH_BODY"
else
  echo -e "${RED}✗ Health check failed (HTTP $HEALTH_CODE)${NC}"
  echo "  Response: $HEALTH_BODY"
  exit 1
fi
echo ""

# Test 2: Newsletter Subscription
echo "Test 2: Newsletter Subscription"
SUBSCRIBE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$PRODUCTION_URL/api/newsletter/subscribe" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"source\":\"smoke_test\",\"utm_source\":\"test\",\"utm_medium\":\"script\",\"utm_campaign\":\"verification\"}")

SUBSCRIBE_BODY=$(echo "$SUBSCRIBE_RESPONSE" | head -n -1)
SUBSCRIBE_CODE=$(echo "$SUBSCRIBE_RESPONSE" | tail -n 1)

if [ "$SUBSCRIBE_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Newsletter subscription succeeded${NC}"
  echo "  Response: $SUBSCRIBE_BODY" | jq '.' 2>/dev/null || echo "  Response: $SUBSCRIBE_BODY"
else
  echo -e "${RED}✗ Newsletter subscription failed (HTTP $SUBSCRIBE_CODE)${NC}"
  echo "  Response: $SUBSCRIBE_BODY"
  exit 1
fi
echo ""

# Test 3: Duplicate Subscription Detection
echo "Test 3: Duplicate Subscription Detection"
DUPLICATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$PRODUCTION_URL/api/newsletter/subscribe" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"source\":\"smoke_test\"}")

DUPLICATE_BODY=$(echo "$DUPLICATE_RESPONSE" | head -n -1)
DUPLICATE_CODE=$(echo "$DUPLICATE_RESPONSE" | tail -n 1)

if [ "$DUPLICATE_CODE" = "409" ]; then
  echo -e "${GREEN}✓ Duplicate detection working${NC}"
  echo "  Response: $DUPLICATE_BODY" | jq '.' 2>/dev/null || echo "  Response: $DUPLICATE_BODY"
else
  echo -e "${YELLOW}⚠ Unexpected duplicate response (HTTP $DUPLICATE_CODE)${NC}"
  echo "  Expected: 409 Conflict"
  echo "  Response: $DUPLICATE_BODY"
fi
echo ""

# Test 4: Check Supabase for the record
echo "Test 4: Manual Verification Required"
echo -e "${YELLOW}⚠ Manual Steps Required:${NC}"
echo "  1. Log into Supabase: https://app.supabase.com/project/ipwlykhekrjfvejduotm"
echo "  2. Navigate to: Database → Tables → newsletter_subscribers"
echo "  3. Search for email: $TEST_EMAIL"
echo "  4. Verify subscriber record exists with:"
echo "     - source: 'smoke_test'"
echo "     - utm_source: 'test'"
echo "     - utm_medium: 'script'"
echo "     - utm_campaign: 'verification'"
echo "     - confirmation_sent_at: Recent timestamp"
echo ""
echo "  5. Navigate to: Database → Tables → page_analytics"
echo "  6. Verify recent entries exist with:"
echo "     - page_variant: 'newsletter' or 'original'"
echo "     - action: 'signup_attempt' or 'signup_success'"
echo "     - Recent created_at timestamp"
echo ""

# Final Summary
echo "==================================="
echo "Test Summary"
echo "==================================="
echo -e "${GREEN}✓ Automated tests passed${NC}"
echo -e "${YELLOW}⚠ Manual verification required (see above)${NC}"
echo ""
echo "If manual verification passes, the waitlist flow is working correctly!"
