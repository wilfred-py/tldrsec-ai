#!/bin/bash

# Cloudflare Worker Deployment Verification Script
# This script ensures the worker can be deployed correctly and diagnoses common issues

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

print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  TLDRSEC Cloudflare Worker Deployment Check  ${NC}"
    echo -e "${BLUE}================================================${NC}"
}

# Check current directory
check_directory() {
    print_status "Checking current directory..."
    
    if [[ ! -f "wrangler.toml" ]] || [[ ! -f "index.js" ]] || [[ ! -f "package.json" ]]; then
        print_error "This script must be run from the cloudflare-cron/ directory"
        print_error "Expected files: wrangler.toml, index.js, package.json"
        print_status "Current directory: $(pwd)"
        print_status "Files found: $(ls -la)"
        exit 1
    fi
    
    print_success "Running from correct directory: $(pwd)"
}

# Validate file structure
validate_files() {
    print_status "Validating worker files..."
    
    # Check index.js syntax
    if ! node --check index.js; then
        print_error "JavaScript syntax errors in index.js"
        exit 1
    fi
    print_success "index.js syntax is valid"
    
    # Check wrangler.toml structure
    if ! grep -q "main.*=.*index.js" wrangler.toml; then
        print_error "wrangler.toml missing or incorrect 'main' entry"
        print_status "Expected: main = \"index.js\""
        exit 1
    fi
    print_success "wrangler.toml configuration is valid"
    
    # Check package.json
    if ! node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))"; then
        print_error "package.json is not valid JSON"
        exit 1
    fi
    print_success "package.json is valid"
}

# Check wrangler installation
check_wrangler() {
    print_status "Checking wrangler installation..."
    
    if ! command -v npx &> /dev/null; then
        print_error "npx is not available"
        exit 1
    fi
    
    # Test wrangler command
    if ! npx wrangler --version > /dev/null 2>&1; then
        print_error "wrangler is not available via npx"
        print_status "Installing wrangler..."
        npm install wrangler@latest
    fi
    
    local version=$(npx wrangler --version 2>/dev/null | head -n1)
    print_success "wrangler is available: $version"
}

# Test deployment dry run
test_deployment() {
    print_status "Testing deployment with dry run..."
    
    # Test the deployment without actually deploying
    if npx wrangler deploy --dry-run; then
        print_success "Dry run deployment successful"
        print_status "Worker is ready for production deployment"
    else
        print_error "Dry run deployment failed"
        print_status "Check the error output above for details"
        exit 1
    fi
}

# Check environment configuration
check_environment() {
    print_status "Checking environment configuration..."
    
    # Check if API token is available (without exposing it)
    if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
        print_success "CLOUDFLARE_API_TOKEN is configured"
    else
        print_warning "CLOUDFLARE_API_TOKEN is not set"
        print_status "This is expected for local testing, but required for actual deployment"
    fi
    
    # Check wrangler.toml configuration
    if grep -q "PUBLIC_URL.*https://tldrsec.app" wrangler.toml; then
        print_success "PUBLIC_URL is correctly configured"
    else
        print_warning "PUBLIC_URL may not be correctly configured"
    fi
}

# Show deployment commands
show_deployment_commands() {
    print_status "Deployment Commands Summary:"
    echo ""
    print_status "To deploy from this directory:"
    echo "  npx wrangler deploy"
    echo ""
    print_status "To monitor logs:"
    echo "  npx wrangler tail --format=pretty"
    echo ""
    print_status "To check deployment status:"
    echo "  npx wrangler deployments list"
    echo ""
    print_status "To configure secrets:"
    echo "  npx wrangler secret put CRON_SECRET"
    echo "  npx wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET"
}

# Diagnosis for common issues
diagnose_common_issues() {
    print_status "Common Issue Diagnosis:"
    echo ""
    
    print_status "If you see 'Missing entry-point to Worker script':"
    echo "  ❌ Make sure you're running from cloudflare-cron/ directory"
    echo "  ❌ Ensure wrangler.toml has: main = \"index.js\""
    echo "  ❌ Use 'npx wrangler deploy' not 'npx wrangler versions upload'"
    echo ""
    
    print_status "If you see authentication errors:"
    echo "  ❌ Set CLOUDFLARE_API_TOKEN environment variable"
    echo "  ❌ Configure worker secrets with 'npx wrangler secret put'"
    echo ""
    
    print_status "If you see timeout or network errors:"
    echo "  ❌ Check internet connectivity"
    echo "  ❌ Verify Cloudflare API status"
    echo "  ❌ Try again with --verbose flag for more details"
}

# Main execution
main() {
    print_header
    check_directory
    validate_files
    check_wrangler
    check_environment
    test_deployment
    
    echo ""
    print_success "✅ All verification checks passed!"
    print_success "🚀 Worker is ready for deployment"
    echo ""
    
    show_deployment_commands
    echo ""
    diagnose_common_issues
}

# Execute main function
main "$@"