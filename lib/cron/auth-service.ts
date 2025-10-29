/**
 * Authentication and security service for cron endpoints
 * Enhanced with HMAC-based cryptographic authentication
 */

import { NextRequest } from 'next/server';
import { logger } from '../logging';
import { validateCronRequestHmac } from '../security/hmac-auth';
import type { AuthValidationResult, AuthHeaders } from './types';

const authLogger = logger.child('cron-auth');

export class CronAuthService {
  /**
   * Validate cron request authentication with HMAC cryptographic verification
   */
  static async validateCronRequest(request: NextRequest): Promise<AuthValidationResult> {
    try {
      // Check if middleware already validated auth (production requests have special header)
      const middlewareValidated = request.headers.get('x-security-validated') === 'true';
      
      if (middlewareValidated) {
        authLogger.debug('Auth validation already handled by middleware.ts');
        return { isValid: true };
      }

      const clientIP = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';

      // Step 1: HMAC Signature Validation (replaces header-based auth)
      authLogger.debug('Validating HMAC signature for cron request', {
        method: request.method,
        path: new URL(request.url).pathname,
        clientIP
      });

      const hmacValidation = validateCronRequestHmac(request);
      if (!hmacValidation.isValid) {
        authLogger.warn('HMAC signature validation failed', {
          error: hmacValidation.error,
          clientIP,
          timestamp: hmacValidation.timestamp,
          skew: hmacValidation.skew
        });
        return { 
          isValid: false, 
          error: hmacValidation.error || 'HMAC authentication failed',
          clientIP 
        };
      }

      authLogger.info('HMAC signature validated successfully', {
        clientIP,
        timestamp: hmacValidation.timestamp,
        skew: hmacValidation.skew
      });

      // Step 2: IP allowlist validation (optional additional security)
      const ipValidation = this.validateIPAllowlist(clientIP);
      if (!ipValidation.isValid) {
        return { ...ipValidation, clientIP };
      }

      // Step 3: Rate limiting for direct calls
      const rateLimitValidation = await this.validateRateLimit(clientIP);
      if (!rateLimitValidation.isValid) {
        return { ...rateLimitValidation, clientIP };
      }

      return { 
        isValid: true, 
        clientIP,
        hmacValidated: true,
        timestamp: hmacValidation.timestamp,
        skew: hmacValidation.skew
      };

    } catch (error) {
      authLogger.error('Authentication validation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method
      });
      return {
        isValid: false,
        error: 'Authentication validation error',
        clientIP: 'unknown'
      };
    }
  }

  /**
   * Validate CRON_SECRET with timing-safe comparison
   */
  private static validateCronSecret(authHeaders: AuthHeaders): AuthValidationResult {
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      authLogger.error('CRON_SECRET not configured');
      return {
        isValid: false,
        error: 'Authentication not properly configured'
      };
    }

    if (cronSecret.length < 32) {
      authLogger.error('CRON_SECRET not properly configured - insufficient length');
      return {
        isValid: false,
        error: 'Authentication not properly configured'
      };
    }

    // Check both Authorization and X-Cron-Auth headers
    const authHeader = authHeaders.authorization || authHeaders['x-cron-auth'];
    
    if (!authHeader) {
      authLogger.warn('Missing authorization header');
      return {
        isValid: false,
        error: 'Missing Authorization header'
      };
    }

    if (!authHeader.startsWith('Bearer ')) {
      authLogger.warn('Invalid authorization header format');
      return {
        isValid: false,
        error: 'Invalid authorization header format'
      };
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    
    // Use timing-safe comparison to prevent timing attacks
    const isValidToken = this.timingSafeEqual(token, cronSecret);
    
    if (!isValidToken) {
      authLogger.warn('Invalid authorization token');
      return {
        isValid: false,
        error: 'Invalid authorization token'
      };
    }

    return { isValid: true };
  }

  /**
   * Validate IP allowlist if configured
   */
  private static validateIPAllowlist(clientIP: string): AuthValidationResult {
    const allowedIPs = process.env.CRON_ALLOWED_IPS;
    
    if (!allowedIPs) {
      // No IP allowlist configured, allow all IPs
      return { isValid: true };
    }

    const allowedIPList = allowedIPs.split(',').map(ip => ip.trim());
    
    if (!allowedIPList.includes(clientIP)) {
      authLogger.warn('IP not in allowlist', { clientIP, allowedIPs: allowedIPList });
      return {
        isValid: false,
        error: 'IP not allowed'
      };
    }

    return { isValid: true };
  }

  /**
   * Validate rate limiting for direct calls
   */
  private static async validateRateLimit(clientIP: string): Promise<AuthValidationResult> {
    try {
      // Dynamic import to avoid build-time dependencies
      const { rateLimiter } = await import('../security/rate-limiter');
      const rateLimitResult = await rateLimiter.checkLimit('cron-endpoint', clientIP);
      
      if (!rateLimitResult || !rateLimitResult.allowed) {
        authLogger.warn('Rate limit exceeded', { clientIP, rateLimitResult });
        return {
          isValid: false,
          error: 'Rate limit exceeded'
        };
      }

      return { isValid: true };
    } catch (error) {
      authLogger.error('Rate limit validation failed', { error, clientIP });
      // Don't fail auth if rate limiter has issues
      return { isValid: true };
    }
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private static timingSafeEqual(a: string, b: string): boolean {
    const encoder = new TextEncoder();
    const aBytes = encoder.encode(a);
    const bBytes = encoder.encode(b);
    
    // Compare lengths first
    let isValid = aBytes.length === bBytes.length;
    
    // Always compare full length to prevent timing attacks
    const maxLength = Math.max(aBytes.length, bBytes.length);
    for (let i = 0; i < maxLength; i++) {
      const aByte = i < aBytes.length ? aBytes[i] : 0;
      const bByte = i < bBytes.length ? bBytes[i] : 0;
      if (aByte !== bByte) {
        isValid = false;
      }
    }
    
    return isValid;
  }

  /**
   * Detect platform based on environment variables
   */
  static detectPlatform(): 'RAILWAY_CRON' | 'VERCEL_CRON' | 'MANUAL_TRIGGER' {
    if (process.env.RAILWAY_ENVIRONMENT) {
      return 'MANUAL_TRIGGER';
    }
    return 'VERCEL_CRON';
  }

  /**
   * Extract client IP with fallback chain
   */
  static extractClientIP(request: NextRequest): string {
    return (
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.ip ||
      'unknown'
    );
  }

  /**
   * Validate environment configuration for cron authentication
   */
  static validateEnvironmentConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      errors.push('CRON_SECRET environment variable not configured');
    } else if (cronSecret.length < 32) {
      errors.push('CRON_SECRET must be at least 32 characters long');
    }

    const allowedIPs = process.env.CRON_ALLOWED_IPS;
    if (allowedIPs) {
      const ipList = allowedIPs.split(',').map(ip => ip.trim());
      const invalidIPs = ipList.filter(ip => !this.isValidIP(ip));
      if (invalidIPs.length > 0) {
        errors.push(`Invalid IP addresses in CRON_ALLOWED_IPS: ${invalidIPs.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Basic IP address validation
   */
  private static isValidIP(ip: string): boolean {
    // Basic IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // Basic IPv6 validation (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === 'localhost' || ip === '127.0.0.1';
  }
}