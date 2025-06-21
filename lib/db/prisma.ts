import { PrismaClient } from '../generated/prisma'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: 
// https://pris.ly/d/help/next-js-best-practices

// Define the global variable properly
declare global {
  var prisma: PrismaClient | undefined
}

/**
 * Wrapper function to retry database operations with exponential backoff
 * @param operation Function that performs the database operation
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in milliseconds
 * @returns Result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 100
): Promise<T> {
  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if the error is retryable (connection-related)
      const isRetryable = 
        error.message?.includes('Connection') || 
        error.message?.includes('timeout') || 
        error.message?.includes('pool') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('connection reset') ||
        error.message?.includes('closed') ||
        error.code === 'P1001' || // Authentication error
        error.code === 'P1002' || // Connection error
        error.code === 'P1008' || // Operations timeout
        error.code === 'P1017';   // Server closed the connection
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`Database operation failed after ${attempt + 1} attempts:`, error);
        throw error;
      }
      
      console.warn(`Database operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
      
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  
  // This should never be reached due to the throw in the loop
  throw lastError!;
}

// Create a Prisma client with connection pooling optimized for serverless
const createPrismaClient = () => {
  return new PrismaClient({
    log: ['error', 'warn'],
    // Connection pooling configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Add connection timeout
    connectionTimeout: 10000, // 10 seconds
  });
};

// Use a try-catch to handle potential initialization errors
let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }
  prisma = global.prisma;
}

// Extend the Prisma client with retry capabilities
const prismaWithRetry = prisma as PrismaClient & {
  $withRetry: typeof withRetry;
};

prismaWithRetry.$withRetry = withRetry;

export { prismaWithRetry as prisma };