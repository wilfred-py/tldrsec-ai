/**
 * Database Retry Wrapper
 *
 * Retry-with-backoff for cold-start and transient connection errors at the
 * Prisma seam. The repo's deepened **Resilience** module
 * (`lib/error-handling/retry.ts`) owns the canonical retry loop for outbound
 * network seams; this preset keeps the Prisma-specific error-code mapping
 * (`P1001` / `P1008` / `P1017` and `PrismaClientInitializationError`) local
 * to the database seam.
 */

import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!shouldRetry(error, attempt, config.maxRetries)) {
        throw error;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );

      console.warn(
        `Database operation failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : String(error)
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

function shouldRetry(error: unknown, currentAttempt: number, maxRetries: number): boolean {
  if (currentAttempt >= maxRetries) {
    return false;
  }

  if (error instanceof PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof PrismaClientKnownRequestError) {
    return (
      error.code === 'P1001' ||
      error.code === 'P1008' ||
      error.code === 'P1017'
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("can't reach database server") ||
      message.includes('connection timeout') ||
      message.includes('server closed the connection') ||
      message.includes('timed out')
    );
  }

  return false;
}

export const dbRetry = {
  query: <T>(operation: () => Promise<T>) =>
    withRetry(operation, { maxRetries: 3, baseDelay: 500, maxDelay: 5000 }),
  mutation: <T>(operation: () => Promise<T>) =>
    withRetry(operation, { maxRetries: 2, baseDelay: 1000, maxDelay: 8000 }),
  healthCheck: <T>(operation: () => Promise<T>) =>
    withRetry(operation, { maxRetries: 5, baseDelay: 200, maxDelay: 2000 }),
};
