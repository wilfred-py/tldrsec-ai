# Secure Development Workflow for TLDRSec AI

## Overview
This document provides secure alternatives to development authentication bypasses while maintaining developer productivity and security.

## Security-First Development Approach

### 1. Local Development Environment Setup

Instead of authentication bypasses, use these secure approaches:

#### Environment Configuration
```bash
# .env.local (never commit this file)
CRON_SECRET="dev-secure-token-$(openssl rand -hex 16)"
DATABASE_URL="postgresql://localhost:5432/tldrsec_dev"
ANTHROPIC_API_KEY="your-dev-api-key"
TEST_EMAIL="your-dev-email@example.com"

# Optional: Development-specific settings
NODE_ENV="development"
DEBUG_MODE="true"
```

#### Secure Token Generation
```bash
# Generate a secure development token
echo "CRON_SECRET=dev-$(openssl rand -hex 32)" >> .env.local

# Or use a consistent development token for team sharing
echo 'CRON_SECRET="dev-team-shared-secret-2024"' >> .env.local
```

### 2. Development Testing Workflow

#### Cron Endpoint Testing
```bash
# Test with proper authentication (recommended approach)
curl -X GET http://localhost:3000/api/cron/tier-aware \
  -H "Authorization: Bearer dev-team-shared-secret-2024" \
  -H "Content-Type: application/json"

# Use environment variable for convenience
export CRON_TOKEN="dev-team-shared-secret-2024"
curl -X GET http://localhost:3000/api/cron/tier-aware \
  -H "Authorization: Bearer $CRON_TOKEN"
```

#### Development Helper Scripts
Create `scripts/dev-helpers.sh`:
```bash
#!/bin/bash
# Secure development helpers

# Load environment variables
source .env.local

# Test cron endpoint with authentication
test_cron() {
    echo "Testing cron endpoint with authentication..."
    curl -X GET http://localhost:3000/api/cron/tier-aware \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Content-Type: application/json" \
      | jq
}

# Test with invalid token (should fail)
test_cron_security() {
    echo "Testing cron security (should fail)..."
    curl -X GET http://localhost:3000/api/cron/tier-aware \
      -H "Authorization: Bearer invalid-token" \
      -H "Content-Type: application/json"
}

# Run end-to-end security test
test_security() {
    echo "Running security tests..."
    npm run test:security
}
```

### 3. Security Testing Integration

#### Pre-Commit Security Checks
Add to `package.json`:
```json
{
  "scripts": {
    "test:security": "jest tests/security --verbose",
    "test:security:watch": "jest tests/security --watch",
    "lint:security": "eslint --ext .ts --fix app/ lib/ services/ tests/",
    "audit:security": "npm audit --audit-level moderate"
  }
}
```

#### Git Hooks (`.git/hooks/pre-commit`)
```bash
#!/bin/bash
echo "Running security checks..."

# Run security tests
npm run test:security
if [ $? -ne 0 ]; then
    echo "❌ Security tests failed! Commit blocked."
    exit 1
fi

# Run linting with security rules
npm run lint:security
if [ $? -ne 0 ]; then
    echo "❌ Security linting failed! Commit blocked."
    exit 1
fi

echo "✅ Security checks passed!"
```

### 4. Environment-Specific Security Controls

#### Development Environment
```typescript
// lib/security/development-security.ts
export const getDevelopmentSecurityConfig = () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Development security config only available in development');
  }
  
  return {
    // More verbose logging for debugging
    enableVerboseLogging: true,
    
    // Shorter token expiration for testing
    tokenExpirationSeconds: 3600, // 1 hour
    
    // Allow additional development IPs if configured
    allowedIPs: process.env.DEV_ALLOWED_IPS?.split(',') || [],
    
    // Development-specific rate limits (more lenient)
    rateLimits: {
      cron: { requests: 100, windowMs: 60000 }, // 100 requests per minute
      api: { requests: 1000, windowMs: 60000 }   // 1000 requests per minute
    }
  };
};
```

#### Production Environment
```typescript
// lib/security/production-security.ts
export const getProductionSecurityConfig = () => {
  return {
    // Minimal logging to prevent information disclosure
    enableVerboseLogging: false,
    
    // Standard token expiration
    tokenExpirationSeconds: 86400, // 24 hours
    
    // Strict IP allowlisting
    allowedIPs: process.env.PROD_ALLOWED_IPS?.split(',') || [],
    
    // Production rate limits (strict)
    rateLimits: {
      cron: { requests: 10, windowMs: 60000 },  // 10 requests per minute
      api: { requests: 100, windowMs: 60000 }   // 100 requests per minute
    }
  };
};
```

### 5. Security Monitoring and Alerting

#### Development Security Alerts
```typescript
// lib/security/development-monitor.ts
export class DevelopmentSecurityMonitor {
  static logSecurityEvent(event: string, details: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV-SECURITY] ${event}:`, details);
      
      // Alert on suspicious activity even in development
      if (this.isSuspicious(event, details)) {
        console.warn('🚨 SUSPICIOUS ACTIVITY DETECTED IN DEVELOPMENT:', {
          event,
          details,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  private static isSuspicious(event: string, details: any): boolean {
    const suspiciousPatterns = [
      'multiple_failed_auth',
      'sql_injection_attempt',
      'xss_attempt',
      'unusual_request_pattern'
    ];
    
    return suspiciousPatterns.some(pattern => 
      event.toLowerCase().includes(pattern)
    );
  }
}
```

### 6. Team Development Guidelines

#### Security Code Review Checklist
- [ ] No authentication bypasses or hardcoded credentials
- [ ] All user inputs are validated and sanitized
- [ ] Error messages don't expose sensitive information
- [ ] Rate limiting is properly implemented
- [ ] Security tests cover new functionality
- [ ] Environment variables are properly configured
- [ ] Audit logs are comprehensive but not verbose

#### Development Best Practices
1. **Never commit secrets**: Use `.env.local` for development secrets
2. **Test security controls**: Run security tests regularly during development
3. **Use secure defaults**: Start with restrictive settings and open up as needed
4. **Monitor in development**: Log security events to catch issues early
5. **Regular security updates**: Keep dependencies updated and audit regularly

### 7. Debugging Security Issues

#### Safe Debugging Approaches
```typescript
// Instead of bypassing security, add detailed logging
const debugSecurityValidation = (request: NextRequest, stage: string) => {
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG_SECURITY) {
    console.log(`[SECURITY-DEBUG] ${stage}:`, {
      headers: Object.fromEntries(request.headers.entries()),
      url: request.url,
      method: request.method,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent')
    });
  }
};

// Use in your route handlers
export async function GET(request: NextRequest) {
  debugSecurityValidation(request, 'REQUEST_START');
  
  // ... your existing security validation ...
  
  debugSecurityValidation(request, 'AUTH_SUCCESS');
  // ... rest of handler
}
```

## Conclusion

This secure development workflow ensures that:

1. ✅ **No authentication bypasses** exist in any environment
2. ✅ **Security is built-in** from the start of development  
3. ✅ **Developer productivity** is maintained through proper tooling
4. ✅ **Security testing** is integrated into the development process
5. ✅ **Monitoring and alerting** catch issues early

Remember: **Security is not optional, even in development environments.**