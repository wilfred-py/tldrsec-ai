/**
 * Cryptographically Secure Random Number Generation Utility
 * 
 * This module provides secure alternatives to Math.random() for security-sensitive
 * operations including ID generation, execution tracking, and correlation IDs.
 * 
 * Security Requirements:
 * - Uses Node.js crypto.randomBytes() for cryptographically secure randomness
 * - Prevents predictable ID generation that could be exploited
 * - Maintains sufficient entropy for uniqueness guarantees
 * - Provides fallback error handling for crypto operations
 */

import { randomBytes, createHash } from 'crypto';
import { logger } from '../logging';

/**
 * Generates cryptographically secure random bytes
 * @param length Number of random bytes to generate
 * @returns Buffer containing secure random bytes
 * @throws Error if crypto operation fails
 */
function generateSecureRandomBytes(length: number): Buffer {
  try {
    return randomBytes(length);
  } catch (error) {
    logger.error('Failed to generate secure random bytes', { 
      error: error instanceof Error ? error.message : String(error),
      requestedLength: length 
    });
    throw new Error('Cryptographic random generation failed');
  }
}

/**
 * Generates a cryptographically secure execution ID
 * @param prefix Optional prefix for the execution ID
 * @returns Secure execution ID with timestamp and cryptographic randomness
 */
export function generateSecureExecutionId(prefix: string = 'exec'): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(16);
  const randomHex = secureBytes.toString('hex').substring(0, 16);
  return `${prefix}-${timestamp}-${randomHex}`;
}

/**
 * Generates a cryptographically secure correlation ID for tracing
 * @param operation Operation type for the correlation ID
 * @returns Secure correlation ID with operation context
 */
export function generateSecureCorrelationId(operation: string): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(12);
  const randomSuffix = secureBytes.toString('hex').substring(0, 12);
  return `${operation}_${timestamp}_${randomSuffix}`;
}

/**
 * Generates a cryptographically secure request ID
 * @param prefix Optional prefix for the request ID
 * @returns Secure request ID suitable for API tracking
 */
export function generateSecureRequestId(prefix: string = 'req'): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(8);
  const randomSuffix = secureBytes.toString('hex').substring(0, 10);
  return `${prefix}_${timestamp}_${randomSuffix}`;
}

/**
 * Generates a cryptographically secure batch ID
 * @param prefix Optional prefix for the batch ID
 * @returns Secure batch ID for processing operations
 */
export function generateSecureBatchId(prefix: string = 'batch'): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(6);
  const randomSuffix = secureBytes.toString('hex').substring(0, 8);
  return `${prefix}-${timestamp}-${randomSuffix}`;
}

/**
 * Generates a cryptographically secure alert ID
 * @returns Secure alert ID for monitoring systems
 */
export function generateSecureAlertId(): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(8);
  const randomSuffix = secureBytes.toString('hex').substring(0, 9);
  return `alert_${timestamp}_${randomSuffix}`;
}

/**
 * Generates a cryptographically secure operation ID
 * @param operationType Type of operation being tracked
 * @returns Secure operation ID with operation context
 */
export function generateSecureOperationId(operationType: string): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(10);
  const randomSuffix = secureBytes.toString('hex').substring(0, 12);
  return `${operationType}-${timestamp}-${randomSuffix}`;
}

/**
 * Generates a cryptographically secure audit ID for database operations
 * @returns Secure audit ID with maximum entropy
 */
export function generateSecureAuditId(): string {
  const timestamp = Date.now().toString(16); // Hexadecimal timestamp
  const secureBytes1 = generateSecureRandomBytes(15);
  const secureBytes2 = generateSecureRandomBytes(15);
  const randomPart1 = secureBytes1.toString('hex').substring(0, 15);
  const randomPart2 = secureBytes2.toString('hex').substring(0, 15);
  return `audit_${timestamp}_${randomPart1}_${randomPart2}`;
}

/**
 * Generates cryptographically secure random bytes as a hex string
 * @param length Number of bytes to generate
 * @returns Hex string representation of random bytes
 */
export function generateSecureHexString(length: number): string {
  const secureBytes = generateSecureRandomBytes(length);
  return secureBytes.toString('hex');
}

/**
 * Generates a cryptographically secure session token
 * @param length Length of the token in bytes (default: 32)
 * @returns Base64-encoded secure session token
 */
export function generateSecureSessionToken(length: number = 32): string {
  const secureBytes = generateSecureRandomBytes(length);
  return secureBytes.toString('base64url');
}

/**
 * Generates a cryptographically secure challenge for authentication
 * @returns Secure challenge string for auth protocols
 */
export function generateSecureChallenge(): string {
  const timestamp = Date.now();
  const secureBytes = generateSecureRandomBytes(32);
  const challenge = secureBytes.toString('base64url');
  return `${timestamp}.${challenge}`;
}

/**
 * Generates secure jitter for retry mechanisms
 * @param baseDelay Base delay in milliseconds
 * @param jitterFactor Jitter factor (0.0 to 1.0)
 * @returns Jittered delay with cryptographic randomness
 */
export function generateSecureJitter(baseDelay: number, jitterFactor: number = 0.1): number {
  if (jitterFactor < 0 || jitterFactor > 1) {
    throw new Error('Jitter factor must be between 0 and 1');
  }
  
  const secureBytes = generateSecureRandomBytes(4);
  const randomValue = secureBytes.readUInt32BE(0) / 0xFFFFFFFF; // Convert to 0-1 range
  const jitter = baseDelay * jitterFactor * randomValue;
  return baseDelay + jitter;
}

/**
 * Validates that an ID was generated using secure methods
 * @param id ID to validate
 * @param expectedPrefix Expected prefix for the ID
 * @returns True if ID appears to be securely generated
 */
export function validateSecureId(id: string, expectedPrefix?: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  // Check for expected prefix if provided
  if (expectedPrefix && !id.startsWith(expectedPrefix)) {
    return false;
  }
  
  // Check for minimum length and structure
  const parts = id.split(/[-_]/);
  if (parts.length < 3) {
    return false;
  }
  
  // Validate timestamp part (should be numeric)
  const timestampPart = parts[1];
  if (!/^\d+$/.test(timestampPart)) {
    return false;
  }
  
  // Validate random part (should be hex)
  const randomPart = parts[2];
  if (!/^[a-f0-9]+$/i.test(randomPart)) {
    return false;
  }
  
  // Check minimum entropy (at least 8 hex characters)
  if (randomPart.length < 8) {
    return false;
  }
  
  return true;
}

/**
 * Creates a deterministic hash for non-security purposes
 * Used only for caching keys and similar non-sensitive operations
 * @param input Input string to hash
 * @returns SHA-256 hash truncated to 8 characters
 */
export function createDeterministicHash(input: string): string {
  const hash = createHash('sha256');
  hash.update(input);
  return hash.digest('hex').substring(0, 8);
}

/**
 * Security audit function to detect weak random usage
 * @param codeString Code string to audit
 * @returns Array of potential security issues
 */
export function auditRandomUsage(codeString: string): Array<{
  line: number;
  issue: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: string;
}> {
  const issues: Array<{
    line: number;
    issue: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    recommendation: string;
  }> = [];
  
  const lines = codeString.split('\n');
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // Check for Math.random() usage
    if (line.includes('Math.random()')) {
      let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
      
      // High severity for security-sensitive contexts
      if (line.includes('Id') || line.includes('token') || line.includes('secret') || 
          line.includes('session') || line.includes('auth') || line.includes('key')) {
        severity = 'HIGH';
      }
      
      // Low severity for test files or obvious non-security contexts
      if (line.includes('test') || line.includes('mock') || line.includes('random') && 
          (line.includes('delay') || line.includes('jitter'))) {
        severity = 'LOW';
      }
      
      issues.push({
        line: lineNumber,
        issue: 'Math.random() detected - weak randomness',
        severity,
        recommendation: severity === 'HIGH' ? 
          'Replace with generateSecureExecutionId() or similar from lib/security/secure-random.ts' :
          'Consider using crypto.randomBytes() for better randomness'
      });
    }
    
    // Check for weak ID generation patterns
    if (line.includes('.toString(36)') && line.includes('Math.random()')) {
      issues.push({
        line: lineNumber,
        issue: 'Weak ID generation using Math.random().toString(36)',
        severity: 'HIGH',
        recommendation: 'Replace with generateSecureCorrelationId() or generateSecureRequestId()'
      });
    }
  });
  
  return issues;
}