#!/bin/bash

# Cloudflare Worker Secrets Setup Script
# This script helps configure required secrets for the TLDRSEC worker

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    cat << EOF
Usage: $0 [COMMAND]

Configure secrets for TLDRSEC Cloudflare Worker.

COMMANDS:
    setup       Interactive setup of all required secrets
    list        List currently configured secrets
    put         Put a specific secret (interactive)
    delete      Delete a specific secret (interactive)
    validate    Validate secret configuration
    help        Show this help message

EXAMPLES:
    # Interactive setup
    $0 setup

    # List secrets
    $0 list

    # Validate configuration
    $0 validate

REQUIRED SECRETS:
    - CRON_SECRET: Authentication token for Vercel API calls

OPTIONAL SECRETS:
    - VERCEL_AUTOMATION_BYPASS_SECRET: Bypass deployment protection

EOF
}

list_secrets() {
    print_status "Listing configured worker secrets..."
    npx wrangler secret list
}

setup_cron_secret() {
    print_status "Setting up CRON_SECRET..."
    print_warning "This secret must match the CRON_SECRET in your Vercel environment variables"
    print_status "The secret should be a strong, randomly generated string (minimum 32 characters)"
    print_status ""
    
    echo "Please enter the CRON_SECRET value:"
    npx wrangler secret put CRON_SECRET
    
    if [ $? -eq 0 ]; then
        print_success "CRON_SECRET configured successfully"
    else
        print_error "Failed to configure CRON_SECRET"
        return 1
    fi
}

setup_bypass_secret() {
    print_status "Setting up VERCEL_AUTOMATION_BYPASS_SECRET (optional)..."
    print_warning "This is only needed if Vercel deployment protection is enabled"
    print_status ""
    
    read -p "Do you want to configure VERCEL_AUTOMATION_BYPASS_SECRET? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Please enter the VERCEL_AUTOMATION_BYPASS_SECRET value:"
        npx wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET
        
        if [ $? -eq 0 ]; then
            print_success "VERCEL_AUTOMATION_BYPASS_SECRET configured successfully"
        else
            print_error "Failed to configure VERCEL_AUTOMATION_BYPASS_SECRET"
            return 1
        fi
    else
        print_status "Skipping VERCEL_AUTOMATION_BYPASS_SECRET setup"
    fi
}

interactive_setup() {
    print_status "TLDRSEC Cloudflare Worker Secrets Setup"
    print_status "======================================="
    print_status ""
    
    # Check if wrangler is available
    if ! command -v npx &> /dev/null || ! npx wrangler --version &> /dev/null; then
        print_error "Wrangler is not available"
        print_error "Please run 'npm install' in this directory first"
        exit 1
    fi
    
    print_status "Current secret status:"
    npx wrangler secret list
    print_status ""
    
    # Setup CRON_SECRET
    setup_cron_secret
    print_status ""
    
    # Setup optional bypass secret
    setup_bypass_secret
    print_status ""
    
    print_success "Secret setup completed!"
    print_status ""
    print_status "Final secret configuration:"
    npx wrangler secret list
}

put_secret() {
    print_status "Available secrets to configure:"
    echo "1. CRON_SECRET (required)"
    echo "2. VERCEL_AUTOMATION_BYPASS_SECRET (optional)"
    echo "3. Custom secret"
    print_status ""
    
    read -p "Enter secret name: " secret_name
    
    if [ -z "$secret_name" ]; then
        print_error "Secret name cannot be empty"
        exit 1
    fi
    
    echo "Please enter the value for $secret_name:"
    npx wrangler secret put "$secret_name"
}

delete_secret() {
    print_status "Current secrets:"
    npx wrangler secret list
    print_status ""
    
    read -p "Enter secret name to delete: " secret_name
    
    if [ -z "$secret_name" ]; then
        print_error "Secret name cannot be empty"
        exit 1
    fi
    
    read -p "Are you sure you want to delete '$secret_name'? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npx wrangler secret delete "$secret_name"
        print_success "Secret '$secret_name' deleted"
    else
        print_status "Deletion cancelled"
    fi
}

validate_secrets() {
    print_status "Validating worker secret configuration..."
    
    # Get list of secrets
    secrets_output=$(npx wrangler secret list 2>/dev/null || echo "")
    
    # Check for CRON_SECRET
    if echo "$secrets_output" | grep -q "CRON_SECRET"; then
        print_success "✅ CRON_SECRET is configured"
    else
        print_error "❌ CRON_SECRET is missing (required)"
        return 1
    fi
    
    # Check for optional bypass secret
    if echo "$secrets_output" | grep -q "VERCEL_AUTOMATION_BYPASS_SECRET"; then
        print_success "✅ VERCEL_AUTOMATION_BYPASS_SECRET is configured"
    else
        print_warning "⚠️  VERCEL_AUTOMATION_BYPASS_SECRET is not configured (optional)"
    fi
    
    print_status ""
    print_success "Secret validation completed"
    
    # Test deployment to verify secrets work
    print_status "Testing deployment with current secrets..."
    npx wrangler deploy --dry-run
    
    if [ $? -eq 0 ]; then
        print_success "✅ Deployment test successful - secrets are properly configured"
    else
        print_error "❌ Deployment test failed - please check secret configuration"
        return 1
    fi
}

main() {
    local command=${1:-help}
    
    case $command in
        setup)
            interactive_setup
            ;;
        list)
            list_secrets
            ;;
        put)
            put_secret
            ;;
        delete)
            delete_secret
            ;;
        validate)
            validate_secrets
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"