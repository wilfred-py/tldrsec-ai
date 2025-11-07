# Cookie Security Implementation for A/B Testing Middleware

## Overview

This document outlines the comprehensive security improvements implemented in the A/B testing middleware to address cookie security vulnerabilities while maintaining functionality across different environments.

## Security Vulnerabilities Addressed

### 1. **Insecure Cookie Settings for Production**
- **Issue**: Cookies were not marked as `secure` in production environments
- **Risk**: Cookies could be transmitted over unencrypted HTTP connections
- **Solution**: Environment-specific configuration ensures `secure: true` for production

### 2. **Missing Cookie Domain Validation** 
- **Issue**: No validation of cookie domains
- **Risk**: Potential for cookie hijacking across subdomains
- **Solution**: Whitelist validation for allowed production domains

### 3. **No Cookie Integrity Validation**
- **Issue**: Cookies could be tampered with client-side
- **Risk**: A/B test manipulation, session fixation attacks
- **Solution**: HMAC-SHA256 signature validation for cookie integrity

### 4. **Weak SameSite Protection**
- **Issue**: `sameSite: 'lax'` provided insufficient CSRF protection
- **Risk**: Cross-site request forgery attacks
- **Solution**: `sameSite: 'strict'` for production environments

### 5. **No Cookie Expiration Validation**
- **Issue**: No server-side validation of cookie expiration
- **Risk**: Potentially stale or expired cookies being honored
- **Solution**: Server-side timestamp validation with 30-day expiration

### 6. **Missing httpOnly Flags**
- **Issue**: Inconsistent httpOnly settings
- **Risk**: XSS attacks accessing cookie values
- **Solution**: Strategic httpOnly configuration balancing security and functionality

## Implementation Details

### SecureCookieManager Class

The new `SecureCookieManager` class provides a secure abstraction for cookie management:

#### Key Features:
- **Environment-Aware Configuration**: Different security settings for dev/prod
- **HMAC Integrity Validation**: Cryptographic signatures prevent tampering
- **Domain Validation**: Whitelist-based domain validation for production
- **Timing-Safe Comparisons**: Prevent timing attacks during validation
- **Secure Cleanup**: Proper cookie clearing on errors
- **Cryptographically Secure Randomness**: Uses `crypto.getRandomValues` for variant selection

#### Security Controls:

```typescript
// Environment-specific configuration
{
  maxAge: 30 * 24 * 60 * 60, // 30 days
  httpOnly: true,             // Prevent XSS access
  secure: isProduction,       // HTTPS-only in production
  sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
  domain: validatedDomain,    // Validated domain for production
  path: '/'                   // Explicit path setting
}
```

### Cookie Signature Process

1. **Signature Generation**: 
   ```
   data = "${value}:${timestamp}"
   signature = HMAC-SHA256(COOKIE_SECRET, data)
   ```

2. **Cookie Storage**:
   - Main cookie: `ab_variant = "newsletter:1699123456789"`
   - Signature cookie: `ab_variant_sig = "hexadecimal_hmac_signature"`

3. **Validation Process**:
   - Parse cookie value and extract timestamp
   - Validate timestamp (not expired)
   - Regenerate signature and compare using timing-safe method
   - Validate variant value against whitelist

### Security Configuration

#### Required Environment Variables:
```bash
# Cookie Security Configuration (Required for A/B testing)
COOKIE_SECRET=your_secure_32_char_cookie_secret_here
```

#### Production Domains (Hardcoded Whitelist):
- `tldrsec.app`
- `www.tldrsec.app`

## Security Testing

### Test Coverage Areas:
1. **Environment-specific configuration testing**
2. **Cookie integrity validation with HMAC**
3. **Domain validation and sanitization**
4. **Timing-safe signature comparison**
5. **Cookie expiration validation**
6. **Input validation and sanitization**
7. **Cryptographic security**
8. **Error handling and secure failure modes**

### Key Test Cases:
- ✅ Secure cookies in production environment
- ✅ SameSite configuration by environment
- ✅ Domain validation for production
- ✅ HMAC signature generation and validation
- ✅ Timing attack resistance
- ✅ Cookie tampering detection
- ✅ Expiration validation (30-day limit)
- ✅ Input validation for variant values
- ✅ Cryptographically secure randomness
- ✅ Secure error handling and cleanup

## Security Benefits

### 1. **Defense in Depth**
Multiple layers of protection:
- Environment-specific security settings
- HMAC signature validation
- Domain whitelisting
- Input validation
- Secure error handling

### 2. **Attack Prevention**
- **Cookie Hijacking**: Domain validation and secure flags
- **Session Fixation**: HMAC signatures prevent cookie manipulation
- **CSRF Attacks**: Strict SameSite policy in production
- **XSS Cookie Access**: Strategic httpOnly configuration
- **Timing Attacks**: Constant-time signature comparison
- **Replay Attacks**: Timestamp validation and expiration

### 3. **Operational Security**
- **Fail-Secure Design**: Errors result in secure cookie cleanup
- **Environment Isolation**: Different security postures for dev/prod
- **Audit Trail**: Comprehensive security event logging
- **Configuration Validation**: Environment variable validation

## Performance Considerations

### Optimizations:
1. **Cryptographic Operations**: Async signature generation/validation
2. **Error Recovery**: Graceful degradation with cookie cleanup
3. **Client Validation**: Signature cookie accessible for client-side validation
4. **Memory Efficiency**: Minimal memory footprint for validation operations

### Trade-offs:
- **Performance vs Security**: Small latency increase for HMAC operations
- **Compatibility vs Security**: Strict SameSite may affect some flows
- **Usability vs Security**: HttpOnly restrictions balanced with functionality needs

## Maintenance and Updates

### Regular Security Tasks:
1. **Secret Rotation**: COOKIE_SECRET should be rotated periodically
2. **Domain Review**: Update allowed domains list as needed
3. **Algorithm Updates**: Monitor for HMAC-SHA256 deprecation
4. **Testing**: Regular security testing and penetration testing

### Monitoring:
- Cookie integrity violation alerts
- Invalid domain access attempts
- Signature validation failures
- Expired cookie access patterns

## Compliance

This implementation addresses:
- **OWASP Cookie Security Guidelines**
- **NIST Cybersecurity Framework**
- **General Data Protection Regulation (GDPR)**
- **California Consumer Privacy Act (CCPA)**

## Conclusion

The implemented cookie security framework provides comprehensive protection against common web application cookie vulnerabilities while maintaining the A/B testing functionality. The defense-in-depth approach ensures multiple layers of security, and the environment-aware configuration provides appropriate security postures for different deployment environments.