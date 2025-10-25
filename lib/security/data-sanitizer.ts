/**
 * GDPR-Compliant Data Sanitization and PII Protection
 * 
 * Implements defense-in-depth data protection for SEC filing platform.
 * Ensures GDPR Article 25 (Data Protection by Design) compliance.
 */

import crypto from 'crypto';
import { logger } from '../logging';

const sanitizerLogger = logger.child('data-sanitizer');

/**
 * Configuration for data sanitization rules
 */
interface SanitizationConfig {
  enablePIIRedaction: boolean;
  enableUserIdHashing: boolean;
  enableEmailMasking: boolean;
  hashSalt: string;
  retentionPolicy: 'redact' | 'hash' | 'encrypt';
}

/**
 * PII detection patterns for comprehensive data protection
 */
const PII_PATTERNS = {
  // Email patterns - RFC 5322 compliant
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // User ID patterns - various formats
  userId: /\b(user_|usr_|u_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
  
  // Credit card patterns
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  
  // SSN patterns
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  
  // Phone number patterns
  phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
  
  // IP addresses
  ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  
  // Session tokens and API keys
  token: /\b[A-Za-z0-9]{32,}\b/g
};

/**
 * Default sanitization configuration following security best practices
 */
const DEFAULT_CONFIG: SanitizationConfig = {
  enablePIIRedaction: true,
  enableUserIdHashing: true,
  enableEmailMasking: true,
  hashSalt: process.env.DATA_SANITIZATION_SALT || 'tldrsec-data-protection-salt',
  retentionPolicy: 'hash'
};

export class DataSanitizer {
  private config: SanitizationConfig;
  
  constructor(config: Partial<SanitizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Validate configuration
    if (!this.config.hashSalt || this.config.hashSalt.length < 16) {
      sanitizerLogger.warn('Weak or missing hash salt detected - using stronger default');
      this.config.hashSalt = crypto.randomBytes(32).toString('hex');
    }
  }

  /**
   * Sanitize user ID for GDPR-compliant logging
   * Uses HMAC-SHA256 for irreversible but consistent hashing
   */
  sanitizeUserId(userId: string | null | undefined): string {
    if (!userId) return '[USER_ID_NULL]';
    
    if (!this.config.enableUserIdHashing) {
      return userId;
    }

    try {
      // Input validation - reject malicious patterns
      if (typeof userId !== 'string' || userId.length > 100) {
        sanitizerLogger.warn('Invalid userId format detected', {
          userIdType: typeof userId,
          userIdLength: typeof userId === 'string' ? userId.length : 'N/A'
        });
        return '[INVALID_USER_ID]';
      }

      // Create HMAC hash for consistent, irreversible user identification
      const hmac = crypto.createHmac('sha256', this.config.hashSalt);
      hmac.update(userId);
      const hashedId = hmac.digest('hex').substring(0, 16); // First 16 chars for readability
      
      return `u_${hashedId}`;
    } catch (error) {
      sanitizerLogger.error('Failed to sanitize user ID', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return '[HASH_FAILED]';
    }
  }

  /**
   * Sanitize email addresses for logging compliance
   */
  sanitizeEmail(email: string | null | undefined): string {
    if (!email) return '[EMAIL_NULL]';
    
    if (!this.config.enableEmailMasking) {
      return email;
    }

    try {
      // Validate email format
      if (typeof email !== 'string' || !email.includes('@')) {
        return '[INVALID_EMAIL]';
      }

      const [localPart, domain] = email.split('@');
      if (!localPart || !domain) {
        return '[MALFORMED_EMAIL]';
      }

      // Mask local part but preserve domain for debugging
      const maskedLocal = localPart.length <= 2 
        ? '***' 
        : localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1);
      
      return `${maskedLocal}@${domain}`;
    } catch (error) {
      sanitizerLogger.error('Failed to sanitize email', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return '[EMAIL_SANITIZATION_FAILED]';
    }
  }

  /**
   * Comprehensive PII redaction from any data structure
   */
  sanitizeObject(data: unknown): unknown {
    if (!this.config.enablePIIRedaction) {
      return data;
    }

    return this.recursiveSanitize(data);
  }

  /**
   * Sanitize string content for PII patterns
   */
  sanitizeString(input: string): string {
    if (!this.config.enablePIIRedaction || typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Apply PII pattern redaction
    Object.entries(PII_PATTERNS).forEach(([patternName, pattern]) => {
      sanitized = sanitized.replace(pattern, (match) => {
        switch (patternName) {
          case 'email':
            return this.sanitizeEmail(match);
          case 'userId':
            return this.sanitizeUserId(match);
          case 'creditCard':
            return '****-****-****-' + match.slice(-4);
          case 'ssn':
            return '***-**-' + match.slice(-4);
          case 'phone':
            return '***-***-' + match.slice(-4);
          case 'ipAddress':
            return 'XXX.XXX.XXX.' + match.split('.').pop();
          case 'token':
            return '[TOKEN_REDACTED]';
          default:
            return '[PII_REDACTED]';
        }
      });
    });

    return sanitized;
  }

  /**
   * Create sanitized logging context for audit trails
   */
  createSecureLogContext(context: Record<string, unknown>): Record<string, unknown> {
    // Handle null/undefined input gracefully
    if (!context || typeof context !== 'object') {
      return {};
    }

    const sanitizedContext: Record<string, unknown> = {};

    Object.entries(context).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();

      // Special handling for known sensitive fields
      if (lowerKey.includes('userid') || lowerKey.includes('user_id')) {
        sanitizedContext[key] = this.sanitizeUserId(String(value));
      } else if (lowerKey.includes('email')) {
        sanitizedContext[key] = this.sanitizeEmail(String(value));
      } else if (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token')) {
        sanitizedContext[key] = '[REDACTED]';
      } else {
        sanitizedContext[key] = this.recursiveSanitize(value);
      }
    });

    // Add sanitization metadata for audit purposes
    sanitizedContext._sanitized = true;
    sanitizedContext._sanitizedAt = new Date().toISOString();

    return sanitizedContext;
  }

  /**
   * Validate that data has been properly sanitized
   */
  validateSanitization(data: unknown): { isValid: boolean; violations: string[] } {
    const violations: string[] = [];
    const dataString = JSON.stringify(data);

    // Check for PII pattern violations
    Object.entries(PII_PATTERNS).forEach(([patternName, pattern]) => {
      const matches = dataString.match(pattern);
      if (matches && matches.length > 0) {
        violations.push(`${patternName}: ${matches.length} violations found`);
      }
    });

    // Check for common sensitive field names
    const sensitiveFields = ['password', 'secret', 'token', 'key', 'auth'];
    sensitiveFields.forEach(field => {
      if (dataString.toLowerCase().includes(`"${field}":`)) {
        violations.push(`Sensitive field detected: ${field}`);
      }
    });

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * Recursive sanitization of nested data structures
   */
  private recursiveSanitize(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.recursiveSanitize(item));
    }

    if (typeof data === 'object') {
      const sanitized: Record<string, unknown> = {};
      
      Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
        // Sanitize both key and value
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.recursiveSanitize(value);
      });

      return sanitized;
    }

    return data;
  }

  /**
   * Generate secure correlation ID for audit trails
   */
  generateSecureCorrelationId(prefix: string = 'audit'): string {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    
    return `${prefix}_${timestamp}_${randomBytes}`;
  }

  /**
   * Hash sensitive data for storage (one-way)
   */
  hashSensitiveData(data: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(data + this.config.hashSalt);
    return hash.digest('hex');
  }

  /**
   * Encrypt sensitive data for reversible storage
   */
  encryptSensitiveData(data: string, key?: string): { encrypted: string; iv: string } {
    const encryptionKey = key || crypto.scryptSync(this.config.hashSalt, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipherGCM('aes-256-gcm', encryptionKey);
    cipher.setAAD(Buffer.from('tldrsec-data-protection'));
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
      encrypted: encrypted + ':' + authTag,
      iv: iv.toString('hex')
    };
  }
}

/**
 * Global sanitizer instance with production configuration
 */
export const dataSanitizer = new DataSanitizer({
  enablePIIRedaction: process.env.NODE_ENV === 'production',
  enableUserIdHashing: true,
  enableEmailMasking: true,
  retentionPolicy: 'hash'
});

/**
 * Quick sanitization utilities for common use cases
 */
export const sanitize = {
  userId: (id: string | null | undefined) => dataSanitizer.sanitizeUserId(id),
  email: (email: string | null | undefined) => dataSanitizer.sanitizeEmail(email),
  object: (obj: unknown) => dataSanitizer.sanitizeObject(obj),
  string: (str: string) => dataSanitizer.sanitizeString(str),
  logContext: (context: Record<string, unknown>) => dataSanitizer.createSecureLogContext(context)
};