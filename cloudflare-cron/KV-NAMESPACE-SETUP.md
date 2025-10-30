# KV Namespace Setup Instructions

## CRITICAL: Required for Deployment

The `wrangler.toml` file currently contains placeholder IDs that will cause deployment failures. Follow these steps to configure real KV namespaces:

## Step 1: Create KV Namespaces

Run these commands from the `cloudflare-cron/` directory:

```bash
# Create production namespaces
npx wrangler kv:namespace create "RATE_LIMIT_KV"
npx wrangler kv:namespace create "CIRCUIT_BREAKER_KV" 
npx wrangler kv:namespace create "METRICS_KV"

# Create preview namespaces
npx wrangler kv:namespace create "RATE_LIMIT_KV" --preview
npx wrangler kv:namespace create "CIRCUIT_BREAKER_KV" --preview
npx wrangler kv:namespace create "METRICS_KV" --preview
```

## Step 2: Update wrangler.toml

Each command will output an ID like: `"id": "abc123def456"`

Replace the placeholders in `wrangler.toml`:

### For RATE_LIMIT_KV (lines 53-54):
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
preview_id = "YOUR_RATE_LIMIT_PREVIEW_ID_HERE"
id = "YOUR_RATE_LIMIT_PRODUCTION_ID_HERE"
```

### For CIRCUIT_BREAKER_KV (lines 58-59):
```toml
[[kv_namespaces]]
binding = "CIRCUIT_BREAKER_KV"
preview_id = "YOUR_CIRCUIT_BREAKER_PREVIEW_ID_HERE"
id = "YOUR_CIRCUIT_BREAKER_PRODUCTION_ID_HERE"
```

### For METRICS_KV (lines 63-64):
```toml
[[kv_namespaces]]
binding = "METRICS_KV"
preview_id = "YOUR_METRICS_PREVIEW_ID_HERE"
id = "YOUR_METRICS_PRODUCTION_ID_HERE"
```

## Step 3: Verify Configuration

```bash
# List your namespaces to verify
npx wrangler kv:namespace list

# Test deployment
npx wrangler deploy --dry-run
```

## Step 4: Deploy

```bash
npx wrangler deploy
```

## Automated Setup

Alternatively, run the automated setup script:

```bash
./setup-kv-namespaces.sh
```

This script will:
1. Create all required namespaces
2. Extract the IDs automatically
3. Update wrangler.toml with real IDs
4. Create a backup of the original file

## Security Note

The KV namespaces store:
- Rate limiting counters (RATE_LIMIT_KV)
- Circuit breaker state (CIRCUIT_BREAKER_KV)  
- Performance metrics (METRICS_KV)

No sensitive data is stored in these namespaces.