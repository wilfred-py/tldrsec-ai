import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { MiddlewareSecurity, SecurityAuditor } from './lib/security/middleware-security'
import { logger } from './lib/logging'
import { redirectMonitor } from './lib/monitoring/redirect-protection-monitor'

const middlewareLogger = logger.child('security-middleware');

/**
 * Independent cron authentication middleware
 * Handles /api/cron/* requests completely before Clerk middleware
 */
const cronAuthMiddleware = async (request: NextRequest): Promise<NextResponse | undefined> => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Only handle cron endpoints
  if (!pathname.startsWith('/api/cron/')) {
    return undefined; // Pass to next middleware (Clerk)
  }
  
  // Allow HEAD requests for health checks without authentication
  if (request.method === 'HEAD') {
    middlewareLogger.info('Allowing unauthenticated HEAD request for health check', {
      pathname,
      timestamp: new Date().toISOString()
    });
    return undefined; // Pass through to the handler
  }
  
  middlewareLogger.info('Processing cron request independently of Clerk', {
    pathname,
    method: request.method,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Check both Authorization and X-Cron-Auth headers (X-Cron-Auth avoids Clerk conflicts)
    const authHeader = request.headers.get('authorization') || request.headers.get('x-cron-auth');
    const cronSecret = process.env.CRON_SECRET?.trim();
    
    if (!cronSecret || cronSecret.length < 32) {
      middlewareLogger.error('CRON_SECRET not properly configured');
      return new NextResponse(
        JSON.stringify({
          error: 'Server configuration error',
          code: 500,
          timestamp: new Date().toISOString(),
          path: pathname
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          }
        }
      );
    }

    // Check for HMAC authentication FIRST (Cloudflare Worker uses HMAC)
    const hmacSignature = request.headers.get('x-hmac-signature');
    const hmacTimestamp = request.headers.get('x-hmac-timestamp');

    if (hmacSignature && hmacTimestamp) {
      middlewareLogger.info('HMAC authentication detected, delegating to route handler', {
        pathname,
        timestamp: new Date().toISOString()
      });

      // Set header to bypass remaining middleware checks and indicate HMAC auth
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-security-validated', 'true');
      requestHeaders.set('x-auth-method', 'hmac');

      return NextResponse.next({
        request: {
          headers: requestHeaders
        }
      });
    }

    // Fall back to Bearer token authentication for backward compatibility
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      middlewareLogger.warn('Missing or invalid authorization header for cron request');
      return new NextResponse(
        JSON.stringify({
          error: 'Unauthorized',
          code: 401,
          timestamp: new Date().toISOString(),
          path: pathname
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          }
        }
      );
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    
    // Use timing-safe comparison to prevent timing attacks
    const encoder = new TextEncoder();
    const tokenBytes = encoder.encode(token);
    const secretBytes = encoder.encode(cronSecret);
    
    // Compare lengths first
    let isValid = tokenBytes.length === secretBytes.length;
    
    // Always compare full length to prevent timing attacks
    const maxLength = Math.max(tokenBytes.length, secretBytes.length);
    for (let i = 0; i < maxLength; i++) {
      const tokenByte = i < tokenBytes.length ? tokenBytes[i] : 0;
      const secretByte = i < secretBytes.length ? secretBytes[i] : 0;
      if (tokenByte !== secretByte) {
        isValid = false;
      }
    }
    
    if (!isValid) {
      middlewareLogger.warn('Invalid authorization token for cron request');
      return new NextResponse(
        JSON.stringify({
          error: 'Unauthorized',
          code: 401,
          timestamp: new Date().toISOString(),
          path: pathname
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          }
        }
      );
    }

    // Optional: IP allowlist validation for cron requests
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    
    const allowedIPs = process.env.CRON_ALLOWED_IPS;
    if (allowedIPs) {
      const allowedIPList = allowedIPs.split(',').map(ip => ip.trim());
      
      if (!allowedIPList.includes(clientIP)) {
        middlewareLogger.warn('IP not in allowlist for cron request', { clientIP, allowedIPs: allowedIPList });
        return new NextResponse(
          JSON.stringify({
            error: 'Forbidden',
            code: 403,
            timestamp: new Date().toISOString(),
            path: pathname
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
            }
          }
        );
      }
    }

    // Authentication successful - continue to route handler with validation header
    middlewareLogger.info('Cron authentication successful', {
      pathname,
      clientIP,
      timestamp: new Date().toISOString()
    });
    
    // Set header to indicate middleware validation succeeded and continue
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-security-validated', 'true');
    
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    });
    
  } catch (error) {
    middlewareLogger.error('Cron authentication error', { error, pathname });
    
    return new NextResponse(
      JSON.stringify({
        error: 'Authentication failed',
        code: 500,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      }
    );
  }
};

/**
 * Production-grade security middleware with defense-in-depth protection
 * 
 * Security Controls Implemented:
 * 1. IP allowlisting for cron endpoints (Cloudflare Workers/Vercel + custom IPs)
 * 2. HMAC-SHA256 request signature validation with timestamp verification
 * 3. API key authentication as fallback security layer
 * 4. Rate limiting with circuit breaker pattern and emergency fallback
 * 5. Comprehensive security headers (OWASP recommendations)
 * 6. Suspicious activity detection and blocking
 * 7. Detailed security event logging and audit trails
 * 8. Fail-secure error handling
 * 
 * Threat Model Coverage:
 * - Resource exhaustion attacks (DDoS protection)
 * - Unauthorized cron job triggering (IP + signature validation)
 * - Replay attacks (timestamp-based signature validation)
 * - Financial impact attacks (budget manipulation prevention)
 * - Information disclosure (security headers + access controls)
 * - Injection attacks (input validation + suspicious pattern detection)
 */
const securityMiddleware = async (request: NextRequest): Promise<NextResponse | undefined> => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Route classification for security controls
  let endpointType: 'CRON' | 'HEALTH' | 'PUBLIC' = 'PUBLIC';
  let requiresSecurityValidation = false;

  // Classify endpoint types for appropriate security controls
  if (pathname.startsWith('/api/cron/')) {
    endpointType = 'CRON';
    requiresSecurityValidation = true;
  } else if (pathname.startsWith('/api/health')) {
    endpointType = 'HEALTH';
    // Health endpoints are public for monitoring - they don't expose sensitive data
    requiresSecurityValidation = false;
  } else if (pathname.startsWith('/api/webhooks/')) {
    endpointType = 'PUBLIC';
    // Webhooks verify their own signatures in the handler
    requiresSecurityValidation = false;
  } else if (pathname.startsWith('/api/')) {
    endpointType = 'PUBLIC';
    requiresSecurityValidation = false; // Let Clerk handle authentication for other APIs
  }

  // Apply comprehensive security validation for public endpoints
  if (requiresSecurityValidation) {
    // Check for Vercel deployment protection bypass headers (for Cloudflare Workers)
    const vercelBypass = request.headers.get('x-vercel-protection-bypass');
    const vercelSetCookie = request.headers.get('x-vercel-set-bypass-cookie');
    const cloudflareWorker = request.headers.get('x-cloudflare-worker');
    
    if (vercelBypass && vercelSetCookie && cloudflareWorker && pathname.startsWith('/api/cron/')) {
      middlewareLogger.info('Bypassing middleware security validation for Vercel-protected Cloudflare Worker request', {
        path: pathname,
        cloudflareWorker,
        hasVercelBypass: !!vercelBypass
      });
      return undefined; // Continue without security validation - Vercel already handled protection
    }
    
    // SECURITY CRITICAL: Remove ALL development bypasses for cron endpoints
    // Authentication is ALWAYS required for cron endpoints regardless of environment
    // This prevents accidental deployment with security bypasses enabled
    
    try {
      const securityResult = await MiddlewareSecurity.validateRequest(request, endpointType);
      
      if (!securityResult.allowed) {
        middlewareLogger.warn('Request blocked by security controls', {
          path: pathname,
          reason: securityResult.reason,
          clientIP: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown'
        });

        // Create security-hardened error response
        return new NextResponse(
          JSON.stringify({
            error: 'Access denied',
            code: securityResult.statusCode || 403,
            timestamp: new Date().toISOString(),
            path: pathname
          }),
          {
            status: securityResult.statusCode || 403,
            headers: {
              'Content-Type': 'application/json',
              ...securityResult.responseHeaders,
              // Additional security headers for error responses
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
            }
          }
        );
      }

      // Store security headers for successful responses
      if (securityResult.responseHeaders) {
        // Create a new request with security headers
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-security-validated', 'true');
        requestHeaders.set('x-security-headers', JSON.stringify(securityResult.responseHeaders));
        
        return NextResponse.next({
          request: {
            headers: requestHeaders
          }
        });
      }

    } catch (error) {
      middlewareLogger.error('Security validation error in middleware', { error, pathname });
      
      // Fail secure - block requests when security validation fails
      await SecurityAuditor.logSecurityEvent('SUSPICIOUS_ACTIVITY', request, {
        error: error instanceof Error ? error.message : 'Unknown error',
        securityValidationFailure: true
      });
      
      return new NextResponse(
        JSON.stringify({
          error: 'Security validation failed',
          code: 500,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          }
        }
      );
    }
  }

  return undefined; // Continue to Clerk middleware
};

/**
 * Secure cookie management utility for A/B testing
 * Implements defense-in-depth security controls:
 * 1. Environment-specific secure settings
 * 2. Domain validation and sanitization
 * 3. HMAC-based cookie integrity validation
 * 4. Proper expiration and cleanup mechanisms
 */
class SecureCookieManager {
  private static readonly COOKIE_SECRET = process.env.COOKIE_SECRET;
  private static readonly COOKIE_NAME = 'ab_variant';
  private static readonly INTEGRITY_SUFFIX = '_sig';
  
  /**
   * Environment-specific cookie configuration
   */
  private static getCookieConfig(url: URL) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Validate and sanitize domain
    const hostname = url.hostname;
    let domain: string | undefined;
    
    if (isProduction) {
      // Only set domain for production with validated domains
      const allowedDomains = ['tldrsec.app', 'www.tldrsec.app'];
      if (allowedDomains.includes(hostname)) {
        domain = hostname;
      } else {
        middlewareLogger.warn('Invalid domain for production cookie', { hostname });
        // Fail secure - don't set domain for unknown hosts
      }
    }
    
    return {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: isProduction, // Only secure in production
      sameSite: isProduction ? 'strict' as const : 'lax' as const, // Strict for production
      domain,
      path: '/', // Explicitly set path for security
    };
  }
  
  /**
   * Generate HMAC signature for cookie integrity validation
   */
  private static async generateSignature(value: string, timestamp: number): Promise<string> {
    // Fail securely if COOKIE_SECRET is not properly configured
    if (!this.COOKIE_SECRET || this.COOKIE_SECRET.length < 32) {
      middlewareLogger.error('COOKIE_SECRET not properly configured');
      throw new Error('Cookie signature generation failed - server configuration error');
    }
    
    const encoder = new TextEncoder();
    const data = `${value}:${timestamp}`;
    
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.COOKIE_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
      return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      middlewareLogger.error('Failed to generate cookie signature', { error });
      throw new Error('Cookie signature generation failed');
    }
  }
  
  /**
   * Verify cookie integrity using HMAC signature
   */
  private static async verifySignature(value: string, timestamp: number, signature: string): Promise<boolean> {
    // Fail securely if COOKIE_SECRET is not properly configured
    if (!this.COOKIE_SECRET || this.COOKIE_SECRET.length < 32) {
      middlewareLogger.error('COOKIE_SECRET not properly configured during verification');
      return false;
    }
    
    try {
      const expectedSignature = await this.generateSignature(value, timestamp);
      
      // Timing-safe comparison
      const sigBytes = new TextEncoder().encode(signature);
      const expectedBytes = new TextEncoder().encode(expectedSignature);
      
      if (sigBytes.length !== expectedBytes.length) {
        return false;
      }
      
      let isValid = true;
      for (let i = 0; i < sigBytes.length; i++) {
        if (sigBytes[i] !== expectedBytes[i]) {
          isValid = false;
        }
      }
      
      return isValid;
    } catch (error) {
      middlewareLogger.error('Failed to verify cookie signature', { error });
      return false;
    }
  }
  
  /**
   * Set secure cookie with integrity validation
   */
  static async setSecureCookie(response: NextResponse, value: string, url: URL): Promise<void> {
    try {
      const timestamp = Date.now();
      const signature = await this.generateSignature(value, timestamp);
      const cookieValue = `${value}:${timestamp}`;
      const config = this.getCookieConfig(url);
      
      // Set main cookie
      response.cookies.set(this.COOKIE_NAME, cookieValue, config);
      
      // Set integrity signature cookie (httpOnly=false for client validation if needed)
      response.cookies.set(this.COOKIE_NAME + this.INTEGRITY_SUFFIX, signature, {
        ...config,
        httpOnly: false, // Allow client-side access for integrity validation
      });
      
      middlewareLogger.info('Secure A/B test cookie set', { 
        variant: value, 
        domain: config.domain,
        secure: config.secure,
        sameSite: config.sameSite
      });
    } catch (error) {
      middlewareLogger.error('Failed to set secure cookie', { error, value });
      throw error;
    }
  }
  
  /**
   * Get and validate secure cookie
   */
  static async getValidatedCookie(request: NextRequest): Promise<string | null> {
    try {
      const cookieValue = request.cookies.get(this.COOKIE_NAME)?.value;
      const signature = request.cookies.get(this.COOKIE_NAME + this.INTEGRITY_SUFFIX)?.value;
      
      if (!cookieValue || !signature) {
        return null;
      }
      
      // Parse cookie value
      const parts = cookieValue.split(':');
      if (parts.length !== 2) {
        middlewareLogger.warn('Invalid cookie format detected', { cookieValue });
        return null;
      }
      
      const [value, timestampStr] = parts;
      const timestamp = parseInt(timestampStr, 10);
      
      if (isNaN(timestamp)) {
        middlewareLogger.warn('Invalid timestamp in cookie', { timestampStr });
        return null;
      }
      
      // Check expiration (30 days)
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      if (Date.now() - timestamp > maxAge) {
        middlewareLogger.info('Expired cookie detected', { timestamp, age: Date.now() - timestamp });
        return null;
      }
      
      // Verify integrity
      const isValid = await this.verifySignature(value, timestamp, signature);
      if (!isValid) {
        middlewareLogger.warn('Cookie integrity validation failed', { value, signature });
        return null;
      }
      
      // Validate variant value
      if (!['original', 'newsletter'].includes(value)) {
        middlewareLogger.warn('Invalid variant value in cookie', { value });
        return null;
      }
      
      return value;
    } catch (error) {
      middlewareLogger.error('Failed to validate cookie', { error });
      return null;
    }
  }
  
  /**
   * Clear cookies securely
   */
  static clearSecureCookies(response: NextResponse, url: URL): void {
    const config = this.getCookieConfig(url);
    
    // Clear main cookie
    response.cookies.set(this.COOKIE_NAME, '', {
      ...config,
      maxAge: 0, // Immediate expiration
    });
    
    // Clear signature cookie
    response.cookies.set(this.COOKIE_NAME + this.INTEGRITY_SUFFIX, '', {
      ...config,
      maxAge: 0,
      httpOnly: false,
    });
    
    middlewareLogger.info('A/B test cookies cleared', { domain: config.domain });
  }
}

/**
 * Redirect Loop Protection System
 * Implements comprehensive protection against infinite redirects in A/B testing
 */
class RedirectLoopProtection {
  private static readonly MAX_REDIRECTS = 3;
  private static readonly REDIRECT_TIMEOUT_MS = 10000; // 10 seconds
  private static readonly BYPASS_PARAM = 'ab_test';
  private static readonly BYPASS_COOKIE = 'ab_bypass';
  private static readonly LOOP_HEADER = 'x-redirect-count';
  private static readonly TIMESTAMP_HEADER = 'x-redirect-timestamp';
  
  /**
   * Check for redirect loops and patterns
   */
  static checkForLoop(request: NextRequest): { isLoop: boolean; count: number; reason?: string } {
    const startTime = Date.now();
    
    try {
      // Get redirect count from headers (passed through redirects)
      const redirectCountHeader = request.headers.get(this.LOOP_HEADER);
      const redirectTimestampHeader = request.headers.get(this.TIMESTAMP_HEADER);
      
      const redirectCount = redirectCountHeader ? parseInt(redirectCountHeader, 10) : 0;
      const redirectTimestamp = redirectTimestampHeader ? parseInt(redirectTimestampHeader, 10) : 0;
      
      middlewareLogger.info('Checking redirect loop', {
        path: request.nextUrl.pathname,
        redirectCount,
        redirectTimestamp,
        currentTime: Date.now()
      });
      
      let result: { isLoop: boolean; count: number; reason?: string };
      
      // Check maximum redirects
      if (redirectCount >= this.MAX_REDIRECTS) {
        middlewareLogger.warn('Maximum redirects exceeded', {
          count: redirectCount,
          maxAllowed: this.MAX_REDIRECTS,
          path: request.nextUrl.pathname
        });
        
        result = {
          isLoop: true,
          count: redirectCount,
          reason: `Maximum redirects (${this.MAX_REDIRECTS}) exceeded`
        };
        
        // Record loop detection in monitoring
        redirectMonitor.recordLoop(
          request.nextUrl.pathname,
          redirectCount,
          result.reason,
          {
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
            executionTimeMs: Date.now() - startTime
          }
        );
        
        return result;
      }
      
      // Check for rapid successive redirects (potential infinite loop)
      if (redirectTimestamp && Date.now() - redirectTimestamp < 1000) {
        middlewareLogger.warn('Rapid redirect detected', {
          timeDiff: Date.now() - redirectTimestamp,
          path: request.nextUrl.pathname
        });
        
        result = {
          isLoop: true,
          count: redirectCount,
          reason: 'Rapid successive redirects detected'
        };
        
        // Record loop detection in monitoring
        redirectMonitor.recordLoop(
          request.nextUrl.pathname,
          redirectCount,
          result.reason,
          {
            timeDiff: Date.now() - redirectTimestamp,
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
            executionTimeMs: Date.now() - startTime
          }
        );
        
        return result;
      }
      
      // Check for timeout (redirect chain taking too long)
      if (redirectTimestamp && Date.now() - redirectTimestamp > this.REDIRECT_TIMEOUT_MS) {
        middlewareLogger.warn('Redirect timeout exceeded', {
          timeDiff: Date.now() - redirectTimestamp,
          timeout: this.REDIRECT_TIMEOUT_MS,
          path: request.nextUrl.pathname
        });
        
        result = {
          isLoop: true,
          count: redirectCount,
          reason: 'Redirect timeout exceeded'
        };
        
        // Record loop detection in monitoring
        redirectMonitor.recordLoop(
          request.nextUrl.pathname,
          redirectCount,
          result.reason,
          {
            timeDiff: Date.now() - redirectTimestamp,
            timeout: this.REDIRECT_TIMEOUT_MS,
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
            executionTimeMs: Date.now() - startTime
          }
        );
        
        return result;
      }
      
      // Record successful check performance
      redirectMonitor.recordPerformance(
        request.nextUrl.pathname,
        Date.now() - startTime,
        {
          redirectCount,
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
        }
      );
      
      return { isLoop: false, count: redirectCount };
    } catch (error) {
      middlewareLogger.error('Error checking redirect loop', { error, path: request.nextUrl.pathname });
      
      // Record error in monitoring
      redirectMonitor.recordLoop(
        request.nextUrl.pathname,
        0,
        'Error in loop detection',
        {
          error: error instanceof Error ? error.message : String(error),
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          executionTimeMs: Date.now() - startTime
        }
      );
      
      // Fail safe - assume loop to prevent infinite redirects
      return {
        isLoop: true,
        count: 0,
        reason: 'Error in loop detection'
      };
    }
  }
  
  /**
   * Check if A/B testing should be bypassed
   */
  static shouldBypass(request: NextRequest): boolean {
    try {
      const url = new URL(request.url);
      
      // URL parameter bypass
      const bypassParam = url.searchParams.get(this.BYPASS_PARAM);
      if (bypassParam === 'false' || bypassParam === 'off') {
        middlewareLogger.info('A/B testing bypassed via URL parameter', {
          path: url.pathname,
          bypassParam
        });
        
        // Record bypass usage
        redirectMonitor.recordBypass(
          url.pathname,
          'URL parameter bypass',
          {
            bypassParam,
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
          }
        );
        
        return true;
      }
      
      // Cookie-based bypass
      const bypassCookie = request.cookies.get(this.BYPASS_COOKIE)?.value;
      if (bypassCookie === 'true') {
        middlewareLogger.info('A/B testing bypassed via cookie', {
          path: url.pathname
        });
        
        // Record bypass usage
        redirectMonitor.recordBypass(
          url.pathname,
          'Cookie bypass',
          {
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
          }
        );
        
        return true;
      }
      
      // Environment-based circuit breaker
      const circuitBreakerOpen = process.env.AB_TEST_CIRCUIT_BREAKER === 'true';
      if (circuitBreakerOpen) {
        middlewareLogger.warn('A/B testing disabled via circuit breaker', {
          path: url.pathname
        });
        
        // Record bypass usage
        redirectMonitor.recordBypass(
          url.pathname,
          'Circuit breaker bypass',
          {
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
          }
        );
        
        return true;
      }
      
      // Emergency override for specific paths
      const emergencyOverride = process.env.AB_TEST_EMERGENCY_DISABLE;
      if (emergencyOverride === 'true' || emergencyOverride === url.pathname) {
        middlewareLogger.warn('A/B testing disabled via emergency override', {
          path: url.pathname,
          emergencyOverride
        });
        
        // Record bypass usage
        redirectMonitor.recordBypass(
          url.pathname,
          'Emergency override bypass',
          {
            emergencyOverride,
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
          }
        );
        
        return true;
      }
      
      return false;
    } catch (error) {
      middlewareLogger.error('Error checking bypass conditions', { error });
      
      // Record error bypass
      redirectMonitor.recordBypass(
        request.nextUrl.pathname,
        'Error bypass',
        {
          error: error instanceof Error ? error.message : String(error),
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
        }
      );
      
      // Fail safe - bypass on error
      return true;
    }
  }
  
  /**
   * Validate that a redirect target exists and is accessible
   */
  static async validateRedirectTarget(targetPath: string, request: NextRequest): Promise<boolean> {
    try {
      // Define valid targets based on actual route existence
      const validTargets = ['/newsletter', '/dashboard', '/', '/pricing'];
      
      // Define explicitly invalid targets (if any)
      const invalidTargets: string[] = [];
      
      const isValid = validTargets.includes(targetPath) && !invalidTargets.includes(targetPath);
      
      middlewareLogger.info('Validating redirect target', {
        targetPath,
        isValid,
        validTargets,
        invalidTargets,
        reason: !isValid ? (invalidTargets.includes(targetPath) ? 'Target explicitly invalid' : 'Target not in valid list') : 'Valid'
      });
      
      // Record invalid target detection
      if (!isValid) {
        redirectMonitor.recordInvalidTarget(
          request.nextUrl.pathname,
          targetPath,
          {
            validTargets,
            invalidTargets,
            reason: invalidTargets.includes(targetPath) ? 'Target explicitly invalid' : 'Target not in valid list',
            userAgent: request.headers.get('user-agent'),
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
          }
        );
      }
      
      return isValid;
    } catch (error) {
      middlewareLogger.error('Error validating redirect target', { error, targetPath });
      
      // Record invalid target due to error
      redirectMonitor.recordInvalidTarget(
        request.nextUrl.pathname,
        targetPath,
        {
          error: error instanceof Error ? error.message : String(error),
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
        }
      );
      
      return false;
    }
  }
  
  /**
   * Create a protected redirect with loop tracking
   */
  static createProtectedRedirect(targetUrl: string, request: NextRequest): NextResponse {
    try {
      const currentCount = parseInt(request.headers.get(this.LOOP_HEADER) || '0', 10);
      const newCount = currentCount + 1;
      const timestamp = Date.now();
      
      middlewareLogger.info('Creating protected redirect', {
        from: request.nextUrl.pathname,
        to: targetUrl,
        redirectCount: newCount,
        timestamp
      });
      
      const redirectResponse = NextResponse.redirect(new URL(targetUrl, request.url));
      
      // Add tracking headers for the redirected request
      redirectResponse.headers.set(this.LOOP_HEADER, newCount.toString());
      redirectResponse.headers.set(this.TIMESTAMP_HEADER, timestamp.toString());
      
      // Add cache control to prevent redirect caching
      redirectResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      redirectResponse.headers.set('Pragma', 'no-cache');
      redirectResponse.headers.set('Expires', '0');
      
      return redirectResponse;
    } catch (error) {
      middlewareLogger.error('Error creating protected redirect', { error, targetUrl });
      // Fallback - return next response
      return NextResponse.next();
    }
  }
  
  /**
   * Set bypass cookie for emergency situations
   */
  static setBypassCookie(response: NextResponse, duration: number = 3600): void {
    try {
      response.cookies.set(this.BYPASS_COOKIE, 'true', {
        maxAge: duration, // Default 1 hour
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
      });
      
      middlewareLogger.info('Set A/B testing bypass cookie', { duration });
    } catch (error) {
      middlewareLogger.error('Failed to set bypass cookie', { error });
    }
  }
  
  /**
   * Create fallback response when redirects fail
   */
  static createFallbackResponse(request: NextRequest, reason: string): NextResponse {
    try {
      middlewareLogger.warn('Creating fallback response', {
        path: request.nextUrl.pathname,
        reason
      });
      
      const response = NextResponse.next();
      
      // Set bypass cookie to prevent future redirect attempts
      this.setBypassCookie(response, 1800); // 30 minutes
      
      // Add diagnostic headers
      response.headers.set('X-AB-Test-Status', 'bypassed');
      response.headers.set('X-AB-Test-Reason', reason);
      
      return response;
    } catch (error) {
      middlewareLogger.error('Error creating fallback response', { error, reason });
      return NextResponse.next();
    }
  }
}

/**
 * A/B testing middleware for landing page variants with enhanced security and redirect loop protection
 * 
 * Security Features:
 * 1. Environment-specific secure cookie settings
 * 2. Domain validation and sanitization
 * 3. HMAC-based cookie integrity validation
 * 4. Proper cookie expiration and cleanup
 * 5. Input validation and sanitization
 * 6. Secure error handling
 * 7. Comprehensive redirect loop protection
 * 8. Emergency bypass mechanisms
 * 9. Redirect target validation
 */
const abTestingMiddleware = async (request: NextRequest): Promise<NextResponse | undefined> => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Only apply A/B testing to homepage
  if (pathname !== '/') {
    return undefined;
  }
  
  try {
    // Check for bypass conditions first
    if (RedirectLoopProtection.shouldBypass(request)) {
      middlewareLogger.info('A/B testing bypassed', { path: pathname });
      const response = NextResponse.next();
      response.headers.set('X-AB-Test-Status', 'bypassed');
      return response;
    }
    
    // Check for redirect loops before processing
    const loopCheck = RedirectLoopProtection.checkForLoop(request);
    if (loopCheck.isLoop) {
      middlewareLogger.warn('Redirect loop detected, falling back', {
        path: pathname,
        reason: loopCheck.reason,
        count: loopCheck.count
      });
      
      // Clear problematic cookies and create fallback response
      const fallbackResponse = RedirectLoopProtection.createFallbackResponse(
        request,
        loopCheck.reason || 'Redirect loop detected'
      );
      SecureCookieManager.clearSecureCookies(fallbackResponse, url);
      
      return fallbackResponse;
    }
    
    const response = NextResponse.next();
    
    // Check if user has existing validated variant preference
    let variant = await SecureCookieManager.getValidatedCookie(request);
    
    if (!variant) {
      // Generate new variant with cryptographically secure randomness
      const randomBytes = new Uint8Array(1);
      crypto.getRandomValues(randomBytes);
      variant = (randomBytes[0] / 255) < 0.5 ? 'original' : 'newsletter';
      
      // Set secure cookie with integrity validation
      await SecureCookieManager.setSecureCookie(response, variant, url);
    }
    
    // Track page view for analytics (fire and forget)
    trackPageView(request, variant).catch(error => {
      middlewareLogger.warn('Failed to track page view for A/B test', { error, variant });
    });
    
    // Handle newsletter variant with protection
    if (variant === 'newsletter') {
      const targetPath = '/newsletter';
      
      // Validate redirect target exists
      const isTargetValid = await RedirectLoopProtection.validateRedirectTarget(targetPath, request);
      
      if (!isTargetValid) {
        middlewareLogger.warn('Invalid redirect target, falling back to original', {
          targetPath,
          originalPath: pathname
        });
        
        // Clear the newsletter variant and force original variant
        await SecureCookieManager.setSecureCookie(response, 'original', url);
        
        // Add diagnostic headers
        response.headers.set('X-AB-Test-Status', 'fallback-invalid-target');
        response.headers.set('X-AB-Test-Original-Variant', 'newsletter');
        
        return response;
      }
      
      // Create protected redirect with loop tracking
      return RedirectLoopProtection.createProtectedRedirect(targetPath, request);
    }
    
    // Add success headers for monitoring
    response.headers.set('X-AB-Test-Status', 'success');
    response.headers.set('X-AB-Test-Variant', variant);
    
    return response;
  } catch (error) {
    middlewareLogger.error('A/B testing middleware error', { error, pathname });
    
    // Enhanced error recovery with redirect protection
    try {
      const fallbackResponse = RedirectLoopProtection.createFallbackResponse(
        request,
        'Middleware error recovery'
      );
      SecureCookieManager.clearSecureCookies(fallbackResponse, url);
      
      return fallbackResponse;
    } catch (clearError) {
      middlewareLogger.error('Failed to clear cookies during error recovery', { clearError });
      
      // Final fallback - continue without cookie management
      const finalResponse = NextResponse.next();
      finalResponse.headers.set('X-AB-Test-Status', 'error-recovery-failed');
      return finalResponse;
    }
  }
};

async function trackPageView(req: NextRequest, variant: string) {
  // Queue analytics tracking (don't block request)
  // This is a fire-and-forget operation for performance
  try {
    // Extract UTM parameters and basic info for analytics
    const url = new URL(req.url);
    const utmSource = url.searchParams.get('utm_source');
    const utmMedium = url.searchParams.get('utm_medium');
    const utmCampaign = url.searchParams.get('utm_campaign');
    
    // In a real implementation, you might queue this to a background job
    // For now, we'll just log it
    middlewareLogger.info('A/B test page view tracked', {
      variant,
      utmSource,
      utmMedium,
      utmCampaign,
      userAgent: req.headers.get('user-agent')?.substring(0, 100),
      referrer: req.headers.get('referer')?.substring(0, 100)
    });
  } catch (error) {
    // Silently fail - don't affect user experience
    middlewareLogger.warn('Page view tracking failed', { error });
  }
}

/**
 * Conditional middleware architecture
 * Processes cron requests independently before Clerk middleware
 */
export default async function middleware(request: NextRequest) {
  // First: Handle cron authentication independently
  const cronResponse = await cronAuthMiddleware(request);
  if (cronResponse) {
    // Cron middleware handled the request (either auth failed or succeeded with headers)
    return cronResponse;
  }
  
  // Second: Handle A/B testing for homepage
  const abTestResponse = await abTestingMiddleware(request);
  if (abTestResponse) {
    return abTestResponse;
  }
  
  // For all other requests: Use Clerk middleware with security middleware
  return clerkMiddleware(
    async (auth, request: NextRequest) => {
      const { userId, sessionClaims } = await auth();
      const pathname = request.nextUrl.pathname;

      // === Auth-First Onboarding Redirects ===

      // Handle /onboarding route
      if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) {
        if (!userId) {
          // Unauthenticated user trying to access onboarding → Sign Up
          const signUpUrl = new URL('/sign-up', request.url);
          return NextResponse.redirect(signUpUrl);
        }

        // Check onboarding status from Clerk publicMetadata
        const isOnboarded = (sessionClaims?.publicMetadata as { onboardingCompleted?: boolean })?.onboardingCompleted === true;

        if (isOnboarded) {
          // Already onboarded → Dashboard
          const dashboardUrl = new URL('/dashboard', request.url);
          return NextResponse.redirect(dashboardUrl);
        }
        // Allow through to onboarding page
      }

      // Protect /dashboard from non-onboarded users
      if (pathname.startsWith('/dashboard') && userId) {
        const isOnboarded = (sessionClaims?.publicMetadata as { onboardingCompleted?: boolean })?.onboardingCompleted === true;

        if (!isOnboarded) {
          // Not onboarded → Onboarding
          const onboardingUrl = new URL('/onboarding', request.url);
          return NextResponse.redirect(onboardingUrl);
        }
      }

      // === End Auth-First Onboarding Redirects ===

      // Apply our security middleware for non-cron endpoints
      const securityResponse = await securityMiddleware(request);
      if (securityResponse) {
        return securityResponse;
      }

      // Continue with default Clerk processing
      return;
    },
    {
      publicRoutes: [
        // Health endpoints (rate-limited by our middleware)
        '/api/health',
        '/api/health/database',
        '/api/health/liveness',
        '/api/health/readiness',
        '/api/health/optimized',
        '/api/health/cloudflare-worker',
        '/api/health/deployment',
        '/api/debug/sec-connectivity',

        // Webhooks (signature-verified in handler)
        '/api/webhooks/vercel-deployment',
        
        // Cron endpoints (we handle auth ourselves)
        '/api/cron/tier-aware',
        '/api/cron/tier-aware-optimized',
        '/api/cron/tier-aware-async',
        '/api/cron/microservices',
        '/api/cron/process-jobs',
        '/api/cron/unified',
        '/api/cron/queue-status', // Public monitoring endpoint
        
        // Marketing pages
        '/',
        '/newsletter',
        '/pricing',
        '/about',
        '/privacy',
        '/terms'

        // Note: /onboarding is now PROTECTED (auth-first flow)
        // Unauthenticated users are redirected to /sign-up
      ]
    }
  )(request);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}