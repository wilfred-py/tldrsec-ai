# Enhanced Rate Limiting - Deployment Guide

## 🚀 **Quick Deployment Guide**

This guide walks you through deploying the enhanced rate limiting Cloudflare Worker with advanced mitigation features.

## ✅ **Prerequisites**

1. **Cloudflare Account** with Workers plan
2. **Wrangler CLI** installed globally
3. **Node.js** 18+ for testing
4. **TLDRSEC Vercel endpoint** accessible at `https://tldrsec.app`

```bash
# Install Wrangler CLI
npm install -g wrangler

# Verify installation
wrangler --version
```

## 🔧 **Step 1: KV Namespace Setup**

Create the required KV namespaces for rate limiting persistence:

```bash
cd cloudflare-cron

# Create production KV namespaces
npx wrangler kv:namespace create "RATE_LIMIT_KV"
npx wrangler kv:namespace create "CIRCUIT_BREAKER_KV"
npx wrangler kv:namespace create "METRICS_KV"

# Create preview KV namespaces
npx wrangler kv:namespace create "RATE_LIMIT_KV" --preview
npx wrangler kv:namespace create "CIRCUIT_BREAKER_KV" --preview
npx wrangler kv:namespace create "METRICS_KV" --preview
```

**Expected Output:**
```
🌀 Creating namespace with title "RATE_LIMIT_KV"
✨ Success! Created namespace with title "RATE_LIMIT_KV"
  id: "abcd1234efgh5678ijkl9012mnop3456"

🌀 Creating namespace with title "RATE_LIMIT_KV" (preview)
✨ Success! Created namespace with title "RATE_LIMIT_KV"
  id: "preview9876wxyz5432abcd1234efgh"
```

## 🔧 **Step 2: Update wrangler.toml**

Update `wrangler.toml` with the actual KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
preview_id = "preview9876wxyz5432abcd1234efgh"  # Replace with actual preview ID
id = "abcd1234efgh5678ijkl9012mnop3456"        # Replace with actual production ID

[[kv_namespaces]]
binding = "CIRCUIT_BREAKER_KV"
preview_id = "YOUR_CIRCUIT_BREAKER_PREVIEW_ID"  # Replace with actual preview ID
id = "YOUR_CIRCUIT_BREAKER_PRODUCTION_ID"      # Replace with actual production ID

[[kv_namespaces]]
binding = "METRICS_KV"
preview_id = "YOUR_METRICS_PREVIEW_ID"         # Replace with actual preview ID
id = "YOUR_METRICS_PRODUCTION_ID"              # Replace with actual production ID
```

## 🔐 **Step 3: Configure Secrets**

Set the required secrets for authentication:

```bash
# Set the CRON_SECRET (required)
npx wrangler secret put CRON_SECRET
# Enter a secure secret (32+ characters recommended)

# Set Vercel bypass secret (optional, if using deployment protection)
npx wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET
# Enter your Vercel bypass secret

# Verify secrets are set
npx wrangler secret list
```

## 🏗️ **Step 4: Deploy the Worker**

Deploy the enhanced worker to production:

```bash
# Deploy to production
npx wrangler deploy

# Deploy with immediate log monitoring
npx wrangler deploy && npx wrangler tail --format=pretty
```

**Expected Output:**
```
Total Upload: 45.67 KiB / gzip: 12.34 KiB
Uploaded cloudflare-cron (2.45 sec)
Published cloudflare-cron (6.78 sec)
  https://cloudflare-cron.your-subdomain.workers.dev
Current Deployment ID: 12345678-abcd-1234-5678-9abcdef01234
```

## 🧪 **Step 5: Test the Deployment**

### **Basic Functionality Test**

```bash
# Test worker response
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://cloudflare-cron.your-subdomain.workers.dev

# Expected: Worker identification response
```

### **Comprehensive Testing**

```bash
# Update test configuration
nano test-rate-limiting.js
# Update WORKER_URL and CRON_SECRET

# Run comprehensive test suite
node test-rate-limiting.js
```

### **Monitor Real-Time Logs**

```bash
# View live worker logs
npx wrangler tail --format=pretty

# Filter for rate limiting events
npx wrangler tail --format=pretty | grep -E "(rate.limit|circuit|429)"
```

## 📊 **Step 6: Verify Enhanced Features**

### **Check KV Storage Usage**

```bash
# List keys in rate limiting KV
npx wrangler kv:key list --binding=RATE_LIMIT_KV

# Check circuit breaker state
npx wrangler kv:key get "circuit_breaker_state" --binding=CIRCUIT_BREAKER_KV

# View metrics data
npx wrangler kv:key list --binding=METRICS_KV --prefix="execution:"
```

### **Verify Cron Schedule**

```bash
# Check cron schedule is active
npx wrangler deployments list

# Monitor next execution
npx wrangler tail --format=pretty
# Wait for next 10-minute interval
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **KV Namespace Not Found Error**
   ```bash
   # Verify namespaces exist
   npx wrangler kv:namespace list
   
   # Check wrangler.toml has correct IDs
   cat wrangler.toml | grep -A 3 "kv_namespaces"
   ```

2. **Authentication Errors**
   ```bash
   # Verify secrets are set
   npx wrangler secret list
   
   # Test CRON_SECRET matches Vercel endpoint
   ```

3. **Rate Limiting Not Working**
   ```bash
   # Check KV storage is accessible
   npx wrangler kv:key put "test" "value" --binding=RATE_LIMIT_KV
   npx wrangler kv:key get "test" --binding=RATE_LIMIT_KV
   
   # Verify rate limiting logs
   npx wrangler tail --format=pretty | grep "rate"
   ```

4. **Circuit Breaker Stuck Open**
   ```bash
   # Reset circuit breaker state
   npx wrangler kv:key delete "circuit_breaker_state" --binding=CIRCUIT_BREAKER_KV
   ```

### **Debug Mode**

Enable enhanced debugging by updating `wrangler.toml`:

```toml
[vars]
DEBUG_MODE = "true"  # Enables detailed logging
```

Then redeploy:
```bash
npx wrangler deploy
```

## 📈 **Performance Monitoring**

### **Key Metrics to Monitor**

1. **Success Rate**: Should be >95% under normal conditions
2. **Rate Limit Events**: Should be <5% of total requests
3. **Circuit Breaker Activations**: Should be rare (<1/day)
4. **Average Response Time**: Should be <30 seconds

### **Monitoring Commands**

```bash
# View aggregated statistics
npx wrangler kv:key get "aggregated_stats" --binding=METRICS_KV

# Check recent error patterns
npx wrangler kv:key get "recent_errors" --binding=METRICS_KV

# Monitor circuit breaker state
npx wrangler kv:key get "circuit_breaker_state" --binding=CIRCUIT_BREAKER_KV
```

## 🔧 **Configuration Tuning**

### **Rate Limiting Adjustments**

To adjust rate limiting parameters, modify `index.js`:

```javascript
// Conservative settings (current)
const MAX_REQUESTS_PER_WINDOW = 30;        // Requests per minute
const GLOBAL_SUBREQUEST_LIMIT = 1800;      // Global limit per minute
const MAX_BURST_REQUESTS = 5;              // Burst protection

// More aggressive settings (if needed)
const MAX_REQUESTS_PER_WINDOW = 20;        // Reduced
const GLOBAL_SUBREQUEST_LIMIT = 1500;      // More conservative
const MAX_BURST_REQUESTS = 3;              // Stricter burst protection
```

### **Circuit Breaker Tuning**

```javascript
// Current settings
const CIRCUIT_BREAKER_THRESHOLD = 3;       // Failures to open circuit
const recoveryTimeMs = 180000;             // 3 minutes recovery

// More sensitive settings
const CIRCUIT_BREAKER_THRESHOLD = 2;       // Open faster
const recoveryTimeMs = 300000;             // 5 minutes recovery
```

## 🚀 **Production Deployment Checklist**

- [ ] KV namespaces created and configured
- [ ] wrangler.toml updated with actual namespace IDs
- [ ] CRON_SECRET set and matches Vercel endpoint
- [ ] Worker deployed successfully
- [ ] Basic functionality test passes
- [ ] Rate limiting test passes
- [ ] Circuit breaker test passes
- [ ] Cron schedule is active (every 10 minutes)
- [ ] Vercel endpoint responds correctly
- [ ] Debug mode disabled (`DEBUG_MODE = "false"`)
- [ ] Monitoring dashboard accessible
- [ ] Backup/recovery procedures documented

## 🆘 **Emergency Procedures**

### **Disable Worker Temporarily**

```bash
# Comment out cron triggers in wrangler.toml
# [triggers]
# crons = ["*/10 * * * *"]

# Redeploy without cron
npx wrangler deploy
```

### **Reset All State**

```bash
# Reset rate limiting
npx wrangler kv:key delete "rate_limit:*" --binding=RATE_LIMIT_KV

# Reset circuit breaker
npx wrangler kv:key delete "circuit_breaker_state" --binding=CIRCUIT_BREAKER_KV

# Clear metrics (optional)
npx wrangler kv:key delete "aggregated_stats" --binding=METRICS_KV
```

### **Rollback to Previous Version**

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to previous deployment
npx wrangler rollback [DEPLOYMENT_ID]
```

## 📞 **Support & Resources**

- **Documentation**: `README-RATE-LIMITING.md`
- **Testing**: `test-rate-limiting.js`
- **Logs**: `npx wrangler tail --format=pretty`
- **KV Management**: `npx wrangler kv:*` commands
- **Cloudflare Dashboard**: Monitor worker analytics

The enhanced rate limiting system provides robust protection against Cloudflare's 2,000 subrequest/minute limit while maintaining high availability and comprehensive observability.