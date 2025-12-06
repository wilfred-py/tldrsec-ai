#!/bin/bash
# Script to enable essential development routes for local testing

echo "Enabling essential development routes..."

# Development routes to enable
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

echo "---"
echo "Development route activation complete!"
echo "✅ Enabled: $enabled_count routes"
echo "ℹ️ Already enabled: $already_enabled_count routes"
echo "⚠️ Not found: $not_found_count routes"