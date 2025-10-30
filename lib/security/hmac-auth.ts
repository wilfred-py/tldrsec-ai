/**
 * HMAC-based Authentication for Cron Requests
 * 
 * Provides cryptographic authentication that prevents header spoofing
 * and ensures request integrity between Cloudflare Worker and Vercel.
 * 
 * Security Features:
 * - HMAC-SHA256 signature verification
 * - Timestamp-based replay attack prevention
 * - Request integrity validation (method, path, timestamp)
 * - Configurable time skew tolerance
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { logger } from '../logging';

const hmacLogger = logger.child('hmac-auth');

export interface HmacAuthResult {
  isValid: boolean;
  error?: string;
  timestamp?: number;
  skew?: number;
}

export interface SignatureComponents {
  timestamp: number;
  method: string;
  path: string;
  signature: string;
}

export class HmacAuthService {
  private static readonly MAX_TIME_SKEW_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly SIGNATURE_HEADER = 'x-hmac-signature';
  private static readonly TIMESTAMP_HEADER = 'x-hmac-timestamp';

  /**
   * Generate HMAC signature for outgoing requests (Cloudflare Worker)
   */
  static generateSignature(
    secret: string,
    method: string,
    path: string,
    timestamp?: number
  ): { signature: string; timestamp: number } {
    const ts = timestamp || Date.now();
    const payload = `${ts}:${method.toUpperCase()}:${path}`;
    
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');
    
    hmacLogger.debug('Generated HMAC signature', {
      method,
      path,
      timestamp: ts,
      payloadLength: payload.length
    });
    
    return { signature, timestamp: ts };
  }

  /**
   * Verify HMAC signature for incoming requests (Vercel endpoint)
   */
  static verifySignature(
    secret: string,
    signature: string,
    timestamp: number,
    method: string,
    path: string
  ): HmacAuthResult {
    try {
      // Validate timestamp is not too old or too far in future
      const now = Date.now();
      const skew = Math.abs(now - timestamp);
      
      if (skew > this.MAX_TIME_SKEW_MS) {
        hmacLogger.warn('HMAC timestamp skew too large', {
          skew,
          maxSkew: this.MAX_TIME_SKEW_MS,
          timestamp,
          now
        });
        return {
          isValid: false,
          error: `Timestamp skew too large: ${skew}ms (max: ${this.MAX_TIME_SKEW_MS}ms)`,
          timestamp,
          skew
        };
      }

      // Generate expected signature
      const payload = `${timestamp}:${method.toUpperCase()}:${path}`;
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (signatureBuffer.length !== expectedBuffer.length) {
        hmacLogger.warn('HMAC signature length mismatch', {
          receivedLength: signatureBuffer.length,
          expectedLength: expectedBuffer.length
        });
        return {
          isValid: false,
          error: 'Invalid signature format',
          timestamp,
          skew
        };
      }

      const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

      if (!isValid) {
        hmacLogger.warn('HMAC signature verification failed', {
          method,
          path,
          timestamp,
          skew,
          payloadLength: payload.length
        });
        return {
          isValid: false,
          error: 'Signature verification failed',
          timestamp,
          skew
        };
      }

      hmacLogger.debug('HMAC signature verified successfully', {
        method,
        path,
        timestamp,
        skew
      });

      return {
        isValid: true,
        timestamp,
        skew
      };
    } catch (error) {
      hmacLogger.error('HMAC verification error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        method,
        path,
        timestamp
      });
      return {
        isValid: false,
        error: 'HMAC verification error',
        timestamp
      };
    }
  }

  /**
   * Extract and validate HMAC components from NextRequest
   */
  static validateRequestHmac(request: NextRequest, secret: string): HmacAuthResult {
    try {
      const signature = request.headers.get(this.SIGNATURE_HEADER);
      const timestampHeader = request.headers.get(this.TIMESTAMP_HEADER);

      if (!signature) {
        return {
          isValid: false,
          error: `Missing ${this.SIGNATURE_HEADER} header`
        };
      }

      if (!timestampHeader) {
        return {
          isValid: false,
          error: `Missing ${this.TIMESTAMP_HEADER} header`
        };
      }

      const timestamp = parseInt(timestampHeader);
      if (isNaN(timestamp) || timestamp <= 0) {
        return {
          isValid: false,
          error: 'Invalid timestamp format'
        };
      }

      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname;

      return this.verifySignature(secret, signature, timestamp, method, path);
    } catch (error) {
      hmacLogger.error('Request HMAC validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method
      });
      return {
        isValid: false,
        error: 'Request validation error'
      };
    }
  }

  /**
   * Create headers for outgoing requests (Cloudflare Worker)
   */
  static createAuthHeaders(
    secret: string,
    method: string,
    path: string,
    additionalHeaders: Record<string, string> = {}
  ): Record<string, string> {
    const { signature, timestamp } = this.generateSignature(secret, method, path);

    return {
      [this.SIGNATURE_HEADER]: signature,
      [this.TIMESTAMP_HEADER]: timestamp.toString(),
      'x-cron-source': 'cloudflare-worker',
      'user-agent': 'TLDRSEC-Cloudflare-Worker-HMAC/2.4.0',
      ...additionalHeaders
    };
  }

  /**
   * Validate environment configuration
   */
  static validateConfiguration(): { isValid: boolean; error?: string } {
    const secret = process.env.CRON_SECRET;
    
    if (!secret) {
      return {
        isValid: false,
        error: 'CRON_SECRET environment variable not configured'
      };
    }

    if (secret.length < 32) {
      return {
        isValid: false,
        error: `CRON_SECRET too short: ${secret.length} characters (minimum: 32)`
      };
    }

    return { isValid: true };
  }
}

/**
 * Utility function for middleware integration
 */
export function validateCronRequestHmac(request: NextRequest): HmacAuthResult {
  const configValidation = HmacAuthService.validateConfiguration();
  if (!configValidation.isValid) {
    return {
      isValid: false,
      error: configValidation.error
    };
  }

  const secret = process.env.CRON_SECRET!;
  return HmacAuthService.validateRequestHmac(request, secret);
}