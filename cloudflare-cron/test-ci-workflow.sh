#!/bin/bash

# Test script to simulate CI/CD workflow steps for Cloudflare Worker
# This script tests all the validation steps that run in GitHub Actions

set -e  # Exit on any error

echo "🧪 Testing Cloudflare Worker CI/CD Workflow Steps"
echo "================================================="

# Test 1: Verify required files exist
echo "✅ Step 1: Verifying required files..."
if [ ! -f "wrangler.toml" ]; then
    echo "❌ wrangler.toml not found"
    exit 1
fi
echo "   ✅ wrangler.toml exists"

if [ ! -f "index.js" ]; then
    echo "❌ index.js not found"
    exit 1
fi
echo "   ✅ index.js exists"

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi
echo "   ✅ package.json exists"

# Test 2: Validate package.json and install dependencies
echo "✅ Step 2: Installing dependencies..."
echo "   Node.js version: $(node --version)"
echo "   NPM version: $(npm --version)"

if npm ci; then
    echo "   ✅ npm ci successful"
else
    echo "   ⚠️ npm ci failed, trying npm install..."
    npm install
    echo "   ✅ npm install successful"
fi

# Test 3: Verify wrangler installation
echo "✅ Step 3: Verifying wrangler installation..."
npx wrangler --version
echo "   ✅ Wrangler is available"

# Test 4: Validate wrangler.toml configuration
echo "✅ Step 4: Validating wrangler.toml configuration..."
if ! grep -q "main.*=.*index.js" wrangler.toml; then
    echo "❌ wrangler.toml missing 'main' entry"
    exit 1
fi
echo "   ✅ wrangler.toml has valid main entry"

if ! grep -q "name.*=.*cloudflare-cron" wrangler.toml; then
    echo "❌ wrangler.toml missing valid name entry"
    exit 1
fi
echo "   ✅ wrangler.toml has valid name entry"

# Test 5: JavaScript syntax check
echo "✅ Step 5: Checking JavaScript syntax..."
node --check index.js
echo "   ✅ JavaScript syntax valid"

# Test 6: Worker configuration validation
echo "✅ Step 6: Validating worker configuration..."
echo "   Testing wrangler configuration parsing..."
npx wrangler whoami --help > /dev/null && echo "   ✅ Wrangler CLI functional"

echo "   Validating wrangler.toml syntax..."
if npx wrangler deploy --dry-run 2>&1 | grep -q "Total Upload:" || 
   npx wrangler deploy --dry-run 2>&1 | grep -q "dry-run: exiting"; then
    echo "   ✅ Worker configuration validation successful"
else
    echo "   ❌ Worker configuration validation failed"
    exit 1
fi

echo ""
echo "🎉 All CI/CD workflow steps completed successfully!"
echo "   The Cloudflare Worker should deploy without issues in GitHub Actions."
echo ""
echo "📊 Summary:"
echo "   ✅ Required files present"
echo "   ✅ Dependencies installed"
echo "   ✅ Wrangler functional"
echo "   ✅ Configuration valid"
echo "   ✅ JavaScript syntax valid"
echo "   ✅ Dry-run deployment successful"