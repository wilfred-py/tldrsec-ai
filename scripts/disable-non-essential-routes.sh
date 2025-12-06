#!/bin/bash

# Disable non-essential API routes for Hobby plan deployment
# This script renames route.ts files to route.ts.disabled to prevent them from being deployed

echo "Disabling non-essential API routes for Hobby plan compliance..."

# Create disabled directory if it doesn't exist
mkdir -p disabled-routes

# Keep only essential routes, disable the rest
# Production-essential routes (required for core functionality)
ESSENTIAL_ROUTES=(
    "app/api/cron/tier-aware/route.ts"
    "app/api/filings/enhanced-summary/route.ts"
    "app/api/email/summary/route.ts"
    "app/api/email/welcome/route.ts"
    "app/api/health/route.ts"
    "app/api/summaries/[id]/route.ts"
    "app/api/summaries/route.ts"
    "app/api/user/tickers/route.ts"
    "app/api/tickers/search/route.ts"
    "app/api/webhook/clerk/route.ts"
    "app/api/user/preferences/route.ts"
    "app/api/monitoring/pipeline-health/route.ts"
)

# Development-essential routes (required for local development)
# These are automatically enabled in development but disabled for Vercel Hobby deployment
DEV_ROUTES=(
    "app/api/system/health/route.ts"
    "app/api/system/processing-metrics/route.ts"
    "app/api/companies/list/route.ts"
    "app/api/companies/search/route.ts"
)

# Check if we should preserve development routes
PRESERVE_DEV_ROUTES=${PRESERVE_DEV_ROUTES:-false}
if [[ "$PRESERVE_DEV_ROUTES" == "true" ]]; then
    ESSENTIAL_ROUTES+=("${DEV_ROUTES[@]}")
    echo "Development routes will be preserved"
fi

# Get all route files
ALL_ROUTES=$(find app/api -name "route.ts" | sort)

# Disable non-essential routes
for route in $ALL_ROUTES; do
    # Security: Validate route path to prevent path traversal
    if [[ ! "$route" =~ ^app/api/.*\.ts$ ]]; then
        echo "❌ Invalid route path detected: $route (security check failed)"
        continue
    fi
    
    # Check if file exists and is a regular file
    if [[ ! -f "$route" ]]; then
        echo "⚠️ Route file not found: $route"
        continue
    fi
    
    is_essential=false
    for essential in "${ESSENTIAL_ROUTES[@]}"; do
        if [[ "$route" == "$essential" ]]; then
            is_essential=true
            break
        fi
    done
    
    if [[ "$is_essential" == false ]]; then
        echo "Disabling: $route"
        # Atomic operation with error checking
        if mv "$route" "$route.disabled" 2>/dev/null; then
            echo "✅ Successfully disabled: $route"
        else
            echo "❌ Failed to disable: $route (permission or disk space issue)"
        fi
    else
        echo "Keeping: $route"
    fi
done

echo "Route consolidation complete!"
echo "Essential routes count: ${#ESSENTIAL_ROUTES[@]}"
echo "Total routes found: $(echo "$ALL_ROUTES" | wc -l)"