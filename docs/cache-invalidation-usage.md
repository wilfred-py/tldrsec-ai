# Cache Invalidation System Usage Guide

## Overview

The cache invalidation system allows developers and QA engineers to force refresh cached SEC filing summaries, enabling testing of OpenRouter API integration without permanently affecting production cache performance.

## Prerequisites

### Environment Setup
```bash
# Required environment variables
TESTING_API_KEY=your-secure-testing-key-here
DATABASE_URL=postgresql://...
OPENROUTER_API_KEY=your-openrouter-key
ANTHROPIC_API_KEY=your-anthropic-key (fallback)

# Environment must NOT be production
NODE_ENV=test|dev|staging
```

### Safety Requirements
- ✅ Only works in `test`, `dev`, or `staging` environments
- ❌ Completely blocked in `production` environment
- 🔐 Requires valid `TESTING_API_KEY` for API access
- 📝 All operations are logged and audited

## Usage Methods

### 1. Programmatic API (Recommended)

#### Basic Cache Invalidation
```bash
curl -X POST http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL", "TSLA"],
    "environment": "test",
    "reason": "Testing OpenRouter integration",
    "requesterId": "qa-engineer-001",
    "strategy": "soft"
  }'
```

#### Preview Invalidation (Dry Run)
```bash
curl -X POST http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL"],
    "filingTypes": ["10-K", "10-Q"],
    "environment": "test",
    "reason": "Preview before invalidation",
    "requesterId": "qa-engineer-001",
    "dryRun": true
  }'
```

#### Selective Invalidation by Date Range
```bash
curl -X POST http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL"],
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "environment": "test",
    "reason": "Testing 2024 filings",
    "requesterId": "qa-engineer-001",
    "strategy": "soft"
  }'
```

#### Get Cache Statistics
```bash
curl -X GET http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY"
```

#### Preview Specific Criteria
```bash
curl -X GET "http://localhost:3000/api/testing/cache-invalidation?preview=true&tickers=AAPL,TSLA&environment=test" \
  -H "Authorization: Bearer $TESTING_API_KEY"
```

### 2. Test Script (Comprehensive Testing)

```bash
# Run the comprehensive test script
npx ts-node scripts/test-cache-invalidation.ts

# Or with specific test scenarios
TESTING_API_KEY=your-key npm run test:cache-invalidation
```

### 3. Service Integration (Advanced)

```typescript
import { cacheInvalidationService } from './lib/cache/cache-invalidation-service';

// Preview invalidation
const preview = await cacheInvalidationService.previewInvalidation({
  tickers: ['AAPL', 'TSLA'],
  environment: 'test',
  reason: 'OpenRouter testing',
  requesterId: 'automated-test'
});

// Execute invalidation
const result = await cacheInvalidationService.invalidateCache({
  tickers: ['AAPL'],
  filingTypes: ['10-K'],
  environment: 'test',
  reason: 'Force OpenRouter API call for testing',
  requesterId: 'qa-engineer',
  strategy: 'soft'
});

// Restore if needed
if (result.success && result.affectedSummaries.length > 0) {
  const restored = await cacheInvalidationService.restoreInvalidatedCache(
    result.affectedSummaries
  );
}
```

## Invalidation Strategies

### Soft Invalidation (Recommended)
- **Strategy**: `"soft"`
- **Behavior**: Marks summaries with `forceRefreshFlag = true`
- **Result**: Filing processor skips cache, calls OpenRouter API
- **Safety**: Preserves original summaries, can be restored
- **Use Case**: Standard testing scenarios

### Timestamp Invalidation
- **Strategy**: `"timestamp"`
- **Behavior**: Updates `lastInvalidatedAt` timestamp
- **Result**: Cache logic treats as expired based on timestamp
- **Safety**: Preserves original summaries
- **Use Case**: Time-based cache testing

### Hard Invalidation (Use with Caution)
- **Strategy**: `"hard"`
- **Behavior**: Permanently deletes summary records
- **Result**: Forces complete regeneration from scratch
- **Safety**: ⚠️ **IRREVERSIBLE** - original summaries are lost
- **Use Case**: Only for isolated test environments
- **Requirement**: Must include `"confirmDestructive": true`

## Request Parameters

### Required Fields
- `environment`: `"test" | "dev" | "staging"`
- `reason`: Descriptive reason (10-500 characters)
- `requesterId`: User/system identifier for audit trail

### Optional Targeting
- `tickers`: Array of stock symbols (e.g., `["AAPL", "TSLA"]`)
- `filingTypes`: Array of SEC forms (e.g., `["10-K", "10-Q", "8-K"]`)
- `dateRange`: Object with `start` and `end` dates
- `strategy`: `"soft" | "timestamp" | "hard"` (default: `"soft"`)
- `dryRun`: `boolean` - Preview mode without actual changes

### Safety Flags
- `confirmDestructive`: Required `true` for hard deletion strategy

## Verification Workflow

### 1. Invalidate Cache
```bash
# Step 1: Invalidate summaries for AAPL
curl -X POST http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL"],
    "environment": "test",
    "reason": "Testing OpenRouter integration",
    "requesterId": "qa-test-001"
  }'
```

### 2. Trigger Filing Processing
```bash
# Step 2: Run cron job or filing processor
npm run test:cron-comprehensive

# Or trigger specific filing processing
curl -X POST http://localhost:3000/api/cron/tier-aware \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 3. Verify OpenRouter Calls
Look for these log messages:
```
🔄 CACHE INVALIDATION DETECTED: Forcing OpenRouter call
🤖 STEP 3: INITIATING OPENROUTER AI CALL
🚀 OPENROUTER API CALL INITIATED
✅ OPENROUTER AI CALL COMPLETED
🔄 CACHE INVALIDATION COMPLETE: Cleared force refresh flags
```

### 4. Check Results
```bash
# Verify new summaries were generated
curl -X GET http://localhost:3000/api/summaries \
  -H "Authorization: Bearer $API_KEY"

# Check audit trail
curl -X GET http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY"
```

## Common Use Cases

### OpenRouter Integration Testing
```json
{
  "tickers": ["AAPL"],
  "filingTypes": ["10-K"],
  "environment": "test",
  "reason": "Testing OpenRouter API integration and cost calculation",
  "requesterId": "openrouter-integration-test",
  "strategy": "soft"
}
```

### Model Performance Testing
```json
{
  "tickers": ["TSLA", "NVDA"],
  "dateRange": {
    "start": "2024-01-01",
    "end": "2024-03-31"
  },
  "environment": "dev",
  "reason": "Testing new xAI model performance on Q1 2024 filings",
  "requesterId": "model-performance-test",
  "strategy": "soft"
}
```

### Cost Analysis Testing
```json
{
  "tickers": ["AAPL", "MSFT", "GOOGL"],
  "filingTypes": ["10-Q"],
  "environment": "staging",
  "reason": "Analyzing OpenRouter API costs for quarterly filings",
  "requesterId": "cost-analysis-test",
  "strategy": "timestamp"
}
```

## Error Handling

### Common Errors and Solutions

#### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized",
  "correlationId": "cache_api_abc123"
}
```
**Solution**: Check `TESTING_API_KEY` is set and valid

#### 403 Forbidden (Production Block)
```json
{
  "success": false,
  "error": "Cache invalidation API is disabled in production environment",
  "correlationId": "cache_api_def456"
}
```
**Solution**: Ensure `NODE_ENV` is not `production`

#### 400 Bad Request (Validation)
```json
{
  "success": false,
  "error": "Invalid request format",
  "details": [
    {
      "path": ["reason"],
      "message": "String must contain at least 10 character(s)"
    }
  ]
}
```
**Solution**: Fix validation errors in request body

## Monitoring and Audit

### Log Monitoring
Monitor these log patterns:
- `🔄 CACHE INVALIDATION DETECTED`
- `🤖 OPENROUTER API CALL INITIATED`
- `✅ OPENROUTER AI CALL COMPLETED`
- `🔄 CACHE INVALIDATION COMPLETE`

### Database Audit
Check the `CacheInvalidation` table for audit records:
```sql
SELECT * FROM "CacheInvalidation" 
WHERE "environment" = 'test' 
ORDER BY "createdAt" DESC;
```

### Cost Tracking
Monitor OpenRouter usage after invalidation:
```sql
SELECT 
  ticker.symbol,
  SUM(summary."totalCost") as total_cost,
  COUNT(*) as summary_count
FROM "Summary" summary
JOIN "Ticker" ticker ON summary."tickerId" = ticker.id
WHERE summary."createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY ticker.symbol;
```

## Best Practices

### 1. Always Preview First
```bash
# Preview before executing
curl -X POST ... -d '{"dryRun": true, ...}'
# Then execute without dryRun
curl -X POST ... -d '{"dryRun": false, ...}'
```

### 2. Use Descriptive Reasons
```json
{
  "reason": "Testing OpenRouter xAI integration with 10-K filings for Q4 2024 earnings validation"
}
```

### 3. Target Selectively
```json
{
  "tickers": ["AAPL"],           // Specific company
  "filingTypes": ["10-K"],       // Specific filing type
  "dateRange": {                 // Specific time period
    "start": "2024-10-01",
    "end": "2024-12-31"
  }
}
```

### 4. Verify Results
- Check logs for OpenRouter API calls
- Monitor API usage and costs
- Validate new summaries are generated
- Confirm cache invalidation flags are cleared

### 5. Clean Up After Testing
```bash
# Restore invalidated summaries if needed
curl -X PUT http://localhost:3000/api/testing/cache-invalidation \
  -H "Authorization: Bearer $TESTING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"summaryIds": ["summary-id-1", "summary-id-2"]}'
```

## Troubleshooting

### Cache Not Being Bypassed
1. Check `forceRefreshFlag` is `true` in database
2. Verify filing processor is using updated cache logic
3. Ensure transaction isolation is working correctly

### OpenRouter Calls Not Happening
1. Verify OpenRouter API key is configured
2. Check filing processor is running
3. Monitor for rate limiting or API errors

### Performance Issues
1. Limit invalidation scope with specific criteria
2. Use `preview` to estimate impact before execution
3. Monitor database performance during operations

### Permission Errors
1. Verify `TESTING_API_KEY` is configured correctly
2. Check environment variables are loaded
3. Ensure `NODE_ENV` is not `production`

## Support

For issues or questions:
1. Check the comprehensive test suite: `__tests__/cache/cache-invalidation.test.ts`
2. Run the test script: `scripts/test-cache-invalidation.ts`
3. Review audit logs in the `CacheInvalidation` table
4. Monitor application logs for cache invalidation patterns