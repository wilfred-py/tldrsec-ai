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
    disabled_path="${route}.disabled"

    if [[ -f "$disabled_path" ]]; then
        echo "Enabling: $route"
        mv "$disabled_path" "$route"
        ((enabled_count++))
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
