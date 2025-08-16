# Railway Deployment Guide for Tier-Aware Cron Processing

This guide provides step-by-step instructions for deploying the tier-aware cron processing system to Railway.

## Prerequisites

1. Railway account with sufficient credits for production workloads
2. Database migration completed locally and tested
3. Environment variables configured
4. Domain and SSL certificate setup (if using custom domain)

## Railway Configuration Requirements

### Resource Allocation

**CRITICAL**: The tier-aware processing system requires increased resources:

```yaml
# railway.toml (create in project root)
[build]
builder = "nixpacks"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[environments.production]
variables = {}

[services.web]
source = "."
build = "npm run build"
start = "npm run start"

# CRITICAL: Increase memory and CPU allocation
[services.web.resources]
memory = 2048  # 2GB (up from default 512MB)
cpu = 1000     # 1 vCPU (up from default 500m)
```

### Environment Variables

Configure the following environment variables in Railway dashboard:

#### Core Application
```bash
DATABASE_URL="postgresql://..." # From Railway PostgreSQL service
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
ANTHROPIC_API_KEY="sk-ant-..."
RESEND_API_KEY="re_..."
```

#### Cron Security (CRITICAL)
```bash
CRON_SECRET="generate-secure-random-secret-32-chars"
CRON_ALLOWED_IPS="railway-ip-ranges"  # Optional but recommended
```

#### Tier Processing Configuration
```bash
# Batch sizes (users processed per cycle)
INSTITUTION_BATCH_SIZE=10
ENTERPRISE_BATCH_SIZE=8
PROFESSIONAL_BATCH_SIZE=5
FREE_BATCH_SIZE=3

# Daily cost limits (USD)
INSTITUTION_COST_LIMIT=999999
ENTERPRISE_COST_LIMIT=1.25
PROFESSIONAL_COST_LIMIT=0.60
FREE_COST_LIMIT=0.20

# Processing frequencies (minutes)
INSTITUTION_MARKET_FREQUENCY=5
ENTERPRISE_MARKET_FREQUENCY=5
PROFESSIONAL_MARKET_FREQUENCY=15
FREE_MARKET_FREQUENCY=30

INSTITUTION_OFF_HOURS_FREQUENCY=5
ENTERPRISE_OFF_HOURS_FREQUENCY=30
PROFESSIONAL_OFF_HOURS_FREQUENCY=60
FREE_OFF_HOURS_FREQUENCY=120
```

#### Railway Specific
```bash
RAILWAY_ENVIRONMENT="production"
RAILWAY_STATIC_URL="your-app.railway.app"
PORT=3000
NODE_ENV="production"
```

#### Security & Monitoring
```bash
LOG_LEVEL="info"
ENABLE_AUDIT_LOGGING=true
METRICS_COLLECTION_ENABLED=true
MAX_COST_PER_OPERATION=10.0
```

## Database Migration

### 1. Backup Current Database
```bash
# Create backup before migration
pg_dump $DATABASE_URL > backup_before_tier_migration.sql
```

### 2. Apply Prisma Schema Changes
```bash
# Generate and apply migration
npx prisma generate
npx prisma db push
```

### 3. Verify Migration
```bash
# Test database connection and schema
npm run db:test
```

### 4. Backfill User Subscription Tiers
```sql
-- Update existing users to appropriate tiers
UPDATE users 
SET subscription_tier = 'FREE', 
    processing_budget = 5,
    budget_used = 0,
    budget_reset_at = NOW()
WHERE subscription_tier IS NULL;
```

## Cron Job Configuration

### Railway Cron Service Setup

Railway supports only **ONE** cron job per project. Configure it to run every 5 minutes:

```bash
# In Railway dashboard under "Cron Jobs"
Schedule: */5 * * * *
Command: curl -X GET https://your-app.railway.app/api/cron/unified \
         -H "Authorization: Bearer $CRON_SECRET" \
         -H "User-Agent: Railway-Cron/1.0"
```

### Unified Cron Endpoint

The system uses `/api/cron/unified` which automatically routes to tier-aware processing based on market context:

- **Market Hours**: High-frequency tier-aware processing
- **Off Hours**: Reduced frequency tier-aware processing  
- **Weekends/Holidays**: Continuous monitoring (SEC filings can publish 24/7)

## Monitoring and Alerting

### 1. Health Check Configuration

Railway will monitor the `/api/health` endpoint:

```typescript
// Ensure health check includes tier processing status
{
  "status": "healthy",
  "database": "connected",
  "cronStatus": "operational",
  "tierProcessing": "active",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 2. Critical Alerts Setup

Configure alerts for:

**Resource Alerts**:
- Memory usage > 80% (1.6GB out of 2GB)
- CPU usage > 80% for more than 5 minutes
- Response time > 10 seconds

**Business Logic Alerts**:
- Cron job failures > 2 in 30 minutes
- Budget processing errors > 5% of users
- Database connection timeouts > 3 in 15 minutes
- Tier processing failures > 10% of eligible users

**Financial Alerts**:
- Daily cost budget overruns > $10
- Institution tier usage spikes > 200% of average
- Budget enforcement failures

### 3. Logging and Observability

```bash
# Configure structured logging
LOG_LEVEL="info"
ENABLE_DEBUG_LOGGING=false  # Only enable for troubleshooting
METRICS_COLLECTION_ENABLED=true
```

Monitor these key metrics:
- Tier processing completion rates
- Budget utilization per tier
- Market hours processing efficiency
- SEC API response times
- Database query performance

## Deployment Process

### 1. Pre-deployment Verification

```bash
# Run comprehensive tests
npm run test
npm run test:integration
npm run test:tier-aware

# Build verification
npm run build

# Security scan
npm audit --audit-level moderate
```

### 2. Staged Deployment

**Phase 1**: Infrastructure Preparation (Day 1)
```bash
# Deploy with tier processing DISABLED
ENABLE_TIER_AWARE_PROCESSING=false

# Verify basic functionality
curl https://your-app.railway.app/api/health
```

**Phase 2**: Database Migration (Day 2)
```bash
# Enable database changes
npx prisma db push

# Verify schema
npx prisma studio
```

**Phase 3**: Tier Processing Activation (Day 3)
```bash
# Enable tier-aware processing for FREE tier only
ENABLE_TIER_AWARE_PROCESSING=true
ENABLE_BUDGET_ENFORCEMENT=false  # Start without budget limits

# Monitor for 24 hours
```

**Phase 4**: Full Activation (Day 4)
```bash
# Enable all features
ENABLE_BUDGET_ENFORCEMENT=true
ENABLE_MARKET_HOURS_ADJUSTMENT=true

# Monitor closely for 72 hours
```

### 3. Rollback Procedures

**Quick Rollback** (Emergency):
```bash
# Disable tier processing immediately
ENABLE_TIER_AWARE_PROCESSING=false

# Route to legacy cron endpoints
FALLBACK_TO_LEGACY_CRON=true
```

**Database Rollback** (If needed):
```bash
# Restore from backup
psql $DATABASE_URL < backup_before_tier_migration.sql

# Rebuild application
npm run build && railway up
```

## Performance Optimization

### 1. Database Optimization

```sql
-- Add indexes for tier processing queries
CREATE INDEX CONCURRENTLY idx_users_subscription_tier_budget 
ON users(subscription_tier, budget_used, last_cron_processed);

CREATE INDEX CONCURRENTLY idx_tier_processing_execution_tier_date 
ON tier_processing_execution(tier, started_at);

-- Partition large tables if needed
CREATE TABLE tier_processing_metrics_2024 PARTITION OF tier_processing_metrics
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

### 2. Application Optimization

```bash
# Enable production optimizations
NODE_ENV="production"
NEXT_TELEMETRY_DISABLED=1

# Configure connection pooling
DATABASE_CONNECTION_POOL_SIZE=20
DATABASE_CONNECTION_TIMEOUT_MS=10000
```

### 3. Railway Optimization

```yaml
# railway.toml optimizations
[services.web]
healthcheckPath = "/api/health/readiness"
healthcheckTimeout = 30
healthcheckInterval = 30

# Resource limits to prevent runaway processes
[services.web.resources]
memory = 2048
cpu = 1000
```

## Security Hardening

### 1. Environment Security

```bash
# Rotate secrets regularly
CRON_SECRET="new-32-char-random-secret"

# Limit IP access if possible
CRON_ALLOWED_IPS="railway-ip-1,railway-ip-2"

# Enable security headers
ENABLE_SECURITY_HEADERS=true
```

### 2. Rate Limiting

```bash
# Configure aggressive rate limiting for cron endpoints
MAX_REQUESTS_PER_MINUTE=10  # Lower for cron endpoints
RATE_LIMIT_WINDOW_MS=60000
```

### 3. Audit Logging

```bash
# Enable comprehensive audit logging
ENABLE_AUDIT_LOGGING=true
AUDIT_LOG_RETENTION_DAYS=90
LOG_FINANCIAL_OPERATIONS=true
```

## Troubleshooting

### Common Issues

**1. Memory Exhaustion**
```bash
# Symptoms: 502 errors, process crashes
# Solution: Increase memory allocation to 2GB+
# Monitor: Memory usage patterns by tier
```

**2. Cron Job Timeouts**
```bash
# Symptoms: 4-minute timeout errors
# Solution: Optimize concurrent processing
# Monitor: Processing time per tier batch
```

**3. Budget Calculation Errors**
```bash
# Symptoms: Incorrect budget deductions
# Solution: Review transaction isolation levels
# Monitor: Budget reconciliation reports
```

**4. Database Connection Pool Exhaustion**
```bash
# Symptoms: Connection timeout errors
# Solution: Optimize connection pooling
# Monitor: Active connections per service
```

### Debug Commands

```bash
# Check tier processing status
curl https://your-app.railway.app/api/monitoring/tier-status \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# View recent cron executions
curl https://your-app.railway.app/api/monitoring/cron-status \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# Test market hours logic
curl https://your-app.railway.app/api/test/market-hours

# Validate budget calculations
curl https://your-app.railway.app/api/test/budget-validation
```

## Success Metrics

Monitor these KPIs post-deployment:

### Technical Metrics
- **Uptime**: >99.9% (excluding planned maintenance)
- **Response Time**: <2s for API endpoints, <10s for cron jobs
- **Error Rate**: <0.1% for tier processing operations
- **Memory Usage**: <80% of allocated 2GB consistently

### Business Metrics
- **Processing Efficiency**: >95% of eligible users processed per cycle
- **Budget Accuracy**: <0.01% budget calculation errors
- **Tier Distribution**: Monitor user distribution across tiers
- **Cost Optimization**: 20-30% reduction in processing costs vs. flat-rate system

### User Experience Metrics
- **Processing Delays**: <10% of users experience tier-related delays
- **Budget Exhaustion Rate**: <5% of users hit daily limits
- **Upgrade Conversion**: 15-25% FREE→PAID conversion rate
- **Support Tickets**: <50% increase in tier-related tickets

## Cost Management

### Railway Resource Costs
- **Base Service**: ~$20/month (2GB memory, 1 vCPU)
- **Database**: ~$15/month (PostgreSQL)
- **Traffic**: Variable based on usage
- **Total Estimated**: $40-60/month

### Optimization Strategies
1. **Implement request caching** for market hours calculations
2. **Use database read replicas** for analytics queries
3. **Optimize tier processing algorithms** to reduce CPU usage
4. **Implement intelligent batching** to reduce database connections

## Support and Maintenance

### Daily Operations
- Monitor tier processing completion rates
- Review budget utilization reports
- Check error logs for security issues
- Verify market hours processing accuracy

### Weekly Maintenance
- Review resource utilization trends
- Analyze tier upgrade conversion rates
- Update security patches
- Optimize database performance

### Monthly Reviews
- Cost analysis and optimization
- Security audit and credential rotation
- Performance baseline updates
- User feedback analysis and system improvements

This deployment guide ensures a secure, scalable, and maintainable tier-aware cron processing system on Railway.