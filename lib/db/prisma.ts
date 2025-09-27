import { PrismaClient } from '@prisma/client'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: 
// https://pris.ly/d/help/next-js-best-practices

// Define the global variable properly
declare global {
  let prisma: PrismaClient | undefined
}

/**
 * Configure Prisma client with improved connection handling
 * 
 * Note: Connection pool settings are configured via the DATABASE_URL
 * connection string parameters. To improve connection handling:
 * 1. Add ?connection_limit=30 to increase max connections (default is 21)
 * 2. Add &pool_timeout=30 to increase timeout (default is 10 seconds)
 * 3. Add &connection_timeout=20000 to increase connection timeout
 * 
 * Example: postgresql://user:password@host:port/database?connection_limit=30&pool_timeout=30
 */

// Use a singleton pattern to prevent connection pool exhaustion
let prisma: PrismaClient | undefined

// Detect if we're in a build environment
const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.VERCEL && !process.env.DATABASE_URL

// Only initialize if DATABASE_URL is available and not during build time
if (process.env.DATABASE_URL && !isBuildTime) {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
      log: ['error', 'warn'],
      // Optimize for high-concurrency cron jobs with better connection management
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })
  } else {
    if (!global.prisma) {
      global.prisma = new PrismaClient({
        log: ['error', 'warn'],
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        }
      })
    }
    prisma = global.prisma
  }
}

// Export the singleton instance - may be undefined during build time
export { prisma }

/**
 * Get the Prisma client instance with lazy loading pattern
 * This prevents build-time errors when the client hasn't been generated yet
 * @returns PrismaClient instance
 * @throws Error if DATABASE_URL is not available and not in build mode
 */
export function getPrismaClient(): PrismaClient {
  // During build time, throw a more descriptive error
  if (isBuildTime) {
    throw new Error('Database not available during build time. This is expected for static generation.');
  }
  
  if (!prisma) {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    try {
      if (process.env.NODE_ENV === 'production') {
        prisma = new PrismaClient({
          log: ['error', 'warn'],
          datasources: {
            db: {
              url: process.env.DATABASE_URL
            }
          },
          // Enable connection pooling optimizations for production
          __internal: {
            engine: {
              config: {
                engineType: 'binary'
              }
            }
          }
        })
      } else {
        if (!global.prisma) {
          global.prisma = new PrismaClient({
            log: ['error', 'warn'],
            datasources: {
              db: {
                url: process.env.DATABASE_URL
              }
            }
          })
        }
        prisma = global.prisma
      }
    } catch (error) {
      console.error(`Failed to initialize Prisma client: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  return prisma;
}