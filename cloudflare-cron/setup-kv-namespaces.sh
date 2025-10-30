#!/bin/bash

# Cloudflare KV Namespace Setup Script
# This script creates the required KV namespaces and updates wrangler.toml with real IDs

set -e

echo "🚀 Setting up Cloudflare KV namespaces for rate limiting infrastructure..."

# Check if wrangler is installed
if ! command -v npx wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found. Please install with: npm install -g wrangler"
    exit 1
fi

# Create production namespaces
echo "📦 Creating production KV namespaces..."

RATE_LIMIT_PROD=$(npx wrangler kv:namespace create "RATE_LIMIT_KV" --preview false | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
CIRCUIT_BREAKER_PROD=$(npx wrangler kv:namespace create "CIRCUIT_BREAKER_KV" --preview false | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
METRICS_PROD=$(npx wrangler kv:namespace create "METRICS_KV" --preview false | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "✅ Production namespaces created:"
echo "   RATE_LIMIT_KV: $RATE_LIMIT_PROD"
echo "   CIRCUIT_BREAKER_KV: $CIRCUIT_BREAKER_PROD"
echo "   METRICS_KV: $METRICS_PROD"

# Create preview namespaces
echo "📦 Creating preview KV namespaces..."

RATE_LIMIT_PREVIEW=$(npx wrangler kv:namespace create "RATE_LIMIT_KV" --preview | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
CIRCUIT_BREAKER_PREVIEW=$(npx wrangler kv:namespace create "CIRCUIT_BREAKER_KV" --preview | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
METRICS_PREVIEW=$(npx wrangler kv:namespace create "METRICS_KV" --preview | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "✅ Preview namespaces created:"
echo "   RATE_LIMIT_KV (preview): $RATE_LIMIT_PREVIEW"
echo "   CIRCUIT_BREAKER_KV (preview): $CIRCUIT_BREAKER_PREVIEW"
echo "   METRICS_KV (preview): $METRICS_PREVIEW"

# Update wrangler.toml with real IDs
echo "📝 Updating wrangler.toml with real namespace IDs..."

# Create backup
cp wrangler.toml wrangler.toml.backup

# Update the file using sed
sed -i.tmp "s/REPLACE_WITH_ACTUAL_PREVIEW_ID/$RATE_LIMIT_PREVIEW/g; s/REPLACE_WITH_ACTUAL_PRODUCTION_ID/$RATE_LIMIT_PROD/g" wrangler.toml
sed -i.tmp "53s/preview_id = \"$RATE_LIMIT_PREVIEW\"/preview_id = \"$RATE_LIMIT_PREVIEW\"/; 54s/id = \"$RATE_LIMIT_PROD\"/id = \"$RATE_LIMIT_PROD\"/" wrangler.toml

# Fix the other namespaces
sed -i.tmp "58s/preview_id = \"$RATE_LIMIT_PREVIEW\"/preview_id = \"$CIRCUIT_BREAKER_PREVIEW\"/; 59s/id = \"$RATE_LIMIT_PROD\"/id = \"$CIRCUIT_BREAKER_PROD\"/" wrangler.toml
sed -i.tmp "63s/preview_id = \"$RATE_LIMIT_PREVIEW\"/preview_id = \"$METRICS_PREVIEW\"/; 64s/id = \"$RATE_LIMIT_PROD\"/id = \"$METRICS_PROD\"/" wrangler.toml

# Remove temporary file
rm wrangler.toml.tmp

echo "✅ wrangler.toml updated successfully!"

# Verify the configuration
echo "🔍 Verifying configuration..."
npx wrangler kv:namespace list

echo ""
echo "🎉 KV namespace setup completed successfully!"
echo ""
echo "📋 Summary:"
echo "   - Created 6 KV namespaces (3 production + 3 preview)"
echo "   - Updated wrangler.toml with real namespace IDs"
echo "   - Backup saved as wrangler.toml.backup"
echo ""
echo "🚀 Ready for deployment! Run: npx wrangler deploy"