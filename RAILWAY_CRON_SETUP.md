# Railway Cron Jobs Setup Guide

This guide covers setting up and testing cron jobs on Railway for the tldrsec-ai application.

## Overview

Railway handles cron jobs directly through the service settings, not through separate services as originally planned. Here's how to set them up properly.

## Step 1: Access Railway Dashboard

1. Go to https://railway.app
2. Navigate to your project: **tldrsec-ai**
3. Click on your service (should be named **tldrsec-ai**)

## Step 2: Configure Cron Jobs

### Method 1: Via Railway Dashboard

1. **Click on your service**
2. **Go to "Settings" tab**
3. **Scroll to "Cron Schedule" section**
4. **Add your cron expressions**:

#### SEC Filing Monitor Cron Job
- **Cron Expression**: `0 9 * * 1-5`
- **Description**: Monitors SEC filings (9am weekdays UTC)
- **What it does**: Calls `/api/cron/monitor-sec-filings` endpoint

#### Job Processor Cron Job  
- **Cron Expression**: `0 12 * * 1-5`
- **Description**: Processes background jobs (12pm weekdays UTC)
- **What it does**: Calls `/api/cron/process-jobs` endpoint

### Method 2: Via Railway CLI

```bash
# Set cron schedule via CLI (if supported)
railway service set-cron "0 9 * * 1-5" --path "/api/cron/monitor-sec-filings"
railway service set-cron "0 12 * * 1-5" --path "/api/cron/process-jobs"
```

## Step 3: Verify Environment Variables

Ensure these environment variables are set in Railway:

### Required Variables
```bash
PUBLIC_URL=https://your-app-name.railway.app
CRON_SECRET=your-secure-secret-key
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-api03-...
RESEND_API_KEY=re_...
RAILWAY_ENVIRONMENT=production
```

⚠️ **CRITICAL**: The `PUBLIC_URL` environment variable must be set to your Railway domain. Railway native cron jobs don't automatically have access to `RAILWAY_PUBLIC_DOMAIN`, causing the cron to fall back to `localhost` which fails.

Check via CLI:
```bash
railway variables
```

## Step 4: Test Cron Endpoints Manually

Get your Railway domain:
```bash
railway domain
```

Test the endpoints manually:

### Test SEC Filing Monitor
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.railway.app/api/cron/monitor-sec-filings
```

### Test Job Processor
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.railway.app/api/cron/process-jobs
```

Expected response for success:
```json
{
  "success": true,
  "message": "...",
  "duration": 1234
}
```

## Step 5: Monitor Cron Job Execution

### View Logs
```bash
railway logs
```

### Check for Errors
Look for these log patterns:
- ✅ `Starting SEC filing monitoring cron job`
- ✅ `Starting job processor`
- ❌ `Unauthorized cron request`
- ❌ `Failed to process jobs`

## Step 6: Verify Cron Jobs Are Running

### Check Railway Dashboard
1. Go to your service in Railway dashboard
2. Check "Deployments" tab for cron execution logs
3. Look for scheduled job runs in the activity log

### Monitor Database
Cron jobs create execution records. Check if they're being created:
```sql
SELECT * FROM "CronJobExecution" 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

## Troubleshooting

### Common Issues

#### 1. Connection to localhost Error
**Symptom**: `Unable to connect. Is the computer able to access the url?` with `"baseUrl": "http://localhost:8080"`

**Solution**: 
- Set the `PUBLIC_URL` environment variable in Railway to your deployed domain
- Example: `PUBLIC_URL=https://your-app-name.railway.app`
- Railway native cron jobs run separately and don't automatically have `RAILWAY_PUBLIC_DOMAIN`

#### 2. Unauthorized Cron Request
**Symptom**: `401 Unauthorized` or `Unauthorized cron request` in logs

**Solution**: 
- Verify `CRON_SECRET` is set correctly
- Make sure the secret matches in your test calls

#### 3. Database Schema Errors
**Symptom**: `Unknown argument 'attempts'` or similar Prisma errors

**Solution**:
- Schema mismatch between code and database
- Fixed in latest deployment
- Run `railway run npx prisma db push` if needed

#### 4. Cron Jobs Not Triggering
**Symptom**: No cron execution logs

**Solution**:
- Check cron expression syntax (use https://crontab.guru)
- Verify Railway cron schedule is saved correctly
- Ensure minimum 5-minute interval (Railway limitation)

#### 5. API Endpoint Errors
**Symptom**: 500 errors when testing endpoints

**Solution**:
- Check application logs for specific errors
- Verify all environment variables are set
- Test database connectivity

### Environment-Specific Issues

#### Development vs Production
The cron jobs detect the environment and adjust:
- `RAILWAY_ENVIRONMENT=production` → Uses Railway cron platform
- Local development → Uses different monitoring setup

## Cron Expression Reference

Railway uses standard cron expressions (UTC time):

| Expression | Description |
|------------|-------------|
| `0 9 * * 1-5` | 9am weekdays |
| `0 12 * * 1-5` | 12pm weekdays |
| `*/30 * * * *` | Every 30 minutes |
| `0 */4 * * *` | Every 4 hours |

**Important**: Railway minimum interval is 5 minutes.

## Success Verification Checklist

- [ ] Railway deployment successful
- [ ] Environment variables configured
- [ ] Cron schedules set in Railway dashboard
- [ ] Manual endpoint tests pass
- [ ] Cron execution logs appear
- [ ] Database records created
- [ ] No error messages in logs
- [ ] Email notifications working (if applicable)

## Next Steps

1. **Monitor for 24-48 hours** to ensure stable execution
2. **Check costs** in Railway dashboard
3. **Adjust schedules** if needed based on usage
4. **Set up alerts** for failed executions

## Support Resources

- **Railway Cron Docs**: https://docs.railway.com/reference/cron-jobs
- **Cron Expression Tester**: https://crontab.guru
- **Railway Community**: Railway Discord server

---

Your cron jobs should now be running automatically on Railway! 🚂