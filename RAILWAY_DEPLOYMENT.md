# Railway Deployment Guide

This guide covers migrating from Vercel to Railway for the tldrsec-ai application.

## Overview

The migration includes:
- Main Next.js application deployment
- Two separate cron job services
- Environment variable configuration
- Database connectivity

## Railway Services

### 1. Main Application (`tldrsec-ai-main`)
- Runs the Next.js application
- Health check endpoint: `/api/health`
- Standard web service deployment

### 2. SEC Filing Monitor (`cron-monitor-sec-filings`)
- **Schedule**: `0 9 * * 1-5` (9am weekdays)
- **Purpose**: Checks for new SEC filings and processes them
- **Script**: `scripts/cron-monitor-sec-filings.js`

### 3. Job Processor (`cron-process-jobs`)
- **Schedule**: `0 12 * * 1-5` (12pm weekdays)  
- **Purpose**: Processes queued background jobs
- **Script**: `scripts/cron-process-jobs.js`

## Deployment Steps

### 1. Connect Repository
```bash
railway login
railway link
```

### 2. Set Environment Variables
Required variables for all services:
```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...

# AI Service
ANTHROPIC_API_KEY=...

# Email Service
RESEND_API_KEY=...

# Cron Authentication
CRON_SECRET=your-secure-secret-key

# Railway-specific
RAILWAY_ENVIRONMENT=production
```

### 3. Deploy Services
Railway will automatically deploy based on `railway.toml` configuration.

## Environment Variables by Service

### Main Application
- All standard environment variables from Vercel
- `RAILWAY_PUBLIC_DOMAIN` (auto-set by Railway)

### Cron Services
- `CRON_SECRET` - Authentication for cron endpoints
- `RAILWAY_PUBLIC_DOMAIN` or `APP_URL` - Application domain
- Database and other service credentials

## Testing

Test cron endpoints locally:
```bash
npm run test:cron
```

Test individual cron jobs:
```bash
APP_URL=your-railway-domain.com CRON_SECRET=your-secret node scripts/cron-monitor-sec-filings.js
APP_URL=your-railway-domain.com CRON_SECRET=your-secret node scripts/cron-process-jobs.js
```

## Key Differences from Vercel

### Cron Jobs
- **Vercel**: Inline cron configuration in `vercel.json`
- **Railway**: Separate services with `cronSchedule` in `railway.toml`

### Authentication
- Uses same `CRON_SECRET` mechanism
- Platform detection automatically adjusts monitoring labels

### Limitations
- Railway cron minimum interval: 5 minutes
- Cron times are UTC-based
- No guarantee of exact timing (can vary by few minutes)

## Monitoring

The application includes monitoring for Railway cron jobs:
- Execution tracking in database
- Performance metrics
- Error reporting
- Health checks

## Cost Considerations

Railway pricing factors:
- Compute time for main application
- Cron job execution time
- Database storage and queries
- Network egress

With your $5 credit:
- Should cover moderate usage for testing
- Monitor resource usage in Railway dashboard
- Scale services based on actual needs

## Migration Checklist

- [ ] Deploy main application to Railway
- [ ] Configure environment variables
- [ ] Test main application functionality
- [ ] Deploy cron job services
- [ ] Verify cron jobs execute properly
- [ ] Update DNS if needed
- [ ] Monitor resource usage
- [ ] Disable Vercel cron jobs

## Rollback Plan

If issues occur:
1. Re-enable Vercel cron jobs in `vercel.json`
2. Deploy to Vercel
3. Update DNS back to Vercel
4. Debug Railway issues separately

## Support

- Railway docs: https://docs.railway.com
- Cron jobs: https://docs.railway.com/reference/cron-jobs
- Community: Railway Discord