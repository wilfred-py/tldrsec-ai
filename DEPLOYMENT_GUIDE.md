# Subscription System Deployment Guide

This guide covers deploying the new subscription-based token optimization features for SEC filing processing.

## 🚨 Critical Pre-Deployment Steps

### 1. Database Migration
```bash
# Generate Prisma client with new models
npm run db:generate

# Apply database migration (BACKUP DATABASE FIRST!)
npm run db:migrate

# Verify migration success
npm run db:studio
```

### 2. Environment Variables
Copy `.env.enhanced.example` to `.env.local` and configure:

**Required for Subscriptions:**
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook endpoint secret
- `STRIPE_BASIC_PRICE_ID` - Basic plan price ID from Stripe
- `STRIPE_PROFESSIONAL_PRICE_ID` - Professional plan price ID
- `STRIPE_PREMIUM_PRICE_ID` - Premium plan price ID

**Token Optimization:**
- `ENABLE_TOKEN_OPTIMIZATION=true`
- `DEFAULT_OPTIMIZATION_LEVEL=balanced`
- `TOKEN_OPTIMIZATION_TIMEOUT_MS=30000`

### 3. Stripe Configuration
1. Create products and prices in Stripe Dashboard:
   - **Free**: $0/month, 3 companies, 10-K/10-Q only
   - **Pro**: $199/month ($1,990/year), 25 companies, all filing types
   - **Max**: $349/month ($3,490/year), unlimited companies, all filing types

2. Configure webhook endpoint: `/api/webhook/stripe`
   - Events: `customer.subscription.*`, `invoice.*`

3. Update price IDs in environment variables

## 📊 Infrastructure Requirements

### Resource Scaling
- **Memory**: Increase by 25% for token optimization
- **CPU**: Increase by 20% for processing overhead
- **Database**: 30% more connections for usage tracking

### New Database Tables
- `UserSubscription` - User plan management
- `FilingUsage` - Detailed usage analytics  
- `UsagePeriod` - Monthly limits and resets

### Monitoring Updates
Add alerts for:
- Subscription usage limit violations
- Token optimization quality degradation
- Rate limiter queue backlog
- Cost estimation accuracy

## 🔐 Security Checklist

### Input Validation
- ✅ Zod schemas for all subscription inputs
- ✅ Regex validation for ticker symbols and filing types
- ✅ Rate limiting on subscription operations

### Authorization
- ✅ User ownership verification for subscriptions
- ✅ Usage recording permission checks
- ✅ Clerk authentication integration

### Database Security
- ⚠️ **TODO**: Encrypt Stripe customer/subscription IDs
- ✅ Parameterized queries via Prisma
- ✅ Row-level security with user isolation

## 🚀 Deployment Process

### Step 1: Pre-deployment Testing
```bash
# Run all tests
npm test

# Run specific subscription tests
npm test -- __tests__/services/filings/enhanced/
npm test -- __tests__/lib/validation/
npm test -- __tests__/lib/auth/

# Test migration on staging database
npm run db:migrate -- --preview-feature
```

### Step 2: Production Deployment
```bash
# 1. Deploy database migration
npm run db:migrate

# 2. Deploy application with new environment variables
# (Following your normal deployment process)

# 3. Verify services are healthy
curl https://your-domain.com/api/health/optimized
```

### Step 3: Post-deployment Verification
```bash
# Test subscription endpoints
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-domain.com/api/user/subscription

# Test analytics endpoints  
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-domain.com/api/user/analytics?start=2024-01-01&end=2024-01-31"

# Verify Stripe webhook
# (Trigger test webhook from Stripe Dashboard)
```

## 📱 User Interface Updates

### New Pages Added
- `/dashboard/billing` - Subscription management
- `/dashboard/usage` - Analytics dashboard

### Updated Components
- `SubscriptionStatus` - Usage tracking widget
- Dashboard navigation with billing/usage links

### Required UI Dependencies
```bash
npm install stripe date-fns zod
```

## 🔧 Configuration Options

### Token Optimization Levels
- **Minimal** (Premium): 55% reduction, maximum context
- **Conservative** (Professional): 67% reduction, balanced approach
- **Balanced** (Basic): 85% reduction, efficient processing
- **Aggressive**: 95% reduction, maximum compression

### Rate Limiting
- User operations: 1000/hour per user
- API calls: Integrated with existing Claude rate limiting
- Database transactions: Serializable isolation level

## 📈 Monitoring & Alerts

### Key Metrics to Monitor
1. **Subscription Health**
   - Active subscriptions by tier
   - Monthly recurring revenue
   - Churn rate and upgrade/downgrade patterns

2. **Token Optimization Performance**
   - Average reduction percentages by tier
   - Quality scores and validation failures
   - Processing time and cost efficiency

3. **Usage Patterns**
   - Monthly filing usage by tier
   - Peak usage periods
   - Limit breach attempts

### Recommended Alerts
```yaml
# Subscription Usage Alert
- name: subscription_usage_near_limit
  condition: usage > 90% of monthly limit
  action: notify user, suggest upgrade

# Optimization Quality Alert  
- name: token_optimization_quality_degraded
  condition: quality_score < 60
  action: investigate optimization algorithm

# Rate Limit Alert
- name: rate_limiter_queue_backlog
  condition: queue_length > 100
  action: scale processing capacity
```

## 🔄 Rollback Plan

If issues arise, rollback procedures:

### 1. Disable New Features
```bash
# Disable token optimization
ENABLE_TOKEN_OPTIMIZATION=false

# Disable subscription enforcement  
ENABLE_SUBSCRIPTION_LIMITS=false
```

### 2. Database Rollback
```bash
# Rollback migration (if safe)
npm run db:migrate -- --rollback

# Or manually disable constraints temporarily
```

### 3. Hide UI Components
- Comment out subscription status components
- Hide billing/usage navigation links
- Redirect billing pages to existing dashboard

## ⚠️ Known Issues & Limitations

### Current Limitations
1. **Manual Stripe Setup**: Price IDs must be configured manually
2. **No Data Encryption**: Stripe IDs stored in plaintext (security fix needed)
3. **Basic Analytics**: Limited historical data visualization
4. **Single Currency**: USD only, no international pricing

### Performance Considerations
- Token optimization adds 15-20% latency
- Database queries increased by ~30% for usage tracking
- Memory usage increases with document size during optimization

## 📞 Support & Troubleshooting

### Common Issues
1. **"No subscription found"** - User needs initial subscription creation
2. **"Usage limit exceeded"** - Check monthly reset dates and limits  
3. **"Optimization failed"** - Verify Claude API limits and content size
4. **"Billing portal access denied"** - Ensure Stripe customer ID exists

### Debug Commands
```bash
# Check subscription status
npm run db:studio
# Navigate to UserSubscription table

# View usage analytics
SELECT * FROM "FilingUsage" WHERE "userId" = 'user-id' ORDER BY "createdAt" DESC;

# Check optimization results
SELECT "optimizationLevel", AVG("reductionPercentage") 
FROM "FilingUsage" 
WHERE "reductionPercentage" IS NOT NULL 
GROUP BY "optimizationLevel";
```

## 🎯 Success Metrics

After deployment, monitor these KPIs:

### Technical Metrics
- ✅ Zero subscription-related errors in logs
- ✅ >95% token optimization success rate  
- ✅ <2s average API response time
- ✅ Database query performance within normal ranges

### Business Metrics
- 📈 User engagement with billing/usage dashboards
- 📈 Subscription upgrade conversion rates
- 📈 Reduced support tickets about pricing/limits
- 📈 Improved user retention through clear value visibility

---

**Deployment Approved By**: [Product Manager, Security Engineer, DevOps Engineer]  
**Deployment Date**: [To be filled]  
**Rollback Deadline**: [24 hours post-deployment]