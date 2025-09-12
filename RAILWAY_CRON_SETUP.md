# Railway Cron-Only Service Setup Guide

This guide covers configuring Railway as a cron-only service that calls the Vercel-hosted tldrsec-ai application.

## Architecture Overview

- **Vercel**: Hosts the main web application at `https://tldrsec.app`
- **Railway**: Runs ONLY cron jobs that call Vercel endpoints
- **Purpose**: Railway executes `node scripts/railway-cron.cjs` every 15 minutes to trigger SEC filing processing

## Step 1: Access Railway Dashboard

1. Go to https://railway.app
2. Navigate to your project: **tldrsec-ai**
3. Click on your service (should be named **tldrsec-ai**)

## Step 2: Configure Railway Service as Cron-Only

### Railway Dashboard Configuration

1. **Click on your service**
2. **Go to "Settings" tab**
3. **Configure the following sections**:

#### Start Command (Deploy Section)
- **Custom Start Command**: `node scripts/railway-cron.cjs`
- **Remove**: Any healthcheck configuration (not needed for cron)

#### Cron Schedule
- **Cron Expression**: `*/15 * * * *`
- **Description**: Executes SEC filing pipeline every 15 minutes
- **What it does**: Calls `https://tldrsec.app/api/cron/unified` endpoint

#### Resource Limits  
- **Memory**: 2GB (reduced from web server requirements)
- **CPU**: 2 vCPU (sufficient for cron execution)

## Step 3: Configure Environment Variables

### Required Variables for Railway Cron Service
```bash
PUBLIC_URL=https://tldrsec.app
CRON_SECRET=your-secure-secret-key
# Note: Database and API keys are handled by Vercel deployment
```

⚠️ **CRITICAL**: The `PUBLIC_URL` must point to your Vercel domain (`https://tldrsec.app`), not Railway domain, since Railway only executes the cron script that calls Vercel.

Check via CLI:
```bash
railway variables
```

## Step 4: Test Cron Configuration

### Test Local Cron Script
```bash
# Set required environment variables first
export PUBLIC_URL=https://tldrsec.app
export CRON_SECRET=your-cron-secret

# Test the Railway cron script locally
node scripts/railway-cron.cjs
```

### Test Vercel Endpoint Directly
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://tldrsec.app/api/cron/unified
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

### View Railway Logs
```bash
railway logs
```

### Expected Log Patterns
Look for these Railway cron execution patterns:
- ✅ `Starting Railway cron job execution`
- ✅ `Executing SEC Filing Monitoring & User Processing`
- ✅ `Cron execution summary`
- ✅ `Railway cron execution completed`
- ❌ `Unauthorized cron request`
- ❌ `Connection refused - service may not be running`

### Check Vercel Endpoint Processing
Monitor the actual pipeline execution in Vercel logs:
- ✅ `Starting tier-aware SEC filing cron job`
- ✅ `SEC filing RSS monitoring completed`
- ✅ `Found X eligible users for processing`
- ✅ `Tier-aware cron job completed successfully`

## Troubleshooting

### Common Issues

#### 1. Connection to Vercel Error
**Symptom**: `Unable to connect. Is the computer able to access the url?` or connection timeouts

**Solution**: 
- Verify `PUBLIC_URL=https://tldrsec.app` is set correctly in Railway
- Test Vercel endpoint directly: `curl https://tldrsec.app/api/cron/unified`
- Check Vercel deployment status

#### 2. Unauthorized Cron Request
**Symptom**: `401 Unauthorized` or `Unauthorized cron request` in logs

**Solution**: 
- Verify `CRON_SECRET` is set correctly
- Make sure the secret matches in your test calls

#### 3. Railway Service Not Exiting
**Symptom**: Subsequent cron runs are skipped, "Active" status in Railway dashboard

**Solution**:
- Ensure start command is `node scripts/railway-cron.cjs` not `npm start`
- Railway cron script should exit after completion
- Check logs for successful "Railway cron execution completed" message

#### 4. Cron Jobs Not Triggering
**Symptom**: No cron execution logs every 15 minutes

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
| `*/15 * * * *` | Every 15 minutes (Current setup) |
| `*/30 * * * *` | Every 30 minutes |
| `0 */4 * * *` | Every 4 hours |
| `0 */6 * * *` | Every 6 hours |

**Important**: Railway minimum interval is 5 minutes.

## Success Verification Checklist

- [ ] Railway cron-only service deployed
- [ ] Environment variables configured (`PUBLIC_URL`, `CRON_SECRET`)
- [ ] Cron schedule `*/15 * * * *` set in Railway dashboard  
- [ ] Start command set to `node scripts/railway-cron.cjs`
- [ ] Local cron script test passes
- [ ] Vercel endpoint responds successfully
- [ ] Railway cron execution logs appear every 15 minutes
- [ ] Vercel logs show successful SEC filing processing
- [ ] Email notifications working (check TEST_EMAIL)

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

Your Railway cron service should now be calling Vercel every 15 minutes! 🚂➡️🔄