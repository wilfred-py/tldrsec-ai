import * as crypto from 'crypto';
import { NextRequest } from 'next/server';
import { logger } from '../logging';
import { rateLimiter } from './rate-limiter';
import { 
  SecurityConfig,
  SecurityEventType,
  EndpointType,
  RateLimitConfig,
  IPValidationResult,
  SignatureValidationResult,
  APIKeyValidationResult,
  SecurityAuditEvent,
  SuspiciousActivityResult,
  SecurityValidationResult,
  SecurityMetrics
} from '../../types/security';

const securityLogger = logger.child('middleware-security');

// Security configuration with environment-based overrides
export const SECURITY_CONFIG: SecurityConfig = {
  // IP Allowlisting - Railway/Vercel platform IPs and custom configured IPs
  allowedIPs: [
    // Railway platform IPs (commonly used ranges)
    '172.16.0.0/12',   // Private Railway network
    '10.0.0.0/8',      // Private network range
    '192.168.0.0/16',  // Private network range
    
    // Vercel platform IPs (commonly used ranges)
    '76.76.19.0/24',   // Vercel cron service
    '76.76.21.0/24',   // Vercel infrastructure
    
    // Custom IPs from environment
    ...(process.env.CRON_ALLOWED_IPS?.split(',').filter(Boolean) || []),
    
    // Local development
    '127.0.0.1',
    '::1',
    'localhost'
  ],
  
  // Rate limiting configuration by endpoint type
  rateLimits: {
    CRON: {
      limit: 10,         // 10 requests per window
      windowMs: 300000,  // 5 minute window (longer for cron)
      emergencyLimit: 3  // Conservative emergency limit
    },
    HEALTH: {
      limit: 100,        // 100 requests per window
      windowMs: 60000,   // 1 minute window
      emergencyLimit: 20 // Emergency limit for health checks
    },
    PUBLIC: {
      limit: 50,         // 50 requests per window
      windowMs: 60000,   // 1 minute window
      emergencyLimit: 10 // Conservative emergency limit
    },
    ADMIN: {
      limit: 30,         // 30 requests per window for admin endpoints
      windowMs: 60000,   // 1 minute window
      emergencyLimit: 5  // Conservative emergency limit for admin
    },
    API: {
      limit: 100,        // 100 requests per window for API endpoints
      windowMs: 60000,   // 1 minute window
      emergencyLimit: 15 // Emergency limit for API
    }
  },
  
  // Request signature validation
  signature: {
    algorithm: 'sha256',
    timestampTolerance: 300, // 5 minutes tolerance for timestamp
    headerName: 'X-Signature-SHA256',
    timestampHeader: 'X-Timestamp'
  },
  
  // Security headers configuration
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache'
  },
  
  // Additional security flags
  enableIPValidation: true,
  enableSignatureValidation: true,
  enableAPIKeyValidation: true,
  enableSuspiciousActivityDetection: true,
  logAllSecurityEvents: true
};

/**
 * IP address validation and allowlisting with CIDR support
 * Implements defense against IP spoofing and unauthorized access
 */
export class IPValidator {
  private static ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    
    return parts.reduce((acc, part, index) => {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) return NaN;
      return acc + (num << (8 * (3 - index)));
    }, 0);
  }
  
  private static isIPv6(ip: string): boolean {
    return ip.includes(':');
  }
  
  private static isInCIDR(ip: string, cidr: string): boolean {
    if (cidr === 'localhost' && (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')) {
      return true;
    }
    
    if (!cidr.includes('/')) {
      return ip === cidr;
    }
    
    // Handle IPv6 (basic support)
    if (this.isIPv6(ip) || this.isIPv6(cidr)) {
      // For IPv6, do exact match for now (production should use proper IPv6 library)
      return ip === cidr.split('/')[0];
    }
    
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    
    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);
    
    if (ipNum === null || networkNum === null || isNaN(ipNum) || isNaN(networkNum)) {
      return false;
    }
    
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (networkNum & mask);
  }
  
  public static isAllowed(ip: string): IPValidationResult {
    if (!ip || ip === 'unknown') {
      securityLogger.warn('Unknown IP address in request');
      return {
        isAllowed: false,
        reason: 'Unknown or missing IP address',
        ipType: 'Unknown'
      };
    }
    
    // Determine IP type
    const ipType = this.isIPv6(ip) ? 'IPv6' : 'IPv4';
    
    // Check against allowed IPs/ranges
    for (const allowedIp of SECURITY_CONFIG.allowedIPs) {
      if (this.isInCIDR(ip, allowedIp)) {
        return {
          isAllowed: true,
          matchedRange: allowedIp,
          ipType
        };
      }
    }
    
    return {
      isAllowed: false,
      reason: 'IP not in allowed ranges',
      ipType
    };
  }
  
  public static extractClientIP(request: NextRequest): string {
    // Check multiple headers in order of preference
    const headers = [
      'cf-connecting-ip',      // Cloudflare
      'x-real-ip',            // Nginx
      'x-forwarded-for',      // Standard proxy header
      'x-client-ip',          // Alternative
      'x-forwarded',          // Alternative
      'forwarded-for',        // Alternative
      'forwarded'             // RFC 7239
    ];
    
    for (const header of headers) {
      const value = request.headers.get(header);
      if (value) {
        // Handle comma-separated list (take first IP)
        const ip = value.split(',')[0].trim();
        if (ip && ip !== 'unknown') {
          return ip;
        }
      }
    }
    
    // Fallback to request IP if available
    return request.ip || 'unknown';
  }
}

/**
 * Request signature validation using HMAC-SHA256
 * Prevents replay attacks and ensures request authenticity
 */
export class SignatureValidator {
  private static createSignature(payload: string, secret: string, timestamp: string): string {
    const signingKey = `${secret}.${timestamp}`;
    return crypto.createHmac(SECURITY_CONFIG.signature.algorithm, signingKey)
      .update(payload, 'utf8')
      .digest('hex');
  }
  
  private static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  }
  
  public static async validateSignature(request: NextRequest): Promise<SignatureValidationResult> {
    try {
      const signature = request.headers.get(SECURITY_CONFIG.signature.headerName);
      const timestampHeader = request.headers.get(SECURITY_CONFIG.signature.timestampHeader);
      const secret = process.env.CRON_SIGNATURE_SECRET;
      
      if (!signature) {
        return { valid: false, reason: 'Missing signature header' };
      }
      
      if (!timestampHeader) {
        return { valid: false, reason: 'Missing timestamp header' };
      }
      
      if (!secret) {
        securityLogger.error('CRON_SIGNATURE_SECRET not configured');
        return { valid: false, reason: 'Signature validation not configured' };
      }
      
      const timestamp = parseInt(timestampHeader, 10);
      if (isNaN(timestamp)) {
        return { valid: false, reason: 'Invalid timestamp format' };
      }
      
      // Check timestamp freshness (prevent replay attacks)
      const now = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(now - timestamp);
      
      if (timeDiff > SECURITY_CONFIG.signature.timestampTolerance) {
        securityLogger.warn('Request timestamp outside tolerance window', {
          timeDiff,
          tolerance: SECURITY_CONFIG.signature.timestampTolerance
        });
        return { valid: false, reason: 'Request timestamp outside tolerance window' };
      }
      
      // Create payload for signature verification
      const url = new URL(request.url);
      const payload = JSON.stringify({
        method: request.method,
        path: url.pathname,
        timestamp: timestamp,
        // Include query parameters in signature
        query: Object.fromEntries(url.searchParams.entries())
      });
      
      // Calculate expected signature
      const expectedSignature = this.createSignature(payload, secret, timestampHeader);
      const providedSignature = signature.startsWith('sha256=') 
        ? signature.slice(7) 
        : signature;
      
      // Timing-safe comparison
      const isValid = this.timingSafeEqual(expectedSignature, providedSignature);
      
      if (!isValid) {
        securityLogger.warn('Invalid request signature', {
          path: url.pathname,
          timestamp,
          providedSigLength: providedSignature.length,
          expectedSigLength: expectedSignature.length
        });
      }
      
      return { 
        valid: isValid, 
        timestamp,
        algorithm: SECURITY_CONFIG.signature.algorithm,
        reason: isValid ? undefined : 'Signature verification failed'
      };
      
    } catch (error) {
      securityLogger.error('Signature validation error', { error });
      return { valid: false, reason: 'Signature validation error' };
    }
  }
  
  /**
   * Generate signature for testing purposes
   */
  public static generateSignature(method: string, path: string, query: Record<string, string> = {}): {
    signature: string;
    timestamp: string;
    headers: Record<string, string>;
  } {
    const secret = process.env.CRON_SIGNATURE_SECRET;
    if (!secret) {
      throw new Error('CRON_SIGNATURE_SECRET not configured');
    }
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({
      method,
      path,
      timestamp: parseInt(timestamp),
      query
    });
    
    const signature = this.createSignature(payload, secret, timestamp);
    
    return {
      signature: `sha256=${signature}`,
      timestamp,
      headers: {
        [SECURITY_CONFIG.signature.headerName]: `sha256=${signature}`,
        [SECURITY_CONFIG.signature.timestampHeader]: timestamp
      }
    };
  }
}

/**
 * API Key authentication for fallback security
 * Implements key rotation and usage tracking
 */
export class APIKeyValidator {
  private static readonly API_KEY_PATTERN = /^tldr_[a-zA-Z0-9]{32}$/;
  
  public static async validateAPIKey(request: NextRequest): Promise<APIKeyValidationResult> {
    try {
      const authHeader = request.headers.get('authorization');
      const apiKeyHeader = request.headers.get('x-api-key');
      
      let apiKey: string | null = null;
      
      // Check Authorization header (Bearer token)
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7);
      }
      
      // Check X-API-Key header
      if (!apiKey && apiKeyHeader) {
        apiKey = apiKeyHeader;
      }
      
      if (!apiKey) {
        return { valid: false, reason: 'Missing API key' };
      }
      
      // Validate API key format
      if (!this.API_KEY_PATTERN.test(apiKey)) {
        return { valid: false, reason: 'Invalid API key format' };
      }
      
      // Check against configured API keys
      const validKeys = process.env.CRON_API_KEYS?.split(',').filter(Boolean) || [];
      
      for (const validKey of validKeys) {
        if (crypto.timingSafeEqual(
          Buffer.from(apiKey, 'utf8'),
          Buffer.from(validKey.trim(), 'utf8')
        )) {
          // Extract key ID for tracking
          const keyId = crypto.createHash('sha256')
            .update(apiKey)
            .digest('hex')
            .substring(0, 8);
          
          return { valid: true, keyId };
        }
      }
      
      return { valid: false, reason: 'Invalid API key' };
      
    } catch (error) {
      securityLogger.error('API key validation error', { error });
      return { valid: false, reason: 'API key validation error' };
    }
  }
}

/**
 * Security event logging and monitoring
 * Implements comprehensive audit trails for security events
 */
export class SecurityAuditor {
  public static async logSecurityEvent(
    eventType: SecurityEventType,
    request: NextRequest,
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      const clientIP = IPValidator.extractClientIP(request);
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const url = new URL(request.url);
      
      const securityEvent: SecurityAuditEvent = {
        timestamp: new Date().toISOString(),
        eventType,
        clientIP,
        userAgent,
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: {
          'x-forwarded-for': request.headers.get('x-forwarded-for'),
          'x-real-ip': request.headers.get('x-real-ip'),
          'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
          'authorization': request.headers.get('authorization') ? 'present' : 'absent',
          'x-api-key': request.headers.get('x-api-key') ? 'present' : 'absent'
        },
        result: eventType === 'ACCESS_GRANTED' ? 'ALLOWED' : 'DENIED',
        metadata: details
      };
      
      // Log security event
      if (eventType === 'ACCESS_GRANTED') {
        securityLogger.info(`Security event: ${eventType}`, securityEvent);
      } else {
        securityLogger.warn(`Security event: ${eventType}`, securityEvent);
      }
      
      // TODO: In production, consider sending high-priority events to external monitoring
      // systems like Datadog, New Relic, or custom alerting services
      
      if (eventType === 'SUSPICIOUS_ACTIVITY') {
        securityLogger.error('SECURITY ALERT: Suspicious activity detected', securityEvent);
        // TODO: Trigger immediate alerting for suspicious activity
      }
      
    } catch (error) {
      securityLogger.error('Failed to log security event', { error, eventType });
    }
  }
  
  /**
   * Detect suspicious patterns in requests
   */
  public static detectSuspiciousActivity(request: NextRequest): SuspiciousActivityResult {
    const reasons: string[] = [];
    const userAgent = request.headers.get('user-agent') || '';
    const url = new URL(request.url);
    
    // Check for suspicious user agents
    const suspiciousUAPatterns = [
      /curl/i,
      /wget/i,
      /scanner/i,
      /bot/i,
      /crawl/i,
      /hack/i,
      /exploit/i,
      /nmap/i,
      /sqlmap/i,
      /nikto/i
    ];
    
    for (const pattern of suspiciousUAPatterns) {
      if (pattern.test(userAgent)) {
        reasons.push(`Suspicious user agent: ${userAgent}`);
        break;
      }
    }
    
    // Check for suspicious query parameters
    const suspiciousParams = ['admin', 'config', 'debug', 'test', 'backup', 'dump'];
    for (const param of suspiciousParams) {
      if (url.searchParams.has(param)) {
        reasons.push(`Suspicious query parameter: ${param}`);
      }
    }
    
    // Check for SQL injection patterns in query string
    const sqlInjectionPatterns = [
      /('|%27|\\';|%3B|\|%7C)/i,
      /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i
    ];
    
    const queryString = url.search;
    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(queryString)) {
        reasons.push('Potential SQL injection attempt in query string');
        break;
      }
    }
    
    const riskScore = Math.min(reasons.length * 25, 100); // Each reason adds 25 points, max 100
    
    let recommendedAction: 'ALLOW' | 'CHALLENGE' | 'BLOCK' | 'MONITOR' = 'ALLOW';
    if (riskScore >= 75) recommendedAction = 'BLOCK';
    else if (riskScore >= 50) recommendedAction = 'CHALLENGE';
    else if (riskScore >= 25) recommendedAction = 'MONITOR';
    
    return {
      suspicious: reasons.length > 0,
      reasons,
      riskScore,
      detectionRules: ['user-agent-check', 'query-param-check', 'sql-injection-check'],
      recommendedAction
    };
  }
}

/**
 * Comprehensive security validation for middleware
 */
export class MiddlewareSecurity {
  public static async validateRequest(
    request: NextRequest,
    endpointType: EndpointType
  ): Promise<SecurityValidationResult> {
    const clientIP = IPValidator.extractClientIP(request);
    const url = new URL(request.url);
    
    try {
      // Step 1: Detect suspicious activity first
      const suspiciousCheck = SecurityAuditor.detectSuspiciousActivity(request);
      if (suspiciousCheck.suspicious) {
        await SecurityAuditor.logSecurityEvent('SUSPICIOUS_ACTIVITY', request, {
          reasons: suspiciousCheck.reasons
        });
        
        return {
          allowed: false,
          reason: 'Suspicious activity detected',
          statusCode: 403
        };
      }
      
      // Step 2: IP allowlisting (for cron endpoints)
      if (endpointType === 'CRON') {
        const ipValidation = IPValidator.isAllowed(clientIP);
        if (!ipValidation.isAllowed) {
          await SecurityAuditor.logSecurityEvent('UNAUTHORIZED_IP', request, {
            clientIP,
            allowedRanges: SECURITY_CONFIG.allowedIPs,
            ipValidation
          });
          
          return {
            allowed: false,
            reason: 'IP not allowed',
            statusCode: 403
          };
        }
      }
      
      // Step 3: Rate limiting
      const rateLimitConfig = SECURITY_CONFIG.rateLimits[endpointType];
      const rateLimitResult = await rateLimiter.checkLimit(
        `middleware-${endpointType.toLowerCase()}`,
        clientIP,
        rateLimitConfig.limit,
        rateLimitConfig.windowMs
      );
      
      if (!rateLimitResult.allowed) {
        await SecurityAuditor.logSecurityEvent('RATE_LIMIT_EXCEEDED', request, {
          clientIP,
          endpointType,
          limit: rateLimitConfig.limit,
          windowMs: rateLimitConfig.windowMs,
          remaining: rateLimitResult.remaining
        });
        
        return {
          allowed: false,
          reason: 'Rate limit exceeded',
          statusCode: 429,
          responseHeaders: {
            'X-RateLimit-Limit': rateLimitConfig.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        };
      }
      
      // Step 4: Signature validation (for cron endpoints)
      if (endpointType === 'CRON' && process.env.CRON_SIGNATURE_SECRET) {
        const signatureResult = await SignatureValidator.validateSignature(request);
        if (!signatureResult.valid) {
          await SecurityAuditor.logSecurityEvent('INVALID_SIGNATURE', request, {
            reason: signatureResult.reason,
            timestamp: signatureResult.timestamp
          });
          
          // Fall back to API key validation
          const apiKeyResult = await APIKeyValidator.validateAPIKey(request);
          if (!apiKeyResult.valid) {
            await SecurityAuditor.logSecurityEvent('INVALID_API_KEY', request, {
              reason: apiKeyResult.reason
            });
            
            return {
              allowed: false,
              reason: 'Authentication failed',
              statusCode: 401
            };
          }
        }
      }
      
      // Step 5: Legacy CRON_SECRET validation (for compatibility)
      if (endpointType === 'CRON' && process.env.CRON_SECRET) {
        const authHeader = request.headers.get('authorization');
        const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
        
        if (!authHeader || !crypto.timingSafeEqual(
          Buffer.from(authHeader, 'utf8'),
          Buffer.from(expectedAuth, 'utf8')
        )) {
          await SecurityAuditor.logSecurityEvent('ACCESS_DENIED', request, {
            reason: 'Invalid CRON_SECRET'
          });
          
          return {
            allowed: false,
            reason: 'Unauthorized',
            statusCode: 401
          };
        }
      }
      
      // All security checks passed
      await SecurityAuditor.logSecurityEvent('ACCESS_GRANTED', request, {
        endpointType,
        clientIP
      });
      
      return {
        allowed: true,
        responseHeaders: {
          ...SECURITY_CONFIG.securityHeaders,
          'X-RateLimit-Limit': rateLimitConfig.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
        }
      };
      
    } catch (error) {
      securityLogger.error('Security validation error', { error, clientIP, path: url.pathname });
      
      // Fail secure - deny access on validation errors
      return {
        allowed: false,
        reason: 'Security validation error',
        statusCode: 500
      };
    }
  }
}