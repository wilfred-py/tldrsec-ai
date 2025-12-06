#!/bin/bash
# Script to disable non-essential API routes to minimize Vercel function count

echo "Starting route consolidation..."

# Essential routes that must remain active
ESSENTIAL_ROUTES=(
    # Authentication routes
    "app/api/auth/clerk/route.ts"
    "app/api/auth/sign-out/route.ts"
    
    # Cron routes
    "app/api/cron/tier-aware/route.ts"
    "app/api/cron/process-filing-queue/route.ts"
    
    # Summary routes
    "app/api/summary/route.ts"
    "app/api/summary/json/[id]/route.ts"
    
    # User routes
    "app/api/user/route.ts"
    "app/api/user/tickers/route.ts"
    "app/api/user/onboarding/route.ts"
    
    # Dashboard essential
    "app/api/dashboard/summaries/route.ts"
    "app/api/dashboard/recent-summaries/route.ts"
    
    # Newsletter routes
    "app/api/newsletter/subscribe/route.ts"
    "app/api/newsletter/waitlist/route.ts"
)

# Check if preserve-dev flag is set
if [[ "$1" == "--preserve-dev" ]]; then
    # Add development routes to essential list
    ESSENTIAL_ROUTES+=(
        "app/api/system/health/route.ts"
        "app/api/system/processing-metrics/route.ts"
        "app/api/companies/list/route.ts"
        "app/api/companies/search/route.ts"
    )
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