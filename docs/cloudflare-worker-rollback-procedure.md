# Cloudflare Worker Deployment Rollback Procedure

**Date**: 2025-11-18  
**Purpose**: Provide clear rollback steps if Cloudflare Worker deployment fails  
**Risk Level**: Low (Configuration-only change)

## Quick Rollback (Emergency)

If the Cloudflare Worker deployment is causing immediate production issues:

```bash
# 1. Immediately disable the worker (if deployed)
npx wrangler delete cloudflare-cron

# 2. Remove root configuration to prevent automatic redeployment
git checkout HEAD~1 -- wrangler.toml

# 3. Commit the rollback
git add wrangler.toml
git commit -m "rollback: remove root wrangler.toml due to deployment issues"

# 4. Push the rollback
git push origin fix/cloudflare-worker-root-wrangler-config
```

## Detailed Rollback Scenarios

### Scenario 1: Deployment Fails During Wrangler Deploy

**Symptoms**: `npx wrangler deploy` fails with errors  
**Risk**: Low - No production impact  
**Solution**: 

1. **Check error logs**:
   ```bash
   npx wrangler deploy 2>&1 | tee deployment-error.log
   ```

2. **Fix configuration** if it's a simple config issue, OR **rollback**:
   ```bash
   git rm wrangler.toml
   git commit -m "rollback: remove problematic root wrangler.toml"
   ```

### Scenario 2: Worker Deploys But Fails to Execute

**Symptoms**: Worker deploys successfully but cron executions fail  
**Risk**: Medium - SEC filing monitoring disrupted  
**Solution**:

1. **Check worker logs**:
   ```bash
   npx wrangler tail --format=pretty
   ```

2. **Verify secrets are set correctly**:
   ```bash
   npx wrangler secret list
   ```

3. **If secrets are wrong, update them**:
   ```bash
   npx wrangler secret put CRON_SECRET
   # Enter the correct secret from Vercel environment
   ```

4. **If still failing, rollback**:
   ```bash
   npx wrangler delete cloudflare-cron
   git rm wrangler.toml
   git commit -m "rollback: cloudflare worker execution failures"
   ```

### Scenario 3: Worker Conflicts with Vercel Deployment

**Symptoms**: Vercel deployment or existing cron jobs affected  
**Risk**: High - Core application disrupted  
**Solution**: **IMMEDIATE ROLLBACK**

```bash
# Emergency rollback
npx wrangler delete cloudflare-cron
git rm wrangler.toml
git commit -m "EMERGENCY: rollback cloudflare worker due to vercel conflicts"
git push origin fix/cloudflare-worker-root-wrangler-config
```

## Rollback Validation

After any rollback, verify system health:

### 1. Verify Vercel Functionality
```bash
# Test the Vercel cron endpoint directly
curl -X POST https://tldrsec.app/api/cron/tier-aware \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### 2. Check Database Connectivity
```bash
npm run db:test
```

### 3. Run End-to-End Test
```bash
npm run test:e2e
```

## Prevention Measures

### Before Future Deployments:
1. **Always use dry-run first**:
   ```bash
   npx wrangler deploy --dry-run
   ```

2. **Test in staging environment** (if available)

3. **Verify secrets are correctly configured**:
   ```bash
   npx wrangler secret list
   ```

4. **Have monitoring ready**:
   ```bash
   npx wrangler tail --format=pretty &
   ```

## Recovery After Rollback

If you need to re-attempt the deployment after fixing issues:

### 1. Identify Root Cause
- Review error logs from failed deployment
- Verify all prerequisites are met
- Confirm secrets are correctly configured

### 2. Re-implement Fix
```bash
# Re-add the configuration file
git checkout HEAD~2 -- wrangler.toml  # Get the working version

# Test thoroughly
npx wrangler deploy --dry-run

# Deploy with monitoring
npx wrangler tail --format=pretty &
npx wrangler deploy
```

### 3. Monitor Deployment
```bash
# Watch logs for any issues
npx wrangler tail --format=pretty

# Verify cron execution after 10 minutes
curl -X POST https://tldrsec.app/api/health/cron-status
```

## Emergency Contacts

If rollback doesn't resolve production issues:

1. **Check Vercel deployment status**: https://vercel.com/dashboard
2. **Monitor application logs**: Check Vercel function logs
3. **Database status**: Monitor Neon database connectivity
4. **User impact assessment**: Check if SEC filing summaries are being delivered

## Post-Incident Actions

After any rollback:

1. **Document the incident** in this file
2. **Update deployment procedures** to prevent recurrence  
3. **Review monitoring and alerting** setup
4. **Consider additional testing** before future deployments

## Lessons Learned

*This section will be updated after any actual rollback incidents*

---

**Last Updated**: 2025-11-18  
**Reviewed By**: DevOps Team  
**Next Review Date**: 2025-12-18