/**
 * Security Headers Utility
 * 
 * Provides consistent security headers across all API endpoints
 * Implements defense-in-depth security measures
 */

/**
 * Standard security headers for API endpoints
 * Based on OWASP recommendations and security best practices
 */
export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent page embedding in frames (clickjacking protection)
  'X-Frame-Options': 'DENY',
  
  // Enable XSS protection in browsers
  'X-XSS-Protection': '1; mode=block',
  
  // Control referrer information
  'Referrer-Policy': 'no-referrer',
  
  // Content Security Policy - strict for API endpoints
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  
  // Prevent caching of sensitive data
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  
  // Additional security headers
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-Download-Options': 'noopen'
} as const;

/**
 * Cron-specific security headers
 * Includes additional headers for internal API endpoints
 */
export const CRON_SECURITY_HEADERS = {
  ...SECURITY_HEADERS,
  
  // Additional headers for cron endpoints
  'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
  'X-API-Type': 'internal-cron'
} as const;

/**
 * Apply security headers to a NextResponse
 */
export function addSecurityHeaders(response: Response, additionalHeaders?: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  
  // Add security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Add any additional headers
  if (additionalHeaders) {
    Object.entries(additionalHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Create a secure JSON response with security headers
 */
export function createSecureResponse(
  data: unknown, 
  status: number = 200,
  additionalHeaders?: Record<string, string>
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
    ...additionalHeaders
  });
  
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

/**
 * Create a secure cron response with cron-specific security headers
 */
export function createSecureCronResponse(
  data: unknown,
  status: number = 200,
  additionalHeaders?: Record<string, string>
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...CRON_SECURITY_HEADERS,
    ...additionalHeaders
  });
  
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}