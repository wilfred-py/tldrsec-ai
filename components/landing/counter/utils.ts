/**
 * Utility functions for digit manipulation and formatting
 */

import type { DigitSeparationResult } from './types';

/**
 * Separates a number into individual digit values
 * Uses string split approach for clarity and performance
 *
 * @param count - The number to separate (must be non-negative integer)
 * @returns Array of individual digits (e.g., 147 -> [1, 4, 7])
 *
 * @example
 * ```ts
 * separateDigits(147)  // [1, 4, 7]
 * separateDigits(5)    // [5]
 * separateDigits(0)    // [0]
 * separateDigits(1523) // [1, 5, 2, 3]
 * ```
 */
export function separateDigits(count: number): number[] {
  // Handle edge cases
  if (!Number.isFinite(count) || count < 0) {
    console.warn('[Counter Utils] Invalid count value:', count);
    return [1, 4, 7]; // Fallback to default 147
  }

  // Floor to ensure integer
  const safeCount = Math.floor(count);

  // String split approach (fastest for our use case)
  return safeCount.toString().split('').map(Number);
}

/**
 * Compares two digit arrays and returns separation result with change tracking
 *
 * @param oldCount - Previous count value
 * @param newCount - New count value
 * @returns DigitSeparationResult with change tracking
 */
export function compareDigits(oldCount: number, newCount: number): DigitSeparationResult {
  const oldDigits = separateDigits(oldCount);
  const newDigits = separateDigits(newCount);

  // Check if any digits changed
  const hasChanged = oldDigits.length !== newDigits.length ||
    oldDigits.some((digit, index) => digit !== newDigits[index]);

  // Find indices of changed digits
  const changedIndices: number[] = [];
  const maxLength = Math.max(oldDigits.length, newDigits.length);

  for (let i = 0; i < maxLength; i++) {
    const oldDigit = oldDigits[i] ?? -1;
    const newDigit = newDigits[i] ?? -1;

    if (oldDigit !== newDigit) {
      changedIndices.push(i);
    }
  }

  return {
    digits: newDigits,
    hasChanged,
    changedIndices
  };
}

/**
 * Calculates separator positions for comma formatting
 *
 * @param digitCount - Total number of digits
 * @returns Array of indices where commas should appear (from right)
 *
 * @example
 * ```ts
 * calculateSeparatorPositions(4) // [1] -> 1,234
 * calculateSeparatorPositions(7) // [1, 4] -> 1,234,567
 * ```
 */
export function calculateSeparatorPositions(digitCount: number): number[] {
  const positions: number[] = [];

  // Add separator every 3 digits from the right
  for (let i = 3; i < digitCount; i += 3) {
    positions.push(i);
  }

  return positions;
}

/**
 * Sanitizes count value for safe display
 * Prevents XSS and handles edge cases
 *
 * @param value - Raw count value from API
 * @returns Safe, valid count number
 */
export function sanitizeCount(value: unknown): number {
  // Type guard
  if (typeof value !== 'number') {
    console.warn('[Counter Utils] Invalid count type:', typeof value);
    return 147; // Safe default
  }

  // Range validation
  if (!Number.isFinite(value)) {
    console.warn('[Counter Utils] Non-finite count:', value);
    return 147;
  }

  if (value < 0) {
    console.warn('[Counter Utils] Negative count:', value);
    return 0;
  }

  if (value > 1_000_000) {
    console.warn('[Counter Utils] Suspiciously high count:', value);
    return 1_000_000; // Cap at 1M
  }

  return Math.floor(value);
}
