#!/bin/bash

# Test XML Monitoring Script
# This script tests the XML logging and monitoring enhancements for SEC filing fetches
# using the API endpoints we've implemented.

# Colors for output
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m" # No Color

echo -e "${BLUE}=== XML Monitoring Test ====${NC}"

# Test the direct XML monitoring test endpoint
echo -e "\n${YELLOW}Testing XML logging utility with sample XML:${NC}"
curl -s http://localhost:3000/api/test/xml-monitoring | jq .

# Sample filing IDs with XML content
SAMPLE_FILING_IDS=(
  "0001193125-23-164627"  # 10-Q with XML content
  "0001193125-23-088200"  # 10-K with XML content
  "0001193125-23-172056"  # 8-K with XML content
)

# Select a random filing ID if none provided
if [ -z "$1" ]; then
  RANDOM_INDEX=$((RANDOM % ${#SAMPLE_FILING_IDS[@]}))
  FILING_ID=${SAMPLE_FILING_IDS[$RANDOM_INDEX]}
else
  FILING_ID=$1
fi

echo -e "\n${YELLOW}Testing XML monitoring with filing ID: ${FILING_ID}${NC}"

# Make API call to test SEC fetch with XML monitoring
echo -e "\n${YELLOW}Making POST request to SEC fetch monitoring API:${NC}"
curl -s -X POST http://localhost:3000/api/monitoring/sec-fetch \
  -H "Content-Type: application/json" \
  -d "{\"filingId\": \"$FILING_ID\", \"includeXmlSummary\": true}" | jq .

# Get monitoring data with XML analysis
echo -e "\n${YELLOW}Getting XML monitoring data for the last 7 days:${NC}"
curl -s -X GET "http://localhost:3000/api/monitoring/sec-fetch?days=7&xmlOnly=true" | jq .

echo -e "\n${GREEN}XML monitoring test completed${NC}"
