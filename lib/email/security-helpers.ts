/**
 * Security Helpers for Email System
 *
 * Provides PII masking and GDPR-compliant logging utilities for email operations.
 * Prevents personally identifiable information from being exposed in logs.
 */

/**
 * Escape HTML-unsafe characters in user-controllable strings before
 * interpolating into email HTML templates.
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mask email address for logging purposes
 * @param email Email address to mask
 * @returns Masked email preserving domain for debugging while hiding PII
 */
export function maskEmailForLogging(email: string): string {
  if (!email || typeof email !== 'string') {
    return '[INVALID_EMAIL]';
  }
  
  try {
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) {
      return '[MALFORMED_EMAIL]';
    }
    
    // Show first and last character of local part, mask the rest
    if (localPart.length === 1) {
      return `${localPart[0]}***@${domain}`;
    } else if (localPart.length === 2) {
      return `${localPart}***@${domain}`;
    } else if (localPart.length <= 4) {
      return `${localPart.substring(0, 2)}***${localPart[localPart.length - 1]}@${domain}`;
    } else {
      return `${localPart.substring(0, 2)}***${localPart[localPart.length - 1]}@${domain}`;
    }
  } catch {
    return '[EMAIL_MASK_ERROR]';
  }
}

/**
 * Mask user ID for logging (show prefix for debugging)
 * @param userId User ID to mask
 * @returns Masked user ID
 */
export function maskUserIdForLogging(userId: string): string {
  if (!userId || typeof userId !== 'string') {
    return '[INVALID_USER_ID]';
  }
  
  try {
    // Show first 8 characters, mask the rest
    if (userId.length <= 5) {
      return userId; // Very short IDs preserved (5 chars or less)
    } else if (userId.length <= 8) {
      return `${userId.substring(0, 4)}****`;
    }
    return `${userId.substring(0, 8)}****`;
  } catch {
    return '[USER_ID_MASK_ERROR]';
  }
}

/**
 * Mask email content for logging (subject lines, body snippets)
 * @param content Email content to mask
 * @param maxLength Maximum length to show before truncating
 * @returns Masked content
 */
export function maskEmailContentForLogging(content: string, maxLength: number = 200): string {
  if (!content || typeof content !== 'string') {
    return '[NO_CONTENT]';
  }
  
  try {
    // Remove any potential PII patterns
    let sanitized = content
      // Remove email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
      // Remove phone numbers (various formats)
      .replace(/(\(\d{3}\)\s?\d{3}[-.]?\d{4}|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b)/g, '[PHONE_REDACTED]')
      // Remove potential SSNs
      .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[SSN_REDACTED]')
      // Remove credit card numbers
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CC_REDACTED]');
    
    // Truncate if too long - only add '...' if we actually truncated
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength - 3) + '...';
    }
    
    return sanitized;
  } catch {
    return '[CONTENT_MASK_ERROR]';
  }
}

/**
 * Create GDPR-compliant logging object for email operations
 * @param originalData Original data that may contain PII
 * @returns Sanitized data safe for logging
 */
export function createGDPRCompliantLogData(
  originalData: Record<string, unknown>, 
  visited = new WeakSet()
): Record<string, unknown> {
  // Handle circular references
  if (visited.has(originalData)) {
    return { '[CIRCULAR_REFERENCE]': true };
  }
  visited.add(originalData);
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(originalData)) {
    switch (key.toLowerCase()) {
      case 'email':
      case 'emailaddress':
      case 'emailarray':
      case 'to':
      case 'from':
      case 'cc':
      case 'bcc':
        if (typeof value === 'string') {
          sanitized[key] = maskEmailForLogging(value);
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map(email => 
            typeof email === 'string' ? maskEmailForLogging(email) : '[INVALID_EMAIL_ARRAY_ITEM]'
          );
        } else {
          sanitized[key] = '[INVALID_EMAIL_TYPE]';
        }
        break;
        
      case 'userid':
      case 'user_id':
      case 'id':
        if (typeof value === 'string') {
          sanitized[key] = maskUserIdForLogging(value);
        } else {
          sanitized[key] = '[INVALID_ID_TYPE]';
        }
        break;
        
      case 'subject':
      case 'title':
        if (typeof value === 'string') {
          sanitized[key] = maskEmailContentForLogging(value, 100);
        } else {
          sanitized[key] = '[INVALID_SUBJECT_TYPE]';
        }
        break;
        
      case 'phonenumber':
      case 'phone':
      case 'phone_number':
        if (typeof value === 'string') {
          sanitized[key] = maskEmailContentForLogging(value, 20);
        } else {
          sanitized[key] = '[INVALID_PHONE_TYPE]';
        }
        break;
        
      case 'creditcard':
      case 'credit_card':
      case 'ccnumber':
      case 'cc_number':
      case 'cardnumber':
      case 'card_number':
        if (typeof value === 'string') {
          sanitized[key] = '[CC_REDACTED]';
        } else {
          sanitized[key] = '[INVALID_CC_TYPE]';
        }
        break;
        
      case 'body':
      case 'content':
      case 'html':
      case 'text':
        if (typeof value === 'string') {
          sanitized[key] = maskEmailContentForLogging(value, 200);
        } else {
          sanitized[key] = '[INVALID_CONTENT_TYPE]';
        }
        break;
        
      case 'metadata':
        if (typeof value === 'object' && value !== null) {
          sanitized[key] = createGDPRCompliantLogData(value as Record<string, unknown>, visited);
        } else {
          sanitized[key] = value;
        }
        break;
        
      // Safe fields that don't contain PII
      case 'requestid':
      case 'jobid':
      case 'emailid':
      case 'filingid':
      case 'summaryid':
      case 'ticker':
      case 'formtype':
      case 'priority':
      case 'status':
      case 'duration':
      case 'attempts':
      case 'retryable':
      case 'timestamp':
      case 'createdat':
      case 'updatedat':
        sanitized[key] = value;
        break;
        
      default:
        // For unknown fields, be conservative and mask if it looks like PII
        if (typeof value === 'string') {
          // Check if it looks like an email
          if (value.includes('@') && value.includes('.')) {
            sanitized[key] = maskEmailForLogging(value);
          } else if (/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/.test(value)) {
            // Check if it looks like a credit card number
            sanitized[key] = '[CC_REDACTED]';
          } else if (/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/.test(value)) {
            // Check if it looks like an SSN
            sanitized[key] = '[SSN_REDACTED]';
          } else if (/(\(\d{3}\)\s?\d{3}[-.]?\d{4}|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b)/.test(value)) {
            // Check if it looks like a phone number
            sanitized[key] = '[PHONE_REDACTED]';
          } else if (value.length > 50) {
            // Long strings might contain PII, truncate them
            sanitized[key] = maskEmailContentForLogging(value, 50);
          } else {
            sanitized[key] = value;
          }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively handle nested objects
          sanitized[key] = createGDPRCompliantLogData(value as Record<string, unknown>, visited);
        } else {
          sanitized[key] = value;
        }
        break;
    }
  }
  
  return sanitized;
}

/**
 * Secure logger wrapper that automatically masks PII
 */
interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

export class SecureEmailLogger {
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  info(message: string, data?: Record<string, unknown>) {
    const sanitizedData = data ? createGDPRCompliantLogData(data) : {};
    this.logger.info(message, sanitizedData);
  }
  
  warn(message: string, data?: Record<string, unknown>) {
    const sanitizedData = data ? createGDPRCompliantLogData(data) : {};
    this.logger.warn(message, sanitizedData);
  }
  
  error(message: string, data?: Record<string, unknown>) {
    const sanitizedData = data ? createGDPRCompliantLogData(data) : {};
    this.logger.error(message, sanitizedData);
  }
  
  debug(message: string, data?: Record<string, unknown>) {
    const sanitizedData = data ? createGDPRCompliantLogData(data) : {};
    this.logger.debug(message, sanitizedData);
  }
}

