# Production Optimization Guide

## Railway Performance Optimizations

### Resource Allocation
- **Memory**: Increased from 2GB to 4GB to handle concurrent AI processing
- **CPU**: Increased from 2 vCPU to 4 vCPU to reduce transaction times
- **Healthcheck Timeout**: Increased to 600s to accommodate longer cron processing

### Database Connection Optimization

#### Connection String Parameters
Add these parameters to your DATABASE_URL in Railway environment variables:

```
?connection_limit=50&pool_timeout=30&connection_timeout=20000
```

**Example:**
```
postgresql://user:password@host:port/database?connection_limit=50&pool_timeout=30&connection_timeout=20000
```

#### Recommended Settings:
- `connection_limit=50`: Increase max connections from default 21
- `pool_timeout=30`: Increase timeout for acquiring connections  
- `connection_timeout=20000`: 20-second timeout for establishing connections

### Cron Job Performance Analysis

#### Current Performance (from logs):
- **Execution Time**: ~11 minutes for 4 users, 19 filings
- **API Costs**: $0.69 per execution
- **Success Rate**: 100% (all filings processed)

#### Performance Targets:
- **Target Time**: Under 8 minutes per execution
- **Cost Range**: $0.50-$2.00 per execution (✅ currently optimal)
- **Container Restarts**: <3 per day (currently ~20+)

## Cost Sharing Verification

### Current Implementation ✅
- **Cron Processing**: Uses `generateAISummaryWithRetry` (bypasses cache)
- **User Requests**: Uses smart cache logic via `checkIfFilingProcessed()`
- **Cost Distribution**: Multiple users share filing summary costs

### Smart Cache Logic Flow:
1. **New Filing Detected**: Cron processes → Summary stored in database
2. **User Email Request**: Checks if filing processed → Uses cached summary ($0.00)
3. **Multiple Users**: All users tracking same ticker share the cost

## Monitoring Recommendations

### Key Metrics to Track:
1. **Cron Execution Duration** (alert if >8 minutes)
2. **Container Restart Frequency** (alert if >5/day)
3. **Database Connection Errors** (alert if >1%)
4. **API Cost per Execution** (alert if >$3.00)
5. **Email Delivery Success Rate** (alert if <95%)

### Railway Dashboard Checks:
- Monitor memory usage during cron execution
- Track CPU utilization spikes
- Watch for connection pool exhaustion
- Monitor service restart patterns

## Deployment Checklist

### Before Deploying Optimizations:
- [ ] Update DATABASE_URL with connection parameters
- [ ] Verify Railway resource allocation (4GB/4vCPU)
- [ ] Test cron execution in staging environment
- [ ] Confirm smart cache logic is working

### After Deployment:
- [ ] Monitor first 3 cron executions for performance improvement
- [ ] Verify container restart frequency has decreased
- [ ] Check database connection error rates
- [ ] Validate email delivery continues to work
- [ ] Confirm API costs remain in expected range

## Troubleshooting

### If Cron Jobs Still Timeout:
1. Check Railway dashboard for resource limits
2. Review database connection pool utilization
3. Consider processing users in smaller batches
4. Enable more detailed logging for bottleneck identification

### If Container Restarts Persist:
1. Monitor memory usage patterns
2. Check for memory leaks in AI processing
3. Review Prisma connection cleanup
4. Consider increasing Railway resource allocation further

### If API Costs Spike:
1. Verify smart cache logic is working correctly
2. Check if duplicate filings are being processed
3. Monitor filing detection accuracy
4. Review error handling in AI summarization