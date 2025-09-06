import { PrismaClient } from '@prisma/client'

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
let prisma: PrismaClient

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
    // Optimize for high-concurrency cron jobs
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

// Export the singleton instance
export { prisma }

/**
 * Get the Prisma client instance with lazy loading pattern
 * This prevents build-time errors when the client hasn't been generated yet
 * @returns PrismaClient instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    try {
      if (process.env.NODE_ENV === 'production') {
        prisma = new PrismaClient({
          log: ['error', 'warn'],
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
    } catch (error) {
      console.error(`Failed to initialize Prisma client: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  return prisma;
}