#!/bin/bash
set -e

echo "🔍 Cloudflare Worker Build Validation"
echo "======================================"

# Check Node.js version
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"

# Validate file structure
echo "📁 Validating file structure..."
if [ ! -f "index.js" ]; then
    echo "❌ index.js not found"
    exit 1
fi
echo "✅ index.js found"

if [ ! -f "wrangler.toml" ]; then
    echo "❌ wrangler.toml not found"
    exit 1
fi
echo "✅ wrangler.toml found"

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi
echo "✅ package.json found"

# Validate JavaScript syntax
echo "📝 Validating JavaScript syntax..."
node --check index.js
echo "✅ JavaScript syntax valid"

# Check wrangler installation
echo "🔧 Checking wrangler installation..."
npx wrangler --version
echo "✅ Wrangler available"

# Validate wrangler configuration
echo "⚙️ Validating wrangler configuration..."
if ! grep -q "name.*=.*cloudflare-cron" wrangler.toml; then
    echo "❌ wrangler.toml missing valid name entry"
    exit 1
fi

if ! grep -q "main.*=.*index.js" wrangler.toml; then
    echo "❌ wrangler.toml missing valid main entry"
    exit 1
fi
echo "✅ Configuration valid"

# Run dry-run deployment (only if API token is available)
echo "🚀 Testing deployment (dry-run)..."
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    if npx wrangler deploy --dry-run; then
        echo "✅ Deployment validation successful"
    else
        echo "❌ Deployment validation failed"
        exit 1
    fi
else
    echo "⚠️ CLOUDFLARE_API_TOKEN not available, skipping wrangler dry-run"
    echo "✅ Configuration validation completed (dry-run skipped)"
fi

echo ""
echo "🎉 All validation checks passed!"
echo "The worker is ready for deployment."