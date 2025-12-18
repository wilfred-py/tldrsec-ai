/**
 * Slack Input Validation
 *
 * Comprehensive input validation and sanitization for Slack payloads
 * to prevent injection attacks and ensure data integrity.
 */

import { logger } from '../logging';

const validationLogger = logger.child('slack-validation');

// =============================================================================
// Validation Schemas
// =============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: any;
}

interface SlackUserValidation {
  id: string;
  pattern: RegExp;
}

interface SlackChannelValidation {
  id: string;
  pattern: RegExp;
}

// Slack ID patterns for validation
const SLACK_PATTERNS = {
  USER_ID: /^U[A-Z0-9]{8,}$/,
  BOT_USER_ID: /^B[A-Z0-9]{8,}$/,
  CHANNEL_ID: /^[CDG][A-Z0-9]{8,}$/,
  TEAM_ID: /^T[A-Z0-9]{8,}$/,
  MESSAGE_TS: /^\d{10}\.\d{6}$/,
  THREAD_TS: /^\d{10}\.\d{6}$/,
} as const;

// =============================================================================
// Core Validation Functions
// =============================================================================

/**
 * Validate Slack user ID format
 */
export function validateSlackUserId(userId: string): boolean {
  if (typeof userId !== 'string') return false;
  return SLACK_PATTERNS.USER_ID.test(userId) || SLACK_PATTERNS.BOT_USER_ID.test(userId);
}

/**
 * Validate Slack channel ID format
 */
export function validateSlackChannelId(channelId: string): boolean {
  if (typeof channelId !== 'string') return false;
  return SLACK_PATTERNS.CHANNEL_ID.test(channelId);
}

/**
 * Validate Slack team ID format
 */
export function validateSlackTeamId(teamId: string): boolean {
  if (typeof teamId !== 'string') return false;
  return SLACK_PATTERNS.TEAM_ID.test(teamId);
}

/**
 * Validate Slack timestamp format
 */
export function validateSlackTimestamp(timestamp: string): boolean {
  if (typeof timestamp !== 'string') return false;
  return SLACK_PATTERNS.MESSAGE_TS.test(timestamp);
}

/**
 * Sanitize text content to prevent injection attacks
 */
export function sanitizeTextContent(text: string): string {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .substring(0, 4000); // Limit length to prevent DoS
}

/**
 * Validate and sanitize message text with Slack formatting
 */
export function validateMessageText(text: string): ValidationResult {
  const errors: string[] = [];
  
  if (typeof text !== 'string') {
    errors.push('Message text must be a string');
    return { valid: false, errors };
  }
  
  if (text.length === 0) {
    errors.push('Message text cannot be empty');
    return { valid: false, errors };
  }
  
  if (text.length > 40000) {
    errors.push('Message text too long (max 40,000 characters)');
    return { valid: false, errors };
  }
  
  // Check for potential injection patterns
  const dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /data:/gi,
    /vbscript:/gi,
    /onload=/gi,
    /onerror=/gi,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(text)) {
      errors.push('Message contains potentially dangerous content');
      break;
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Sanitize while preserving Slack formatting
  const sanitized = text
    .replace(/[<>&"']/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&#x27;';
        default: return char;
      }
    })
    .trim();
  
  return {
    valid: true,
    errors: [],
    sanitized,
  };
}

// =============================================================================
// Payload Validation
// =============================================================================

/**
 * Validate URL verification payload
 */
export function validateUrlVerificationPayload(payload: any): ValidationResult {
  const errors: string[] = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be an object');
    return { valid: false, errors };
  }
  
  if (payload.type !== 'url_verification') {
    errors.push('Invalid payload type for URL verification');
  }
  
  if (typeof payload.challenge !== 'string') {
    errors.push('Challenge must be a string');
  } else if (payload.challenge.length > 1000) {
    errors.push('Challenge too long');
  }
  
  if (payload.token && typeof payload.token !== 'string') {
    errors.push('Token must be a string');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      type: payload.type,
      challenge: sanitizeTextContent(payload.challenge || ''),
      token: payload.token ? sanitizeTextContent(payload.token) : undefined,
    },
  };
}

/**
 * Validate app mention event
 */
export function validateAppMentionEvent(event: any): ValidationResult {
  const errors: string[] = [];
  
  if (!event || typeof event !== 'object') {
    errors.push('Event must be an object');
    return { valid: false, errors };
  }
  
  if (event.type !== 'app_mention') {
    errors.push('Invalid event type');
  }
  
  if (!validateSlackUserId(event.user)) {
    errors.push('Invalid user ID format');
  }
  
  if (!validateSlackChannelId(event.channel)) {
    errors.push('Invalid channel ID format');
  }
  
  const textValidation = validateMessageText(event.text);
  if (!textValidation.valid) {
    errors.push(...textValidation.errors);
  }
  
  if (event.thread_ts && !validateSlackTimestamp(event.thread_ts)) {
    errors.push('Invalid thread timestamp format');
  }
  
  if (event.ts && !validateSlackTimestamp(event.ts)) {
    errors.push('Invalid message timestamp format');
  }
  
  if (event.team && !validateSlackTeamId(event.team)) {
    errors.push('Invalid team ID format');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      type: event.type,
      user: event.user,
      channel: event.channel,
      text: textValidation.sanitized || '',
      thread_ts: event.thread_ts,
      ts: event.ts,
      team: event.team,
    },
  };
}

/**
 * Validate event callback payload
 */
export function validateEventCallbackPayload(payload: any): ValidationResult {
  const errors: string[] = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be an object');
    return { valid: false, errors };
  }
  
  if (payload.type !== 'event_callback') {
    errors.push('Invalid payload type');
  }
  
  if (!payload.event || typeof payload.event !== 'object') {
    errors.push('Event object is required');
    return { valid: false, errors };
  }
  
  if (payload.team_id && !validateSlackTeamId(payload.team_id)) {
    errors.push('Invalid team ID format');
  }
  
  if (payload.api_app_id && typeof payload.api_app_id !== 'string') {
    errors.push('API app ID must be a string');
  }
  
  // Validate the nested event based on its type
  let eventValidation: ValidationResult;
  switch (payload.event.type) {
    case 'app_mention':
      eventValidation = validateAppMentionEvent(payload.event);
      break;
    default:
      eventValidation = { valid: true, errors: [], sanitized: payload.event };
  }
  
  if (!eventValidation.valid) {
    errors.push(...eventValidation.errors);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      type: payload.type,
      team_id: payload.team_id,
      api_app_id: payload.api_app_id,
      event: eventValidation.sanitized,
      event_id: payload.event_id,
      event_time: payload.event_time,
    },
  };
}

/**
 * Main validation function for any Slack payload
 */
export function validateSlackPayload(payload: any): ValidationResult {
  try {
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        errors: ['Payload must be a valid object'],
      };
    }
    
    if (typeof payload.type !== 'string') {
      return {
        valid: false,
        errors: ['Payload type is required and must be a string'],
      };
    }
    
    // Route to specific validator based on type
    switch (payload.type) {
      case 'url_verification':
        return validateUrlVerificationPayload(payload);
      
      case 'event_callback':
        return validateEventCallbackPayload(payload);
      
      default:
        validationLogger.warn('Unknown payload type', { type: payload.type });
        return {
          valid: true, // Allow unknown types but log them
          errors: [],
          sanitized: payload,
        };
    }
  } catch (error) {
    validationLogger.error('Validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      valid: false,
      errors: ['Validation failed due to internal error'],
    };
  }
}

// =============================================================================
// Security Helpers
// =============================================================================

/**
 * Check for suspicious patterns that might indicate an attack
 */
export function detectSuspiciousPatterns(text: string): string[] {
  const suspiciousPatterns = [
    { pattern: /(\.|\/){5,}/, description: 'Path traversal attempt' },
    { pattern: /(union|select|insert|update|delete|drop|create|alter)\s+/gi, description: 'SQL injection attempt' },
    { pattern: /<script[^>]*>|javascript:|data:|vbscript:/gi, description: 'Script injection attempt' },
    { pattern: /\$\{[^}]*\}|\$\([^)]*\)|`[^`]*`/g, description: 'Template injection attempt' },
    { pattern: /(eval|exec|system|shell_exec|passthru|proc_open)/gi, description: 'Code execution attempt' },
  ];
  
  const detected: string[] = [];
  
  for (const { pattern, description } of suspiciousPatterns) {
    if (pattern.test(text)) {
      detected.push(description);
    }
  }
  
  return detected;
}

/**
 * Rate limit validation based on payload complexity
 */
export function validatePayloadComplexity(payload: any): ValidationResult {
  const errors: string[] = [];
  
  const jsonString = JSON.stringify(payload);
  
  // Check payload size
  if (jsonString.length > 50 * 1024) { // 50KB
    errors.push('Payload too large');
  }
  
  // Check nesting depth
  const maxDepth = 10;
  let depth = 0;
  let maxDepthFound = 0;
  
  for (const char of jsonString) {
    if (char === '{' || char === '[') {
      depth++;
      maxDepthFound = Math.max(maxDepthFound, depth);
    } else if (char === '}' || char === ']') {
      depth--;
    }
  }
  
  if (maxDepthFound > maxDepth) {
    errors.push('Payload nesting too deep');
  }
  
  // Check for excessive array/object count
  const objectCount = (jsonString.match(/[{[]/g) || []).length;
  if (objectCount > 100) {
    errors.push('Too many nested objects/arrays');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}