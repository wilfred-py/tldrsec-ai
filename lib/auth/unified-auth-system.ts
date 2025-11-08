/**
 * Unified Authentication System
 * 
 * Provides a standardized authentication strategy pattern to resolve
 * inconsistencies between HMAC and Bearer token authentication methods.
 * Implements secure authentication patterns with fail-secure error handling.
 */

import { NextRequest } from 'next/server';
import { logger } from '../logging';

const authLogger = logger.child('unified-auth');

/**
 * Authentication result interface
 */
export interface AuthResult {
  isValid: boolean;
  error?: string;
  user?: {
    id: string;
    type: string;
  };
  metadata?: {
    strategy: string;
    timestamp: Date;
    clientIP?: string;
  };
}

/**
 * Authentication payload interface
 */
export interface AuthPayload {
  type: 'cron' | 'user' | 'admin';
  identifier: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Base authentication strategy interface
 */
export interface AuthenticationStrategy {
  readonly name: string;
  validateRequest(request: NextRequest): Promise<AuthResult>;
  generateToken(payload: AuthPayload): Promise<string>;
  revokeToken(token: string): Promise<void>;
}

/**
 * HMAC-based authentication strategy for cron endpoints
 */
export class CronHMACAuthStrategy implements AuthenticationStrategy {
  readonly name = 'cron-hmac';
  
  async validateRequest(request: NextRequest): Promise<AuthResult> {
    const authHeader = request.headers.get('authorization') || request.headers.get('x-cron-auth');
    const cronSecret = process.env.CRON_SECRET?.trim();
    
    // Fail securely - no fallback secrets allowed
    if (!cronSecret || cronSecret.length < 32) {
      authLogger.error('CRON_SECRET not properly configured');
      return {
        isValid: false,
        error: 'Server configuration error',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        isValid: false,
        error: 'Missing Authorization header',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    
    // Use timing-safe comparison to prevent timing attacks
    const isValid = await this.timingSafeEquals(token, cronSecret);
    
    if (!isValid) {
      return {
        isValid: false,
        error: 'Invalid authorization token',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    return {
      isValid: true,
      user: {
        id: 'cron-system',
        type: 'cron'
      },
      metadata: {
        strategy: this.name,
        timestamp: new Date(),
        clientIP: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      }
    };
  }

  async generateToken(payload: AuthPayload): Promise<string> {
    if (payload.type !== 'cron') {
      throw new Error('CronHMACAuthStrategy can only generate cron tokens');
    }
    
    // For cron tokens, we return the configured secret
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret || cronSecret.length < 32) {
      throw new Error('CRON_SECRET not properly configured');
    }
    
    return cronSecret;
  }

  async revokeToken(_token: string): Promise<void> {
    // Cron tokens cannot be revoked as they are environment-based
    authLogger.warn('Attempted to revoke cron token', { 
      strategy: this.name,
      reason: 'Cron tokens are environment-based and cannot be revoked'
    });
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private async timingSafeEquals(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const bytesA = encoder.encode(a);
    const bytesB = encoder.encode(b);
    
    // Compare lengths first
    let isValid = bytesA.length === bytesB.length;
    
    // Always compare full length to prevent timing attacks
    const maxLength = Math.max(bytesA.length, bytesB.length);
    for (let i = 0; i < maxLength; i++) {
      const byteA = i < bytesA.length ? bytesA[i] : 0;
      const byteB = i < bytesB.length ? bytesB[i] : 0;
      if (byteA !== byteB) {
        isValid = false;
      }
    }
    
    return isValid;
  }
}

/**
 * Signature-based authentication strategy for enhanced security
 */
export class SignatureAuthStrategy implements AuthenticationStrategy {
  readonly name = 'signature';
  
  async validateRequest(request: NextRequest): Promise<AuthResult> {
    const signature = request.headers.get('x-signature');
    const timestamp = request.headers.get('x-timestamp');
    const signatureSecret = process.env.CRON_SIGNATURE_SECRET?.trim();
    
    // Fail securely - no fallback secrets
    if (!signatureSecret || signatureSecret.length < 32) {
      return {
        isValid: false,
        error: 'Server configuration error',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    if (!signature || !timestamp) {
      return {
        isValid: false,
        error: 'Missing signature or timestamp',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    // Validate timestamp (prevent replay attacks)
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - requestTime);
    
    if (timeDiff > 300) { // 5 minutes tolerance
      return {
        isValid: false,
        error: 'Request timestamp too old or too new',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    // Generate expected signature
    const payload = `${timestamp}:${request.url}:${request.method}`;
    const expectedSignature = await this.generateHMAC(payload, signatureSecret);
    
    // Timing-safe comparison
    const isValid = await this.timingSafeEquals(signature, expectedSignature);
    
    if (!isValid) {
      return {
        isValid: false,
        error: 'Invalid signature',
        metadata: {
          strategy: this.name,
          timestamp: new Date()
        }
      };
    }

    return {
      isValid: true,
      user: {
        id: 'signed-request',
        type: 'system'
      },
      metadata: {
        strategy: this.name,
        timestamp: new Date(),
        clientIP: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      }
    };
  }

  async generateToken(payload: AuthPayload): Promise<string> {
    const timestamp = payload.timestamp || Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}:${payload.identifier}:${payload.type}`;
    
    const signatureSecret = process.env.CRON_SIGNATURE_SECRET?.trim();
    if (!signatureSecret || signatureSecret.length < 32) {
      throw new Error('CRON_SIGNATURE_SECRET not properly configured');
    }
    
    const signature = await this.generateHMAC(signaturePayload, signatureSecret);
    return `${timestamp}:${signature}`;
  }

  async revokeToken(_token: string): Promise<void> {
    // Signature-based tokens are stateless and cannot be revoked
    authLogger.warn('Attempted to revoke signature token', { 
      strategy: this.name,
      reason: 'Signature tokens are stateless and cannot be revoked'
    });
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  private async generateHMAC(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Timing-safe string comparison
   */
  private async timingSafeEquals(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const bytesA = encoder.encode(a);
    const bytesB = encoder.encode(b);
    
    let isValid = bytesA.length === bytesB.length;
    
    const maxLength = Math.max(bytesA.length, bytesB.length);
    for (let i = 0; i < maxLength; i++) {
      const byteA = i < bytesA.length ? bytesA[i] : 0;
      const byteB = i < bytesB.length ? bytesB[i] : 0;
      if (byteA !== byteB) {
        isValid = false;
      }
    }
    
    return isValid;
  }
}

/**
 * Unified Authentication System Manager
 */
export class UnifiedAuthSystem {
  private strategies = new Map<string, AuthenticationStrategy>();
  
  constructor() {
    // Register default strategies
    this.register('cron-hmac', new CronHMACAuthStrategy());
    this.register('signature', new SignatureAuthStrategy());
  }
  
  /**
   * Register an authentication strategy
   */
  register(name: string, strategy: AuthenticationStrategy): void {
    this.strategies.set(name, strategy);
    authLogger.info(`Registered authentication strategy: ${name}`);
  }
  
  /**
   * Authenticate a request using the specified strategy
   */
  async authenticate(request: NextRequest, strategyName: string): Promise<AuthResult> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      authLogger.error(`Unknown authentication strategy: ${strategyName}`);
      return {
        isValid: false,
        error: 'Unknown authentication strategy',
        metadata: {
          strategy: strategyName,
          timestamp: new Date()
        }
      };
    }
    
    try {
      const result = await strategy.validateRequest(request);
      
      authLogger.debug(`Authentication attempt`, {
        strategy: strategyName,
        success: result.isValid,
        clientIP: result.metadata?.clientIP
      });
      
      return result;
    } catch (error) {
      authLogger.error(`Authentication strategy error: ${strategyName}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        isValid: false,
        error: 'Authentication failed',
        metadata: {
          strategy: strategyName,
          timestamp: new Date()
        }
      };
    }
  }
  
  /**
   * Generate a token using the specified strategy
   */
  async generateToken(strategyName: string, payload: AuthPayload): Promise<string> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown authentication strategy: ${strategyName}`);
    }
    
    return strategy.generateToken(payload);
  }
  
  /**
   * Revoke a token using the specified strategy
   */
  async revokeToken(strategyName: string, token: string): Promise<void> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown authentication strategy: ${strategyName}`);
    }
    
    return strategy.revokeToken(token);
  }
  
  /**
   * Get all registered strategy names
   */
  getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
}

// Export singleton instance
export const unifiedAuthSystem = new UnifiedAuthSystem();

// Export error class for better error handling
export class AuthError extends Error {
  constructor(message: string, public readonly strategy?: string) {
    super(message);
    this.name = 'AuthError';
  }
}