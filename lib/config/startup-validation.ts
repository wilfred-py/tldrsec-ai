/**
 * Startup Environment Validation
 * Validates critical environment variables at application startup
 * to prevent misconfigurations from reaching production.
 */

import {
  detectDatabaseProvider,
  checkForNewlineIssues,
  validateDatabaseUrl,
  validateDirectUrl,
} from './database-validation';

/**
 * Validation severity levels
 */
export enum ValidationLevel {
  OK = 'ok',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Result of environment validation
 */
export interface EnvironmentValidationResult {
  isValid: boolean;
  level: ValidationLevel;
  errors: string[];
  warnings: string[];
  skipped?: boolean;
}

/**
 * Options for validation behavior
 */
export interface ValidationOptions {
  /** Exit process on critical failure (default: false) */
  exitOnCriticalFailure?: boolean;
  /** Skip validation in test environment (default: false) */
  skipInTest?: boolean;
  /** Skip validation during build phase (default: true) */
  skipDuringBuild?: boolean;
}

/**
 * Detect if we're in a build phase (Next.js build, Vercel build, etc.)
 * During builds, environment variables may not be available
 */
function isBuildPhase(): boolean {
  // Vercel build phase detection
  if (process.env.VERCEL_ENV === undefined && process.env.VERCEL) {
    // VERCEL is set but VERCEL_ENV is not - we're in build phase
    return true;
  }

  // Next.js build detection via next build command
  // During `next build`, the phase is 'phase-production-build'
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return true;
  }

  // Check if we're running next build directly
  // process.argv might contain 'build' when running npm run build
  const isNextBuild =
    process.argv.some((arg) => arg.includes('next') || arg.includes('build')) &&
    !process.env.DATABASE_URL;

  if (isNextBuild) {
    return true;
  }

  // Cloudflare Worker build phase - no DATABASE_URL needed
  if (process.env.CF_PAGES || process.env.WORKERS_RS_VERSION) {
    return true;
  }

  return false;
}

/**
 * Validate production environment configuration
 * Checks critical environment variables for common misconfigurations
 */
export function validateProductionEnvironment(
  options: ValidationOptions = {}
): EnvironmentValidationResult {
  const { exitOnCriticalFailure = false, skipInTest = false, skipDuringBuild = true } = options;

  // Skip validation in test environment if requested
  if (skipInTest && process.env.NODE_ENV === 'test') {
    return {
      isValid: true,
      level: ValidationLevel.OK,
      errors: [],
      warnings: [],
      skipped: true,
    };
  }

  // Skip validation during build phase (Next.js build, Vercel build, etc.)
  // Environment variables are not available during build time
  if (skipDuringBuild && isBuildPhase()) {
    return {
      isValid: true,
      level: ValidationLevel.OK,
      errors: [],
      warnings: [],
      skipped: true,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    errors.push('DATABASE_URL environment variable is not set');
  } else {
    // Check for newlines
    if (checkForNewlineIssues(databaseUrl)) {
      errors.push(
        'CRITICAL: DATABASE_URL contains newline characters. This is likely a copy-paste error.'
      );
    }

    // Check provider
    const provider = detectDatabaseProvider(databaseUrl);
    if (provider === 'neon') {
      errors.push(
        'CRITICAL: DATABASE_URL points to Neon database. The codebase requires Supabase with app/pipeline schemas.'
      );
    }

    // Validate URL format and configuration
    const urlValidation = validateDatabaseUrl(databaseUrl);
    if (!urlValidation.isValid) {
      errors.push(...urlValidation.errors);
    }

    // Check for pgbouncer on transaction mode
    if (databaseUrl.includes(':6543') && !databaseUrl.includes('pgbouncer=true')) {
      warnings.push(
        'DATABASE_URL on port 6543 (transaction mode) should include ?pgbouncer=true'
      );
    }
  }

  // Check DIRECT_URL
  const directUrl = process.env.DIRECT_URL;

  if (!directUrl) {
    warnings.push(
      'DIRECT_URL not set. Required for Prisma migrations and advisory locks.'
    );
  } else {
    // Validate DIRECT_URL
    const directValidation = validateDirectUrl(directUrl);
    if (!directValidation.isValid) {
      errors.push(...directValidation.errors.map((e) => `DIRECT_URL: ${e}`));
    }
    warnings.push(...directValidation.warnings.map((w) => `DIRECT_URL: ${w}`));
  }

  // Determine validation level
  let level: ValidationLevel;
  if (errors.length > 0) {
    level = ValidationLevel.CRITICAL;
  } else if (warnings.length > 0) {
    level = ValidationLevel.WARNING;
  } else {
    level = ValidationLevel.OK;
  }

  const result: EnvironmentValidationResult = {
    isValid: errors.length === 0,
    level,
    errors,
    warnings,
  };

  // Handle critical failures
  if (!result.isValid && exitOnCriticalFailure) {
    console.error('\n========================================');
    console.error('CRITICAL: Environment Validation Failed');
    console.error('========================================\n');
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error('\n');
    if (warnings.length > 0) {
      console.error('Warnings:');
      warnings.forEach((warning) => console.error(`  - ${warning}`));
      console.error('\n');
    }
    console.error('Please fix the above issues and restart the application.\n');
    process.exit(1);
  }

  return result;
}

/**
 * Run validation and log results (for use at app startup)
 */
export function validateEnvironmentOnStartup(): void {
  const result = validateProductionEnvironment({
    skipInTest: true,
    exitOnCriticalFailure: process.env.NODE_ENV === 'production',
  });

  if (result.skipped) {
    return; // Silent in test environment
  }

  if (result.level === ValidationLevel.WARNING) {
    console.warn('\n[Environment Validation] Warnings detected:');
    result.warnings.forEach((w) => console.warn(`  - ${w}`));
    console.warn('');
  }

  if (result.level === ValidationLevel.OK) {
    console.log('[Environment Validation] All checks passed');
  }
}
