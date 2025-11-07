/**
 * Comprehensive Email Security and Validation System
 * 
 * Implements defense-in-depth email validation to prevent:
 * - Email header injection attacks
 * - Spam and phishing attempts  
 * - Resource exhaustion attacks
 * - Data integrity issues
 * - Email enumeration attacks
 * 
 * Security Controls:
 * - RFC 5322 compliant email validation
 * - Domain validation and blacklisting
 * - Email header injection prevention
 * - Email normalization and canonicalization
 * - Rate limiting per email address
 * - Comprehensive input sanitization
 * - Threat detection and monitoring
 */

import { z } from 'zod';
import { ValidationUtils } from './validation-schemas';
import { rateLimiter } from './rate-limiter';
import { logger } from '../logging';

const emailLogger = logger.child('email-security');

/**
 * Email Security Configuration
 */
export const EMAIL_SECURITY_CONFIG = {
  // Maximum email length (RFC 5321 limit is 320 characters)
  MAX_EMAIL_LENGTH: 254,
  
  // Maximum local part length (before @)
  MAX_LOCAL_PART_LENGTH: 64,
  
  // Maximum domain length
  MAX_DOMAIN_LENGTH: 253,
  
  // Rate limiting per email
  EMAIL_RATE_LIMIT: 5, // requests per window
  EMAIL_RATE_WINDOW: 300000, // 5 minutes
  
  // Rate limiting per IP for newsletter subscriptions
  IP_RATE_LIMIT: 10, // requests per window
  IP_RATE_WINDOW: 300000, // 5 minutes
  
  // Global rate limiting for newsletter endpoint
  GLOBAL_RATE_LIMIT: 100, // requests per window
  GLOBAL_RATE_WINDOW: 60000, // 1 minute
} as const;

/**
 * Advanced email validation regex patterns
 */
export const EMAIL_PATTERNS = {
  // RFC 5322 compliant email validation (more comprehensive than simple regex)
  RFC_5322: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  
  // Local part validation (before @)
  LOCAL_PART: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/,
  
  // Domain validation (after @)
  DOMAIN: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  
  // Top-level domain validation
  TLD: /^[a-zA-Z]{2,}$/,
  
  // Email header injection patterns
  HEADER_INJECTION: /[\r\n\0\x08\x0B\x0C]/,
  
  // Suspicious patterns
  SUSPICIOUS: /[<>\"'\\;]/,
  
  // Multiple dots pattern
  MULTIPLE_DOTS: /\.{2,}/,
  
  // Leading/trailing dots
  LEADING_TRAILING_DOTS: /^\.|\.$/
} as const;

/**
 * Domain Security Lists
 */
export const DOMAIN_SECURITY = {
  // Known disposable email providers to block
  DISPOSABLE_DOMAINS: new Set([
    '10minutemail.com',
    '10minutemail.net',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'mailinator.com',
    'temp-mail.org',
    'tempmail.plus',
    'throwaway.email',
    'yopmail.com',
    'maildrop.cc',
    'tempail.com',
    '0-mail.com',
    '1secmail.com',
    '20minutemail.com',
    '33mail.com',
    'e4ward.com',
    'emailondeck.com',
    'getnada.com',
    'getairmail.com',
    'harakirimail.com',
    'incognitomail.org',
    'mailcatch.com',
    'mytrashmail.com',
    'sharklasers.com',
    'spam4.me',
    'tempmailo.com',
    'trashmail.com'
  ]),
  
  // Known malicious domains to block
  MALICIOUS_DOMAINS: new Set([
    // Add known phishing/spam domains here
    'malicious-domain.com',
    'phishing-site.org'
    // This list should be updated regularly from threat intelligence
  ]),
  
  // Trusted domains that bypass some validation
  TRUSTED_DOMAINS: new Set([
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'apple.com',
    'icloud.com',
    'protonmail.com',
    'fastmail.com'
  ])
} as const;

/**
 * Email Security Analysis Result
 */
interface EmailSecurityResult {
  isValid: boolean;
  normalized: string;
  canonical: string;
  threats: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  domain: {
    isValid: boolean;
    isTrusted: boolean;
    isDisposable: boolean;
    isMalicious: boolean;
  };
  metadata: {
    localPart: string;
    domain: string;
    tld: string;
  };
}

/**
 * Advanced Email Security Validator
 */
export class EmailSecurityValidator {
  /**
   * Comprehensive email security analysis
   */
  static async analyzeEmail(email: string): Promise<EmailSecurityResult> {
    const startTime = Date.now();
    
    try {
      emailLogger.info('Starting email security analysis', {
        emailLength: email.length,
        timestamp: new Date().toISOString()
      });
      
      // Initial sanitization and validation
      const sanitized = this.sanitizeEmailInput(email);
      const normalized = this.normalizeEmail(sanitized);
      const canonical = this.canonicalizeEmail(normalized);
      
      // Parse email components
      const parts = this.parseEmailComponents(canonical);
      if (!parts) {
        return {
          isValid: false,
          normalized: sanitized,
          canonical: sanitized,
          threats: ['Invalid email format'],
          confidence: 'LOW',
          domain: {
            isValid: false,
            isTrusted: false,
            isDisposable: false,
            isMalicious: false
          },
          metadata: {
            localPart: '',
            domain: '',
            tld: ''
          }
        };
      }
      
      // Perform comprehensive validation
      const formatValidation = this.validateEmailFormat(canonical);
      const injectionThreats = this.detectInjectionThreats(canonical);
      const domainAnalysis = await this.analyzeDomain(parts.domain);
      const suspiciousPatterns = this.detectSuspiciousPatterns(canonical);
      
      // Combine all threat indicators
      const allThreats = [
        ...formatValidation.threats,
        ...injectionThreats,
        ...domainAnalysis.threats,
        ...suspiciousPatterns
      ];
      
      // Calculate confidence score
      const confidence = this.calculateConfidenceScore(allThreats, domainAnalysis);
      
      // Determine overall validity
      const isValid = formatValidation.isValid && 
                     domainAnalysis.isValid && 
                     allThreats.length === 0;
      
      const result: EmailSecurityResult = {
        isValid,
        normalized,
        canonical,
        threats: allThreats,
        confidence,
        domain: domainAnalysis,
        metadata: {
          localPart: parts.local,
          domain: parts.domain,
          tld: parts.tld
        }
      };
      
      emailLogger.info('Email security analysis completed', {
        isValid,
        threatCount: allThreats.length,
        confidence,
        analysisTimeMs: Date.now() - startTime,
        domain: parts.domain,
        isTrusted: domainAnalysis.isTrusted
      });
      
      return result;
      
    } catch (error) {
      emailLogger.error('Email security analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        analysisTimeMs: Date.now() - startTime
      });
      
      // Fail secure - reject email on analysis failure
      const safeEmail = (typeof email === 'string' && email ? email.substring(0, 100) : 'invalid-email');
      
      return {
        isValid: false,
        normalized: safeEmail,
        canonical: safeEmail,
        threats: ['Email analysis failed'],
        confidence: 'LOW',
        domain: {
          isValid: false,
          isTrusted: false,
          isDisposable: false,
          isMalicious: false
        },
        metadata: {
          localPart: '',
          domain: '',
          tld: ''
        }
      };
    }
  }
  
  /**
   * Sanitize email input to prevent basic injection attacks
   */
  private static sanitizeEmailInput(email: string): string {
    if (typeof email !== 'string' || email === null || email === undefined) {
      throw new Error('Email must be a non-null string');
    }
    
    // Trim whitespace
    let sanitized = email.trim();
    
    // Remove null bytes and control characters (including header injection chars)
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Remove potential header injection characters
    sanitized = sanitized.replace(EMAIL_PATTERNS.HEADER_INJECTION, '');
    
    // Remove suspicious characters that could be used for injection
    sanitized = sanitized.replace(/[<>"'\\]/g, '');
    
    // Limit length
    if (sanitized.length > EMAIL_SECURITY_CONFIG.MAX_EMAIL_LENGTH) {
      sanitized = sanitized.substring(0, EMAIL_SECURITY_CONFIG.MAX_EMAIL_LENGTH);
    }
    
    return sanitized;
  }
  
  /**
   * Normalize email address (lowercase, remove dots from Gmail, etc.)
   */
  private static normalizeEmail(email: string): string {
    // Convert to lowercase
    const normalized = email.toLowerCase();
    
    // Parse components
    const atIndex = normalized.lastIndexOf('@');
    if (atIndex === -1) {
      return normalized;
    }
    
    let localPart = normalized.substring(0, atIndex);
    const domain = normalized.substring(atIndex + 1);
    
    // Gmail-specific normalization
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      // Remove dots from local part
      localPart = localPart.replace(/\./g, '');
      
      // Remove everything after + (aliases)
      const plusIndex = localPart.indexOf('+');
      if (plusIndex !== -1) {
        localPart = localPart.substring(0, plusIndex);
      }
    }
    
    return `${localPart}@${domain}`;
  }
  
  /**
   * Canonicalize email address for consistent storage and comparison
   */
  private static canonicalizeEmail(email: string): string {
    const normalized = this.normalizeEmail(email);
    
    // Additional canonicalization rules can be added here
    // For now, normalization covers the main cases
    
    return normalized;
  }
  
  /**
   * Parse email into components
   */
  private static parseEmailComponents(email: string): { local: string; domain: string; tld: string } | null {
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1 || atIndex === 0 || atIndex === email.length - 1) {
      return null;
    }
    
    const local = email.substring(0, atIndex);
    const domain = email.substring(atIndex + 1);
    
    // Extract TLD
    const lastDotIndex = domain.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === domain.length - 1) {
      return null;
    }
    
    const tld = domain.substring(lastDotIndex + 1);
    
    return { local, domain, tld };
  }
  
  /**
   * Validate email format against RFC standards
   */
  private static validateEmailFormat(email: string): { isValid: boolean; threats: string[] } {
    const threats: string[] = [];
    
    // Check length limits first
    if (email.length > EMAIL_SECURITY_CONFIG.MAX_EMAIL_LENGTH) {
      threats.push('Email address exceeds maximum length');
    }
    
    // Check overall format
    if (!EMAIL_PATTERNS.RFC_5322.test(email)) {
      threats.push('Invalid email format (RFC 5322)');
    }
    
    const atIndex = email.lastIndexOf('@');
    if (atIndex !== -1) {
      const localPart = email.substring(0, atIndex);
      const domain = email.substring(atIndex + 1);
      
      // Check local part
      if (localPart.length > EMAIL_SECURITY_CONFIG.MAX_LOCAL_PART_LENGTH) {
        threats.push('Local part exceeds maximum length');
      }
      
      if (!EMAIL_PATTERNS.LOCAL_PART.test(localPart)) {
        threats.push('Invalid local part format');
      }
      
      // Check for multiple consecutive dots
      if (EMAIL_PATTERNS.MULTIPLE_DOTS.test(localPart)) {
        threats.push('Multiple consecutive dots in local part');
      }
      
      // Check for leading/trailing dots
      if (EMAIL_PATTERNS.LEADING_TRAILING_DOTS.test(localPart)) {
        threats.push('Leading or trailing dots in local part');
      }
      
      // Check domain
      if (domain.length > EMAIL_SECURITY_CONFIG.MAX_DOMAIN_LENGTH) {
        threats.push('Domain name exceeds maximum length');
      }
      
      if (!EMAIL_PATTERNS.DOMAIN.test(domain)) {
        threats.push('Invalid domain format');
      }
      
      // Check TLD
      const lastDotIndex = domain.lastIndexOf('.');
      if (lastDotIndex !== -1) {
        const tld = domain.substring(lastDotIndex + 1);
        if (!EMAIL_PATTERNS.TLD.test(tld)) {
          threats.push('Invalid top-level domain');
        }
      }
    } else {
      threats.push('Invalid email format');
    }
    
    return {
      isValid: threats.length === 0,
      threats
    };
  }
  
  /**
   * Detect email header injection threats
   */
  private static detectInjectionThreats(email: string): string[] {
    const threats: string[] = [];
    
    // Check for header injection patterns
    if (EMAIL_PATTERNS.HEADER_INJECTION.test(email)) {
      threats.push('Email header injection pattern detected');
    }
    
    // Check for suspicious characters
    if (EMAIL_PATTERNS.SUSPICIOUS.test(email)) {
      threats.push('Suspicious characters detected');
    }
    
    // Check for common injection patterns
    const injectionPatterns = [
      /bcc\s*:/i,
      /cc\s*:/i,
      /to\s*:/i,
      /from\s*:/i,
      /subject\s*:/i,
      /content-type\s*:/i,
      /mime-version\s*:/i
    ];
    
    for (const pattern of injectionPatterns) {
      if (pattern.test(email)) {
        threats.push('Email header injection attempt detected');
        break;
      }
    }
    
    return threats;
  }
  
  /**
   * Analyze domain security properties
   */
  private static async analyzeDomain(domain: string): Promise<{
    isValid: boolean;
    isTrusted: boolean;
    isDisposable: boolean;
    isMalicious: boolean;
    threats: string[];
  }> {
    const threats: string[] = [];
    
    // Check if domain is in security lists
    const isMalicious = DOMAIN_SECURITY.MALICIOUS_DOMAINS.has(domain);
    const isDisposable = DOMAIN_SECURITY.DISPOSABLE_DOMAINS.has(domain);
    const isTrusted = DOMAIN_SECURITY.TRUSTED_DOMAINS.has(domain);
    
    if (isMalicious) {
      threats.push('Known malicious domain');
    }
    
    if (isDisposable) {
      threats.push('Disposable email provider detected');
    }
    
    // Additional domain validation
    if (domain.length < 3) {
      threats.push('Domain too short');
    }
    
    // Check for suspicious domain patterns
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(domain)) {
      threats.push('IP address used as domain');
    }
    
    // Check for punycode (internationalized domains)
    if (domain.startsWith('xn--')) {
      threats.push('Internationalized domain detected (requires verification)');
    }
    
    return {
      isValid: threats.length === 0 && !isMalicious,
      isTrusted,
      isDisposable,
      isMalicious,
      threats
    };
  }
  
  /**
   * Detect suspicious patterns in email
   */
  private static detectSuspiciousPatterns(email: string): string[] {
    const threats: string[] = [];
    
    // Check for excessive length
    if (email.length > 200) {
      threats.push('Unusually long email address');
    }
    
    // Check for too many special characters
    const specialCharCount = (email.match(/[.!#$%&'*+/=?^_`{|}~-]/g) || []).length;
    if (specialCharCount > email.length * 0.3) {
      threats.push('Excessive special characters');
    }
    
    // Check for repeated patterns
    if (/(.{3,})\1{2,}/.test(email)) {
      threats.push('Repeated character patterns detected');
    }
    
    return threats;
  }
  
  /**
   * Calculate confidence score based on threats and domain analysis
   */
  private static calculateConfidenceScore(
    threats: string[], 
    domainAnalysis: { isTrusted: boolean; isMalicious: boolean; isDisposable: boolean }
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    let score = 100;
    
    // Deduct points for threats
    score -= threats.length * 25;
    
    // Domain reputation adjustments
    if (domainAnalysis.isTrusted) {
      score += 20;
    } else if (domainAnalysis.isDisposable) {
      score -= 40;
    } else if (domainAnalysis.isMalicious) {
      score -= 60;
    }
    
    // Be more strict with confidence scoring
    if (score >= 85) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Rate limiting validation for email subscriptions
   */
  static async checkEmailRateLimit(
    email: string, 
    ipAddress: string
  ): Promise<{ allowed: boolean; reason?: string; resetTime?: number }> {
    try {
      // Check per-email rate limit
      const emailLimit = await rateLimiter.checkLimit(
        'newsletter_email',
        email,
        EMAIL_SECURITY_CONFIG.EMAIL_RATE_LIMIT,
        EMAIL_SECURITY_CONFIG.EMAIL_RATE_WINDOW
      );
      
      if (!emailLimit.allowed) {
        emailLogger.warn('Email rate limit exceeded', {
          email: email.substring(0, email.indexOf('@')),
          remaining: emailLimit.remaining,
          resetTime: emailLimit.resetTime
        });
        
        return {
          allowed: false,
          reason: 'Too many subscription attempts from this email',
          resetTime: emailLimit.resetTime
        };
      }
      
      // Check per-IP rate limit
      const ipLimit = await rateLimiter.checkLimit(
        'newsletter_ip',
        ipAddress,
        EMAIL_SECURITY_CONFIG.IP_RATE_LIMIT,
        EMAIL_SECURITY_CONFIG.IP_RATE_WINDOW
      );
      
      if (!ipLimit.allowed) {
        emailLogger.warn('IP rate limit exceeded for newsletter', {
          ip: ipAddress,
          remaining: ipLimit.remaining,
          resetTime: ipLimit.resetTime
        });
        
        return {
          allowed: false,
          reason: 'Too many subscription attempts from this IP',
          resetTime: ipLimit.resetTime
        };
      }
      
      // Check global rate limit
      const globalLimit = await rateLimiter.checkLimit(
        'newsletter_global',
        'newsletter_subscriptions',
        EMAIL_SECURITY_CONFIG.GLOBAL_RATE_LIMIT,
        EMAIL_SECURITY_CONFIG.GLOBAL_RATE_WINDOW
      );
      
      if (!globalLimit.allowed) {
        emailLogger.warn('Global newsletter rate limit exceeded', {
          remaining: globalLimit.remaining,
          resetTime: globalLimit.resetTime
        });
        
        return {
          allowed: false,
          reason: 'Service temporarily unavailable',
          resetTime: globalLimit.resetTime
        };
      }
      
      return { allowed: true };
      
    } catch (error) {
      emailLogger.error('Rate limit check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fail secure - reject when rate limiting fails
      return {
        allowed: false,
        reason: 'Service temporarily unavailable'
      };
    }
  }
}

/**
 * Zod schema for secure newsletter subscription validation
 */
export const NewsletterSubscriptionSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .max(EMAIL_SECURITY_CONFIG.MAX_EMAIL_LENGTH, 'Email address too long')
    .refine(
      (email) => !EMAIL_PATTERNS.HEADER_INJECTION.test(email),
      'Invalid characters detected'
    )
    .refine(
      (email) => EMAIL_PATTERNS.RFC_5322.test(email),
      'Invalid email format'
    ),
  
  source: z.string()
    .max(50, 'Source too long')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid source format')
    .transform(val => ValidationUtils.sanitizeString(val))
    .default('newsletter_page'),
  
  utm_source: z.string()
    .max(100, 'UTM source too long')
    .optional()
    .transform(val => val ? ValidationUtils.sanitizeString(val) : val),
  
  utm_medium: z.string()
    .max(100, 'UTM medium too long')
    .optional()
    .transform(val => val ? ValidationUtils.sanitizeString(val) : val),
  
  utm_campaign: z.string()
    .max(100, 'UTM campaign too long')
    .optional()
    .transform(val => val ? ValidationUtils.sanitizeString(val) : val)
});

/**
 * Newsletter subscription security validation
 */
export class NewsletterSecurityValidator {
  /**
   * Comprehensive validation for newsletter subscription
   */
  static async validateSubscription(data: unknown, clientIP: string): Promise<{
    isValid: boolean;
    data?: Record<string, unknown>;
    errors?: string[];
    rateLimitInfo?: { resetTime?: number };
  }> {
    try {
      // First validate the basic structure with sync validation
      const validationResult = NewsletterSubscriptionSchema.parse(data);
      
      // Perform security analysis on the email
      const emailAnalysis = await EmailSecurityValidator.analyzeEmail(validationResult.email);
      
      if (!emailAnalysis.isValid) {
        return {
          isValid: false,
          errors: [`Email security validation failed: ${emailAnalysis.threats.join(', ')}`]
        };
      }
      
      // Check rate limits
      const rateLimitResult = await EmailSecurityValidator.checkEmailRateLimit(
        emailAnalysis.canonical,
        clientIP
      );
      
      if (!rateLimitResult.allowed) {
        return {
          isValid: false,
          errors: [rateLimitResult.reason || 'Rate limit exceeded'],
          rateLimitInfo: {
            resetTime: rateLimitResult.resetTime
          }
        };
      }
      
      return {
        isValid: true,
        data: {
          ...validationResult,
          email: emailAnalysis.canonical
        }
      };
      
    } catch (error) {
      emailLogger.error('Newsletter subscription validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => e.message)
        };
      }
      
      return {
        isValid: false,
        errors: ['Subscription validation failed']
      };
    }
  }
}