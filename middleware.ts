import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { MiddlewareSecurity, SecurityAuditor } from './lib/security/middleware-security'
import { logger } from './lib/logging'

const middlewareLogger = logger.child('security-middleware');

/**
 * Production-grade security middleware with defense-in-depth protection
 * 
 * Security Controls Implemented:
 * 1. IP allowlisting for cron endpoints (Railway/Vercel + custom IPs)
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
    requiresSecurityValidation = true;
  } else if (pathname.startsWith('/api/')) {
    endpointType = 'PUBLIC';
    requiresSecurityValidation = false; // Let Clerk handle authentication for other APIs
  }

  // Apply comprehensive security validation for public endpoints
  if (requiresSecurityValidation) {
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

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    // First apply our security middleware
    const securityResponse = await securityMiddleware(request);
    if (securityResponse) {
      return securityResponse;
    }
    
    // Continue with default Clerk processing
    return;
  },
  {
    publicRoutes: [
      // Cron endpoints (secured by our middleware security validation)
      '/api/cron/tier-aware',
      '/api/cron/unified',
      '/api/cron/monitor-sec-filings', // Add other cron endpoints
      
      // Health endpoints (rate-limited by our middleware)
      '/api/health',
      '/api/health/database',
      '/api/health/liveness',
      '/api/health/readiness',
      '/api/health/optimized',
      
      // Marketing pages
      '/',
      '/pricing',
      '/about',
      '/privacy',
      '/terms'
    ]
  }
)

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}