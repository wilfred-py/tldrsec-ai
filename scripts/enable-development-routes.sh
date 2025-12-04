#!/bin/bash

# Enable development-essential API routes
# This script re-enables routes that are needed for local development
# but may have been disabled for Vercel Hobby plan deployment

echo "Enabling development-essential API routes..."

# Development-essential routes that need to be enabled for local development
DEV_ROUTES=(
    "app/api/system/health/route.ts"
    "app/api/system/processing-metrics/route.ts"
    "app/api/companies/list/route.ts"
    "app/api/companies/search/route.ts"
)

enabled_count=0
already_enabled_count=0
not_found_count=0

for route in "${DEV_ROUTES[@]}"; do
    # Security: Validate route path to prevent path traversal
    if [[ ! "$route" =~ ^app/api/.*\.ts$ ]]; then
        echo "❌ Invalid route path detected: $route (security check failed)"
        continue
    fi
    
    disabled_path="${route}.disabled"

    if [[ -f "$disabled_path" ]]; then
        echo "Enabling: $route"
        # Atomic operation with error checking
        if mv "$disabled_path" "$route" 2>/dev/null; then
            echo "✅ Successfully enabled: $route"
            ((enabled_count++))
        else
            echo "❌ Failed to enable: $route (permission or disk space issue)"
        fi
    elif [[ -f "$route" ]]; then
        echo "Already enabled: $route"
        ((already_enabled_count++))
    else
        echo "Not found: $route (may need to be created)"
        ((not_found_count++))
    fi
done

echo ""
echo "=== Summary ==="
echo "Routes enabled: $enabled_count"
echo "Already enabled: $already_enabled_count"
echo "Not found: $not_found_count"
echo ""
echo "Development routes are now ready for local development!"
