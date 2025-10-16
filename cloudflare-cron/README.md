# TLDRSEC Cloudflare Worker

This directory contains the Cloudflare Worker for TLDRSEC's SEC filing monitoring system. The worker runs on Cloudflare's global edge network and executes cron jobs every 10 minutes to trigger SEC filing processing.

## Architecture

- **Purpose**: Schedule and trigger SEC filing monitoring and processing
- **Runtime**: Cloudflare Workers (V8 isolates on edge network)
- **Schedule**: Every 10 minutes (`*/10 * * * *`)
- **Target**: Vercel application at `https://tldrsec.app/api/cron/tier-aware-async`
- **Global**: Distributed across Cloudflare's 300+ edge locations

## Files

- `index.js` - Main worker script with cron handler and timeout management
- `wrangler.toml` - Cloudflare Worker configuration
- `package.json` - Node.js dependencies and scripts
- `.wrangler/` - Wrangler CLI state and cache (auto-generated)

## Development Commands

```bash
# Install dependencies
npm ci

# Validate configuration
npm run validate

# Deploy (dry run)
npm run deploy:dry-run

# Deploy to production
npm run deploy

# Monitor logs
npm run logs

# Check deployment status
npm run status
```

## Deployment

### Automatic Deployment (CI/CD)

The worker is automatically deployed via GitHub Actions when:
- Code is pushed to `main` branch
- Changes are made to `cloudflare-cron/` directory
- Manual workflow dispatch is triggered

### Manual Deployment

From project root:
```bash
# Using deployment script
npm run cloudflare:deploy

# Using npm scripts in worker directory
cd cloudflare-cron
npm run deploy
```

### Required Secrets

Configure these secrets in Cloudflare Workers dashboard:

1. **CRON_SECRET** (Required)
   ```bash
   cd cloudflare-cron
   npx wrangler secret put CRON_SECRET
   ```

2. **VERCEL_AUTOMATION_BYPASS_SECRET** (Optional)
   ```bash
   cd cloudflare-cron  
   npx wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET
   ```

## Environment Variables

Set in `wrangler.toml`:
- `PUBLIC_URL` - Target Vercel application URL (https://tldrsec.app)

## Monitoring

### Real-time Logs
```bash
cd cloudflare-cron
npm run logs
# or
npx wrangler tail --format=pretty
```

### Deployment Status
```bash
cd cloudflare-cron
npm run status
# or
npx wrangler deployments list
```

### Performance Metrics

Available in Cloudflare Workers dashboard:
- Execution duration
- Success/error rates
- CPU time usage
- Memory usage
- Geographic distribution

## Worker Features

### Timeout Protection
- **Worker Timeout**: 10 minutes (Cloudflare maximum)
- **Request Timeout**: 9 minutes (with buffer)
- **Graceful Degradation**: Automatic fallback endpoints

### Error Handling
- Comprehensive error classification
- Retry logic with exponential backoff
- Safe error logging (no sensitive data)
- Fallback endpoint strategy

### Endpoint Fallback Strategy
1. Primary: `/api/cron/tier-aware-async` (microservices architecture)
2. Secondary: `/api/cron/tier-aware-optimized` (optimized processing)
3. Fallback: `/api/cron/tier-aware` (original endpoint)

### Security Features
- API key authentication via `Authorization` header
- Backup authentication via `X-Cron-Auth` header
- Execution ID tracking for debugging
- Vercel deployment protection bypass support

## Troubleshooting

### Common Issues

**Deployment Fails**
```bash
# Check API token
npx wrangler whoami

# Validate configuration
npm run validate

# Check syntax
node --check index.js
```

**Cron Job Not Running**
1. Check worker logs: `npm run logs`
2. Verify secrets are configured: `npx wrangler secret list`
3. Check Vercel endpoint health
4. Review cron trigger configuration in `wrangler.toml`

**Authentication Errors**
1. Verify `CRON_SECRET` matches Vercel configuration
2. Check header configuration in worker
3. Ensure Vercel endpoint accepts worker requests

### Debug Mode

The worker includes comprehensive logging:
- Execution ID tracking
- Request/response details
- Timing information
- Error classification
- Fallback attempts

## Performance

### Cold Start Optimization
- Minimal dependencies
- Efficient memory usage
- Fast initialization
- Edge caching

### Resource Limits
- **Memory**: 128MB per execution
- **CPU**: 50ms per execution
- **Duration**: 10 minutes maximum
- **Requests**: No limit (pay-per-use)

## Cost Optimization

- **Free Tier**: 100,000 requests/day
- **Paid Tier**: $0.50 per million requests
- **No idle costs** - pay only for execution time
- **Global distribution** at no extra cost

## Architecture Benefits

1. **Zero Cold Starts**: V8 isolates start in <5ms
2. **Global Distribution**: Runs from nearest edge location
3. **High Reliability**: 99.99% uptime SLA
4. **Cost Effective**: Serverless pricing model
5. **Automatic Scaling**: Handles traffic spikes seamlessly
6. **Built-in Monitoring**: Comprehensive metrics and logging

## Integration with Main Application

The worker is designed to work seamlessly with the main TLDRSEC application:

- **Vercel Integration**: Calls Vercel API endpoints
- **Database Independence**: No direct database connections
- **Stateless Design**: Each execution is independent
- **Async Processing**: Triggers background job processing
- **Error Isolation**: Worker failures don't affect main app

## Security Considerations

- **API Authentication**: Uses secure tokens for Vercel communication
- **No Sensitive Data**: Worker doesn't store or log sensitive information  
- **Audit Trail**: All executions are logged with unique IDs
- **Rate Limiting**: Built-in protection against abuse
- **HTTPS Only**: All communications are encrypted