/**
 * Supabase Database Configuration
 *
 * This module provides typed configuration for Supabase PostgreSQL connections.
 * It supports both pooled (transaction mode) and direct (session mode) connections.
 *
 * Connection Types:
 * - Transaction Mode (port 6543): For regular queries via Supavisor pooler
 * - Session Mode (port 5432): For migrations, advisory locks, and prepared statements
 * - Direct Connection: For IPv6 environments connecting directly to Postgres
 *
 * @see https://supabase.com/docs/guides/database/connecting-to-postgres
 */

/**
 * Supabase connection configuration
 */
export interface SupabaseConfig {
  /** Project reference ID (e.g., 'ipwlykhekrjfvejduotm') */
  projectRef: string;

  /** Supabase project URL (e.g., 'https://ipwlykhekrjfvejduotm.supabase.co') */
  projectUrl: string;

  /** Transaction mode pooled connection URL (port 6543) */
  pooledUrl: string | undefined;

  /** Session mode direct connection URL (port 5432) */
  directUrl: string | undefined;

  /** Whether Supabase is configured */
  isConfigured: boolean;

  /** Whether we're using Supabase or Neon (for migration period) */
  isActive: boolean;
}

/**
 * Connection retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Initial delay in milliseconds */
  initialDelayMs: number;

  /** Maximum delay in milliseconds */
  maxDelayMs: number;

  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Default retry configuration for Supabase connections
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Extract project reference from Supabase URL
 */
function extractProjectRef(url: string): string | null {
  // Pattern: https://[project-ref].supabase.co
  const urlMatch = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
  if (urlMatch) return urlMatch[1];

  // Pattern: postgres://postgres.[project-ref]:password@...
  const connMatch = url.match(/postgres:\/\/postgres\.([a-z0-9]+):/);
  if (connMatch) return connMatch[1];

  return null;
}

/**
 * Get Supabase configuration from environment variables
 */
export function getSupabaseConfig(): SupabaseConfig {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const pooledUrl = process.env.SUPABASE_DATABASE_URL;
  const directUrl = process.env.SUPABASE_DIRECT_URL;

  // Extract project ref from any available URL
  const projectRef =
    extractProjectRef(projectUrl) ||
    extractProjectRef(pooledUrl || '') ||
    extractProjectRef(directUrl || '') ||
    '';

  const isConfigured = !!(projectUrl && (pooledUrl || directUrl));

  // Supabase is active when both DATABASE_URL and SUPABASE_DATABASE_URL point to the same database
  // For now, check if SUPABASE_DATABASE_URL is set and different from Neon
  const isActive =
    isConfigured &&
    pooledUrl !== undefined &&
    !pooledUrl.includes('neon.tech');

  return {
    projectRef,
    projectUrl,
    pooledUrl,
    directUrl,
    isConfigured,
    isActive,
  };
}

/**
 * Validate Supabase configuration
 * @throws Error if configuration is invalid
 */
export function validateSupabaseConfig(): void {
  const config = getSupabaseConfig();

  if (!config.isConfigured) {
    throw new Error(
      'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DATABASE_URL environment variables.'
    );
  }

  if (!config.projectRef) {
    throw new Error('Could not extract Supabase project reference from URL.');
  }

  if (!config.pooledUrl && !config.directUrl) {
    throw new Error(
      'At least one of SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL must be set.'
    );
  }
}

/**
 * Get the appropriate database URL based on connection type
 * @param useDirectConnection - Use direct connection (session mode) instead of pooled
 */
export function getSupabaseDatabaseUrl(useDirectConnection = false): string {
  const config = getSupabaseConfig();

  if (useDirectConnection) {
    if (!config.directUrl) {
      throw new Error(
        'SUPABASE_DIRECT_URL not configured. Direct connections require session mode URL.'
      );
    }
    return config.directUrl;
  }

  if (!config.pooledUrl) {
    // Fall back to direct URL if pooled is not available
    if (config.directUrl) {
      console.warn(
        'SUPABASE_DATABASE_URL not configured. Falling back to SUPABASE_DIRECT_URL.'
      );
      return config.directUrl;
    }
    throw new Error(
      'SUPABASE_DATABASE_URL not configured. Set the pooled connection URL.'
    );
  }

  return config.pooledUrl;
}

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a database operation with retry logic
 * @param operation - The async operation to execute
 * @param config - Retry configuration
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on configuration errors
      if (
        lastError.message.includes('not configured') ||
        lastError.message.includes('not set')
      ) {
        throw lastError;
      }

      if (attempt < config.maxRetries) {
        console.warn(
          `Database operation failed (attempt ${attempt}/${config.maxRetries}): ${lastError.message}`
        );
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Check if we can connect to Supabase
 * This is useful for graceful degradation when connection is unavailable
 */
export async function canConnectToSupabase(): Promise<boolean> {
  const config = getSupabaseConfig();

  if (!config.isConfigured) {
    return false;
  }

  // Dynamic import to avoid circular dependencies
  const { PrismaClient } = await import('@prisma/client');

  const url = config.pooledUrl || config.directUrl;
  if (!url) return false;

  const testClient = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    await testClient.$queryRaw`SELECT 1`;
    await testClient.$disconnect();
    return true;
  } catch {
    await testClient.$disconnect();
    return false;
  }
}

/**
 * Database schema diagnostic result
 */
export interface SchemaDiagnostic {
  /** Whether the expected schemas exist */
  hasExpectedSchemas: boolean;
  /** List of schemas found in database */
  foundSchemas: string[];
  /** Whether we're connected to Neon (old) or Supabase (new) */
  databaseType: 'neon' | 'supabase' | 'unknown';
  /** Whether the multi-schema migration is complete */
  migrationComplete: boolean;
  /** Human-readable status message */
  message: string;
}

/**
 * Check database schema configuration
 * Detects if we're connected to Neon (pre-migration) or Supabase (post-migration)
 * and whether the expected schemas exist
 */
export async function checkDatabaseSchemas(): Promise<SchemaDiagnostic> {
  // Dynamic import to avoid circular dependencies
  const { getPrismaClient } = await import('./prisma');

  const databaseUrl = process.env.DATABASE_URL || '';
  const isNeon = databaseUrl.includes('neon.tech');
  const isSupabase = databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.supabase.com');

  const databaseType: 'neon' | 'supabase' | 'unknown' =
    isNeon ? 'neon' : isSupabase ? 'supabase' : 'unknown';

  try {
    const prisma = getPrismaClient();

    // Query existing schemas
    interface SchemaRow {
      schema_name: string;
    }

    const schemas = await prisma.$queryRaw<SchemaRow[]>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name IN ('app', 'pipeline', 'public')
    `;

    const foundSchemas = schemas.map(s => s.schema_name);
    const hasAppSchema = foundSchemas.includes('app');
    const hasPipelineSchema = foundSchemas.includes('pipeline');
    const hasExpectedSchemas = hasAppSchema && hasPipelineSchema;
    const migrationComplete = hasExpectedSchemas && databaseType === 'supabase';

    let message: string;
    if (migrationComplete) {
      message = 'Database configured correctly with app and pipeline schemas on Supabase.';
    } else if (hasExpectedSchemas && databaseType === 'neon') {
      message = 'WARNING: Schemas exist but connected to Neon. Update DATABASE_URL to point to Supabase.';
    } else if (!hasExpectedSchemas && databaseType === 'neon') {
      message = 'ERROR: Connected to Neon database which only has public schema. The codebase requires Supabase with app and pipeline schemas. Update DATABASE_URL in Vercel to point to Supabase.';
    } else if (!hasExpectedSchemas) {
      message = `ERROR: Missing required schemas. Found: [${foundSchemas.join(', ')}]. Expected: [app, pipeline].`;
    } else {
      message = `Database type: ${databaseType}, schemas: [${foundSchemas.join(', ')}]`;
    }

    return {
      hasExpectedSchemas,
      foundSchemas,
      databaseType,
      migrationComplete,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for schema-related errors
    if (errorMessage.includes('does not exist') && errorMessage.includes('pipeline')) {
      return {
        hasExpectedSchemas: false,
        foundSchemas: ['public'],
        databaseType,
        migrationComplete: false,
        message: `ERROR: DATABASE_URL points to ${databaseType} database without required schemas. The pipeline schema does not exist. Update DATABASE_URL to point to Supabase with app and pipeline schemas.`,
      };
    }

    return {
      hasExpectedSchemas: false,
      foundSchemas: [],
      databaseType,
      migrationComplete: false,
      message: `ERROR: Unable to check schemas: ${errorMessage}`,
    };
  }
}
