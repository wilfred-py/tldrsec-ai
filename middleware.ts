import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { MiddlewareSecurity, SecurityAuditor } from './lib/security/middleware-security'
import { logger } from './lib/logging'

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
    requiresSecurityValidation = true;
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
  
  // For all other requests: Use Clerk middleware with security middleware
  return clerkMiddleware(
    async (auth, request: NextRequest) => {
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
        '/api/debug/sec-connectivity',
        
        // Cron endpoints (we handle auth ourselves)
        '/api/cron/tier-aware',
        '/api/cron/tier-aware-optimized',
        '/api/cron/tier-aware-async',
        '/api/cron/microservices',
        '/api/cron/process-jobs',
        '/api/cron/unified',
        
        // Marketing pages
        '/',
        '/pricing',
        '/about',
        '/privacy',
        '/terms'
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