/**
 * CRON_SECRET Sanitization Utilities
 *
 * Provides defensive sanitization for CRON_SECRET environment variables
 * to prevent HMAC authentication failures caused by:
 * - Trailing newline characters (\n) from `vercel env pull`
 * - Literal backslash-n sequences (\\n) from CLI escaping issues
 * - Leading/trailing whitespace from copy-paste errors
 *
 * The Vercel side already uses .trim() on CRON_SECRET. This module
 * ensures the Cloudflare Worker side handles contamination similarly,
 * eliminating HMAC signature mismatches that caused 13+ hour stalls.
 *
 * @see docs/plans/2026-01-26-pipeline-resilience-zero-intervention.md Phase 1
 */

import { createHmac } from 'crypto';

/**
 * Sanitizes CRON_SECRET by removing common contamination:
 * - Trailing newline characters (\n)
 * - Literal backslash-n sequences (\\n)
 * - Leading/trailing whitespace
 *
 * This mirrors the defensive handling on the Vercel side.
 *
 * @param secret - The potentially contaminated CRON_SECRET
 * @returns The sanitized secret, safe for HMAC signing
 *
 * @example
 * ```typescript
 * // Handle contaminated secret from env
 * const clean = sanitizeCronSecret(process.env.CRON_SECRET);
 * const signature = await generateHmacSignature(clean, payload);
 * ```
 */
export function sanitizeCronSecret(secret: string | null | undefined): string {
  if (!secret) {
    return '';
  }

  // Order matters: remove contamination first, then trim
  // This handles cases like "  secret  \n" correctly
  return secret
    .replace(/\\n/g, '') // Remove literal \n (backslash followed by n)
    .replace(/\n/g, '') // Remove actual newline characters
    .trim(); // Trim after removing \n to catch whitespace before \n
}

/**
 * Generates an HMAC-SHA256 signature for cron endpoint authentication.
 *
 * This function is used for:
 * 1. Testing that sanitized secrets produce matching signatures
 * 2. Verifying HMAC implementation consistency between Vercel and Cloudflare
 *
 * @param secret - The sanitized CRON_SECRET
 * @param payload - The payload to sign (format: `${timestamp}:${method}:${path}`)
 * @returns Hex-encoded HMAC-SHA256 signature
 *
 * @example
 * ```typescript
 * const payload = `${Date.now()}:GET:/api/cron/tier-aware`;
 * const signature = await generateHmacSignature(secret, payload);
 * // Use signature in x-hmac-signature header
 * ```
 */
export async function generateHmacSignature(
  secret: string,
  payload: string
): Promise<string> {
  // Use Node.js crypto module for HMAC generation
  // This mirrors the Web Crypto API used in Cloudflare Workers
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Validates that a CRON_SECRET meets security requirements.
 *
 * @param secret - The secret to validate (pre-sanitization)
 * @returns Validation result with any errors
 *
 * @example
 * ```typescript
 * const result = validateCronSecret(process.env.CRON_SECRET);
 * if (!result.isValid) {
 *   console.error('Invalid CRON_SECRET:', result.errors);
 * }
 * ```
 */
export function validateCronSecret(secret: string | null | undefined): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedLength: number;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!secret) {
    errors.push('CRON_SECRET is not set');
    return { isValid: false, errors, warnings, sanitizedLength: 0 };
  }

  const sanitized = sanitizeCronSecret(secret);
  const sanitizedLength = sanitized.length;

  // Check minimum length
  if (sanitizedLength < 32) {
    errors.push(
      `CRON_SECRET too short: ${sanitizedLength} chars (minimum 32)`
    );
  }

  // Check for contamination (informational)
  if (secret.length !== sanitizedLength) {
    warnings.push(
      `CRON_SECRET contained contamination: original ${secret.length} chars, sanitized ${sanitizedLength} chars`
    );
  }

  // Check for literal \n
  if (secret.includes('\\n')) {
    warnings.push('CRON_SECRET contained literal backslash-n sequences');
  }

  // Check for actual newlines
  if (secret.includes('\n')) {
    warnings.push('CRON_SECRET contained actual newline characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitizedLength,
  };
}
