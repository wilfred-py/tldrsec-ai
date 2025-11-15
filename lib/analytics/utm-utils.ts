/**
 * Utility functions for safely handling UTM parameters
 * Prevents XSS, parameter pollution, and data injection
 */

/**
 * Sanitizes UTM parameter values to prevent security vulnerabilities
 * - Removes HTML tags to prevent XSS
 * - Limits length to prevent buffer overflow
 * - Allows only safe characters (alphanumeric, hyphens, underscores, dots)
 */
export function sanitizeUTMParam(param: string | null): string | undefined {
  if (!param) return undefined;
  
  // Remove HTML tags to prevent XSS
  const stripped = param.replace(/<[^>]*>/g, '');
  
  // Limit length to prevent excessive data
  const limited = stripped.substring(0, 100);
  
  // Allow only safe characters: alphanumeric, hyphens, underscores, dots
  const sanitized = limited.replace(/[^\w\-_.]/g, '');
  
  // Return undefined for empty strings after sanitization
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Safely extracts and sanitizes UTM parameters from URL search params
 */
export function getUTMParams(searchParams?: URLSearchParams | null) {
  if (!searchParams) {
    // Safely get search params on client side
    if (typeof window !== 'undefined') {
      searchParams = new URLSearchParams(window.location.search);
    } else {
      return {};
    }
  }

  return {
    utm_source: sanitizeUTMParam(searchParams.get('utm_source')),
    utm_medium: sanitizeUTMParam(searchParams.get('utm_medium')),
    utm_campaign: sanitizeUTMParam(searchParams.get('utm_campaign')),
    utm_term: sanitizeUTMParam(searchParams.get('utm_term')),
    utm_content: sanitizeUTMParam(searchParams.get('utm_content')),
  };
}

/**
 * Type definition for sanitized UTM parameters
 */
export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}