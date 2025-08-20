# Production Deployment Checklist - PR #173

## Critical Infrastructure Changes Summary
- **Edge Runtime Migration**: Complete Node.js crypto → Web Crypto API
- **Database Schema**: Added optimistic locking version field to TickerMonitoring
- **Security Enhancements**: Timing-safe comparisons and enhanced auth
- **Concurrency Controls**: Atomic budget updates with audit logging

---

## 🚨 PRE-DEPLOYMENT REQUIREMENTS

### Database Migration (CRITICAL)
- [ ] **Backup production database** before any schema changes
- [ ] **Test migration on staging** with production data copy
- [ ] **Run migration script**: `scripts/migrations/001-add-optimistic-locking.sql`
- [ ] **Verify index creation**: `TickerMonitoring_cik_version_idx`
- [ ] **Confirm zero existing version conflicts**
- [ ] **Test rollback procedure** on staging environment

### Environment Variables (REQUIRED)
```bash
# Verify these are set in Railway production environment
RAILWAY_ENVIRONMENT=production
NODE_ENV=production
DATABASE_URL=postgresql://...
CRON_SECRET=<secure-secret>
ANTHROPIC_API_KEY=...
CLERK_SECRET_KEY=...
RESEND_API_KEY=...
```

### Security Validation
- [ ] **Generate new CRON_SECRET** if not using timing-safe comparison
- [ ] **Verify IP allowlist** configuration for cron endpoints
- [ ] **Test Web Crypto API** operations in Railway Edge Runtime
- [ ] **Validate timing-safe comparison** functions work correctly

---

## 🔄 DEPLOYMENT SEQUENCE

### Phase 1: Infrastructure Preparation
1. **Backup Production Data**
   ```bash
   # Run on Railway production database
   pg_dump $DATABASE_URL > production_backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Deploy to Staging First**
   ```bash
   # Test complete deployment on staging
   railway deploy --environment staging
   ```

3. **Run Health Checks on Staging**
   ```bash
   curl https://staging.yourdomain.com/api/health
   # Verify all PR #173 infrastructure checks pass
   ```

### Phase 2: Database Migration
1. **Apply Schema Migration**
   ```bash
   # During low-traffic period
   railway connect postgres --environment production
   \i scripts/migrations/001-add-optimistic-locking.sql
   ```

2. **Verify Migration Success**
   ```sql
   -- Confirm version column exists
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'TickerMonitoring' AND column_name = 'version';
   
   -- Verify index
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'TickerMonitoring' AND indexname = 'TickerMonitoring_cik_version_idx';
   
   -- Check data integrity
   SELECT COUNT(*), AVG(version), MAX(version) FROM "TickerMonitoring";
   ```

### Phase 3: Application Deployment
1. **Deploy Application**
   ```bash
   railway deploy --environment production
   ```

2. **Monitor Deployment Logs**
   ```bash
   railway logs --environment production
   ```

3. **Verify Edge Runtime Compatibility**
   ```bash
   # Check for Web Crypto API errors
   railway logs --environment production | grep -i "crypto\|edge"
   ```

---

## ✅ POST-DEPLOYMENT VALIDATION

### Health Check Validation
```bash
# Comprehensive health check
curl -s https://yourdomain.com/api/health | jq .

# Verify PR #173 specific checks
curl -s https://yourdomain.com/api/health | jq '.pr173_infrastructure'

# Expected Response:
{
  "status": "healthy",
  "pr173_infrastructure": {
    "overall_status": "healthy",
    "checks": {
      "database_schema": { "status": "healthy", "optimistic_locking_enabled": true },
      "web_crypto": { "status": "healthy", "edge_runtime_compatible": true },
      "concurrency_system": { "status": "healthy", "optimistic_locking_ready": true },
      "security_system": { "status": "healthy", "timing_safe_comparison": true }
    }
  }
}
```

### Functional Testing
- [ ] **Test cron endpoint** with proper authentication
- [ ] **Verify concurrency handling** under load
- [ ] **Test budget update operations** for race conditions
- [ ] **Validate security middleware** timing-safe operations
- [ ] **Check audit logging** for budget operations

### Performance Monitoring
- [ ] **Database query performance** (check for index usage)
- [ ] **Memory usage** (Edge Runtime vs Node.js)
- [ ] **Response times** for crypto operations
- [ ] **Concurrency conflict rates** in logs

### Security Verification
```bash
# Test unauthorized cron access
curl -H "Authorization: Bearer invalid" https://yourdomain.com/api/cron/tier-aware
# Should return 401

# Test rate limiting
for i in {1..10}; do curl https://yourdomain.com/api/cron/tier-aware; done
# Should hit rate limits
```

---

## 🔥 ROLLBACK PROCEDURES

### Emergency Rollback (if critical issues)
1. **Revert Application**
   ```bash
   # Deploy previous version
   railway rollback --environment production
   ```

2. **Database Rollback** (CAUTION: May cause data loss)
   ```sql
   -- Only if absolutely necessary
   ALTER TABLE "TickerMonitoring" DROP COLUMN IF EXISTS "version";
   DROP INDEX IF EXISTS "TickerMonitoring_cik_version_idx";
   ```

3. **Restore from Backup** (if data corruption)
   ```bash
   # Restore from pre-deployment backup
   psql $DATABASE_URL < production_backup_YYYYMMDD_HHMMSS.sql
   ```

---

## 📊 MONITORING SETUP

### Key Metrics to Monitor
- **Database Concurrency Conflicts**: `db_concurrency_conflicts_total`
- **Optimistic Lock Failures**: `db_optimistic_lock_failures_total`
- **Budget Update Conflicts**: `budget_update_conflicts_total`
- **Web Crypto API Errors**: `web_crypto_errors_total`
- **Cron Job Success Rate**: `cron_execution_success_rate`

### Alert Thresholds
```yaml
# High Priority Alerts
- optimistic_lock_failures > 20/10min → CRITICAL
- budget_update_conflicts > 5/15min → CRITICAL
- web_crypto_errors > 5/5min → HIGH

# Performance Alerts  
- cron_execution_duration > 300s → WARNING
- db_transaction_duration > 30s → WARNING
```

---

## 🎯 SUCCESS CRITERIA

### Deployment Considered Successful When:
- [ ] All health checks return "healthy" status
- [ ] No increase in error rates compared to baseline
- [ ] Cron jobs execute successfully with new concurrency controls
- [ ] Budget updates complete without conflicts under normal load
- [ ] Web Crypto API operations perform within acceptable latency
- [ ] Security middleware passes timing-attack resistance tests

### Performance Baselines
- **Health Check Response**: < 2 seconds
- **Cron Job Execution**: < 5 minutes
- **Database Transactions**: < 10 seconds (95th percentile)
- **Memory Usage**: < 800MB (after optimization)

---

## 📞 INCIDENT RESPONSE

### If Issues Arise:
1. **Check Health Endpoint**: `/api/health`
2. **Review Logs**: `railway logs --environment production`
3. **Monitor Database**: Query performance and connection counts
4. **Validate Environment**: Ensure all required variables are set
5. **Contact Team**: Escalate to DevOps team if issues persist

### Emergency Contacts:
- **DevOps Lead**: [contact-info]
- **Database Admin**: [contact-info]  
- **Security Team**: [contact-info]

---

## 📋 SIGN-OFF

- [ ] **Database Migration Verified** - DBA: _________________ Date: _______
- [ ] **Security Review Passed** - Security: _________________ Date: _______
- [ ] **Performance Validated** - DevOps: _________________ Date: _______
- [ ] **Deployment Approved** - Release Manager: _________________ Date: _______

**Deployment Authorization**: _________________ Date: _______