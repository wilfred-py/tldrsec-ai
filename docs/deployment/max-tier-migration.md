# Max Tier Migration Deployment Guide

## Overview
This document outlines the deployment strategy for migrating from Premium tier to Max tier with zero downtime.

## Pre-Deployment Checklist

- [ ] Database backup completed
- [ ] Feature flags configured
- [ ] Monitoring dashboards updated
- [ ] Alert rules configured
- [ ] Rollback procedure tested

## Deployment Phases

### Phase 1: Database Migration (T-0)
```bash
# 1. Backup current database
npm run db:backup

# 2. Run migration to add Max tier support (backward compatible)
npx prisma migrate deploy

# 3. Verify migration success
npm run db:verify-migration
```

### Phase 2: Feature Flag Deployment (T+5 min)
```bash
# Deploy with feature flag disabled
vercel --prod --env FEATURE_MAX_TIER=false
```

### Phase 3: Canary Rollout (T+15 min)
```bash
# Enable for 10% of users
npm run feature:enable-max-tier --percentage=10

# Monitor for 30 minutes
npm run monitor:tier-migration
```

### Phase 4: Progressive Rollout (T+45 min)
```bash
# Increase to 50%
npm run feature:enable-max-tier --percentage=50

# Monitor for 30 minutes
npm run monitor:tier-migration
```

### Phase 5: Full Rollout (T+75 min)
```bash
# Enable for all users
npm run feature:enable-max-tier --percentage=100

# Clear all caches
npm run cache:clear-all
```

## Monitoring

### Key Metrics to Watch
- Tier upgrade/downgrade success rate
- API response times for tier-related endpoints
- Database query performance
- Error rates in tier validation

### Alert Thresholds
- Error rate > 1% - Warning
- Error rate > 5% - Critical
- Response time > 2s - Warning
- Response time > 5s - Critical

## Rollback Procedure

If issues are detected:

```bash
# 1. Disable feature flag immediately
npm run feature:disable-max-tier

# 2. Revert code deployment
vercel rollback

# 3. If database issues, restore from backup
npm run db:restore --backup=pre-max-migration

# 4. Clear all caches
npm run cache:clear-all

# 5. Notify team
npm run alert:send --message="Max tier rollback initiated"
```

## Post-Deployment Verification

```bash
# 1. Run comprehensive tests
npm run test:tier-migration

# 2. Verify all tier endpoints
npm run test:api:tiers

# 3. Check user tier assignments
npm run verify:user-tiers

# 4. Validate email templates
npm run test:email:max-tier
```

## Cache Invalidation

Required cache clears:
- Vercel Edge Cache: `/api/tiers/*`
- CloudFront: `/pricing`, `/dashboard`
- Browser: Force refresh for tier-related pages

## Environment Variables

Ensure these are set in all environments:
```
TIER_MAX_ENABLED=true
TIER_MAX_FEATURES=unlimited_summaries,priority_support,advanced_analytics
TIER_MAX_PRICE=4900  # in cents
```

## Support Communication

Template for customer communication:
```
Subject: Exciting Update: Premium is now Max!

We've upgraded our Premium tier to Max, giving you even more value:
- All your existing features remain unchanged
- Your pricing stays the same
- New features coming soon exclusively for Max subscribers

No action needed from your side. Thank you for being a valued customer!
```

## Success Criteria

- [ ] Zero downtime during migration
- [ ] All Premium users successfully migrated to Max
- [ ] No increase in error rates
- [ ] Response times remain under 1s
- [ ] All tests passing
- [ ] Customer communication sent