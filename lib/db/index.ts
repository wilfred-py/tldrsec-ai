/**
 * Database client exports
 *
 * This file centralizes database client exports to prevent circular dependencies
 * and ensure consistent client initialization across the application.
 */

export { prisma, getPrismaClient } from './prisma';

// Supabase configuration exports (for migration)
export {
  getSupabaseConfig,
  getSupabaseDatabaseUrl,
  validateSupabaseConfig,
  canConnectToSupabase,
  checkDatabaseSchemas,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  type SupabaseConfig,
  type RetryConfig,
  type SchemaDiagnostic,
} from './supabase-config';
