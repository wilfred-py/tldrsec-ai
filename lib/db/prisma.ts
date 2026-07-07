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

// NOTE: Environment validation removed from module load.
// Validation was causing Vercel build failures since it runs during
// "Collecting page data" phase when DATABASE_URL is not available.

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

// Detect if we're in a build environment or Next.js prerendering phase
// During Next.js build, we should NOT attempt database connections
// This constant is only used for the module-level initialization
const isBuildTime = (
  // Standard build detection (no DATABASE_URL)
  (process.env.NODE_ENV === 'production' && !process.env.VERCEL && !process.env.DATABASE_URL) ||
  // Next.js static generation phase detection
  process.env.NEXT_PHASE === 'phase-production-build'
)

/**
 * Runtime check if we're in a build environment.
 * This function evaluates at runtime, not module load time.
 * Used by getPrismaClient() to detect if called during build/prerendering.
 */
function isRuntimeBuildPhase(): boolean {
  // Check if NEXT_PHASE indicates we're in build/prerendering
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return true;
  }
  // Check if DATABASE_URL is missing in production (shouldn't happen at runtime)
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    return true;
  }
  return false;
}

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
  // During build time, return a stub client to allow module imports during static generation
  // The routes are marked with dynamic = 'force-dynamic' so they won't actually execute
  // IMPORTANT: Use runtime check function, not the module-level constant, to properly detect
  // if we're being called during Next.js prerendering (which happens AFTER initial module load)
  if (isRuntimeBuildPhase()) {
    console.warn('⚠️  getPrismaClient() called during build time - returning stub client');
    // Return a Proxy that will throw if any method is actually called
    return new Proxy({} as PrismaClient, {
      get: () => {
        throw new Error('Database not available during build time. This stub client should not be used at runtime.');
      }
    });
  }
  
  if (!prisma) {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    try {
      if (process.env.NODE_ENV === 'production') {
        // Check if using Supabase pooler (pgbouncer) - don't add extra connection params
        // Supabase pooler handles connection pooling, and extra params can cause auth errors
        // like "FATAL: Tenant or user not found"
        const isSupabasePooler = process.env.DATABASE_URL?.includes('pooler.supabase.com') &&
                                  process.env.DATABASE_URL?.includes('pgbouncer=true');

        // Only add connection pool params for non-Supabase connections
        // For Supabase pooler, let pgbouncer handle connection management
        const connectionUrl = isSupabasePooler
          ? process.env.DATABASE_URL
          : (process.env.DATABASE_URL?.includes('connection_limit')
              ? process.env.DATABASE_URL
              : `${process.env.DATABASE_URL}${process.env.DATABASE_URL?.includes('?') ? '&' : '?'}connection_limit=30&pool_timeout=30&connect_timeout=60&idle_timeout=600&max_uses=7500`);

        prisma = new PrismaClient({
          log: ['error', 'warn'],
          datasources: {
            db: {
              url: connectionUrl
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