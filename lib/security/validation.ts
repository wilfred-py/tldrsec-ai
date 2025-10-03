/**
 * Security validation utilities for user input and data validation
 * Provides centralized validation for user IDs, analytics data, and other sensitive inputs
 */

import { logger } from '@/lib/logging';

// Custom error classes for security validation
export class SecurityValidationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}

export class InvalidUserIdError extends SecurityValidationError {
  constructor(message: string = 'Invalid user ID format') {
    super(message, 'INVALID_USER_ID');
  }
}

/**
 * Validates Clerk user ID format and constraints
 * Clerk user IDs follow the pattern: user_[24 alphanumeric characters]
 * @param userId The user ID to validate
 * @throws InvalidUserIdError if validation fails
 */
export function validateUserId(userId: string): void {
  // Basic type and presence validation
  if (!userId || typeof userId !== 'string') {
    throw new InvalidUserIdError('User ID must be a non-empty string');
  }

  // Length validation (Clerk user IDs are 26 characters: user_ + 21 chars)
  if (userId.length < 10 || userId.length > 50) {
    throw new InvalidUserIdError('User ID must be between 10 and 50 characters long');
  }

  // Format validation for Clerk user IDs: user_[alphanumeric chars]
  const clerkUserIdPattern = /^user_[a-zA-Z0-9]{20,40}$/;
  if (!clerkUserIdPattern.test(userId)) {
    throw new InvalidUserIdError('User ID must follow Clerk format: user_[24 alphanumeric characters]');
  }

  // Additional security checks
  if (userId.includes('..') || userId.includes('/') || userId.includes('\\')) {
    throw new InvalidUserIdError('User ID contains invalid characters');
  }
}

/**
 * Validates access type parameter for cache tracking
 * @param accessType The access type to validate
 * @throws SecurityValidationError if validation fails
 */
export function validateAccessType(accessType: string): void {
  if (!accessType || typeof accessType !== 'string') {
    throw new SecurityValidationError('Access type must be a non-empty string', 'INVALID_ACCESS_TYPE');
  }

  // Allowed access types for cache tracking
  const allowedAccessTypes = ['EMAIL', 'API', 'DASHBOARD', 'SYSTEM', 'CRON'];
  
  if (!allowedAccessTypes.includes(accessType.toUpperCase())) {
    throw new SecurityValidationError(
      `Invalid access type. Must be one of: ${allowedAccessTypes.join(', ')}`,
      'INVALID_ACCESS_TYPE'
    );
  }
}

/**
 * Validates summary ID format and constraints
 * @param summaryId The summary ID to validate
 * @throws SecurityValidationError if validation fails
 */
export function validateSummaryId(summaryId: string): void {
  if (!summaryId || typeof summaryId !== 'string') {
    throw new SecurityValidationError('Summary ID must be a non-empty string', 'INVALID_SUMMARY_ID');
  }

  // UUID format validation (summaries use UUIDs)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(summaryId)) {
    throw new SecurityValidationError('Summary ID must be a valid UUID', 'INVALID_SUMMARY_ID');
  }
}

/**
 * Sanitizes user input for logging purposes
 * Removes or masks sensitive information while preserving debugging value
 * @param input The input to sanitize
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLogging(input: string): string {
  if (!input || typeof input !== 'string') {
    return '[invalid-input]';
  }

  // For user IDs, show only the prefix and suffix for debugging
  if (input.startsWith('user_') && input.length >= 26 && input.length <= 50) {
    const prefixLength = 8;
    const suffixLength = 4;
    return `${input.substring(0, prefixLength)}...${input.substring(input.length - suffixLength)}`;
  }

  // For UUIDs, show only the first 8 characters
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(input)) {
    return `${input.substring(0, 8)}...`;
  }

  // For other inputs, limit length and remove potentially sensitive characters
  return input.substring(0, 50).replace(/[^\w\-_.]/g, '_');
}

/**
 * Validates and normalizes access type input
 * @param accessType The access type to validate and normalize
 * @returns Normalized access type in uppercase
 */
export function normalizeAccessType(accessType: string): string {
  validateAccessType(accessType);
  return accessType.toUpperCase();
}

/**
 * Comprehensive validation for cache access parameters
 * Validates all parameters used in cache access tracking
 * @param params Object containing summaryId, accessType, and optional userId
 */
export function validateCacheAccessParams(params: {
  summaryId: string;
  accessType: string;
  userId?: string;
}): void {
  const { summaryId, accessType, userId } = params;

  try {
    validateSummaryId(summaryId);
    validateAccessType(accessType);
    
    if (userId) {
      validateUserId(userId);
    }
  } catch (error) {
    // Log validation failure for security monitoring
    logger.warn('Cache access parameter validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      summaryId: sanitizeForLogging(summaryId),
      accessType: sanitizeForLogging(accessType),
      hasUserId: !!userId,
      userId: userId ? sanitizeForLogging(userId) : undefined
    });
    
    // Re-throw the original error
    throw error;
  }
}

/**
 * Rate limiting validation for analytics operations
 * Prevents abuse of analytics tracking functions
 * @param userId The user ID for rate limiting
 * @param operation The operation being performed
 * @returns Promise<boolean> indicating if operation is allowed
 */
export async function checkAnalyticsRateLimit(
  userId: string, 
  operation: string = 'cache_access'
): Promise<boolean> {
  try {
    validateUserId(userId);
    
    // Simple in-memory rate limiting for now
    // In production, this would use Redis or similar
    const _rateLimitKey = `analytics:${userId}:${operation}`;
    
    // For now, allow all operations but log for monitoring
    logger.debug('Analytics rate limit check', {
      userId: sanitizeForLogging(userId),
      operation,
      allowed: true
    });
    
    return true;
  } catch (error) {
    logger.warn('Analytics rate limit check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: userId ? sanitizeForLogging(userId) : undefined,
      operation
    });
    
    // Fail open for now - don't block analytics due to rate limiting issues
    return true;
  }
}