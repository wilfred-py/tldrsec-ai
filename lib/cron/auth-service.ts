/**
 * Authentication service for cron endpoints — behind the one-method
 * interface production actually calls (validateCronRequest). The former
 * fanned-out surface (detectPlatform, extractClientIP,
 * validateEnvironmentConfig, validateCronSecret, isValidIP,
 * timingSafeEqual) was exported for hypothetical seams that never
 * shipped: nothing in production reads the platform, extracts the IP
 * outside of validateCronRequest itself, validates the environment
 * config at import time, or holds a bearer-token authentication path
 * (HMAC replaced it). Their tests asserted on those method surfaces
 * directly — past the interface, not through it.
 */

import { NextRequest } from 'next/server';
import { logger } from '../logging';
import { validateCronRequestHmac } from '../security/hmac-auth';
import type { AuthValidationResult } from './types';

const authLogger = logger.child('cron-auth');

export class CronAuthService {
  /**
   * Validate cron request authentication with HMAC cryptographic verification.
   *
   * Layered gates, short-circuiting in order:
   *   1. `x-security-validated: true` — middleware.ts already authenticated.
   *   2. `x-vercel-cron: 1|true` — Vercel internal cron trigger.
   *   3. HMAC signature (Cloudflare Worker requests).
   *   4. IP allowlist (`CRON_ALLOWED_IPS`, optional).
   *   5. Rate limit (`cron-endpoint`).
   *
   * Every gate is failsafe-off: any thrown error resolves to
   * `{ isValid: false, error: 'Authentication validation error' }`.
   */
  static async validateCronRequest(request: NextRequest): Promise<AuthValidationResult> {
    try {
      const clientIP = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';

      // Step 1: Check if middleware already validated auth (production requests have special header)
      const middlewareValidated = request.headers.get('x-security-validated') === 'true';

      if (middlewareValidated) {
        authLogger.debug('Auth validation already handled by middleware.ts');
        return { isValid: true, clientIP };
      }

      // Step 2: Check for Vercel Cron internal authentication (highest priority)
      const vercelCronHeader = request.headers.get('x-vercel-cron');
      if (vercelCronHeader === '1' || vercelCronHeader === 'true') {
        authLogger.info('Vercel internal cron authentication detected', {
          clientIP,
          method: request.method,
          path: new URL(request.url).pathname
        });
        return {
          isValid: true,
          clientIP,
          vercelCron: true
        };
      }

      // Step 3: HMAC Signature Validation (for Cloudflare Worker requests)
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

      // Step 4: IP allowlist validation (optional additional security)
      const ipValidation = this.validateIPAllowlist(clientIP);
      if (!ipValidation.isValid) {
        return { ...ipValidation, clientIP };
      }

      // Step 5: Rate limiting for direct calls
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

  private static validateIPAllowlist(clientIP: string): AuthValidationResult {
    const allowedIPs = process.env.CRON_ALLOWED_IPS;

    if (!allowedIPs) {
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

  private static async validateRateLimit(clientIP: string): Promise<AuthValidationResult> {
    try {
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
}
