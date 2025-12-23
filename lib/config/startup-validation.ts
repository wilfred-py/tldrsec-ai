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
 * During builds, environment variables may not be available.
 *
 * The key insight is: if DATABASE_URL is not set, we're likely in build phase.
 * At runtime, DATABASE_URL should always be set (that's what we're validating).
 * So we use the absence of DATABASE_URL combined with build indicators.
 */
function isBuildPhase(): boolean {
  // If DATABASE_URL is set, we're definitely at runtime, not build time
  if (process.env.DATABASE_URL) {
    return false;
  }

  // DATABASE_URL is not set. Check if we're in a known build environment:

  // 1. Vercel build: VERCEL is set (but DATABASE_URL is not available during build)
  if (process.env.VERCEL === '1') {
    return true;
  }

  // 2. CI environment (GitHub Actions, etc.)
  if (process.env.CI === 'true') {
    return true;
  }

  // 3. Next.js build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return true;
  }

  // 4. Cloudflare build
  if (process.env.CF_PAGES || process.env.WORKERS_RS_VERSION) {
    return true;
  }

  // 5. Common build tool indicators
  if (process.env.npm_lifecycle_event === 'build') {
    return true;
  }

  // 6. If NODE_ENV is not 'production', we might be in build/dev mode
  // and DATABASE_URL might legitimately not be set yet
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  // At this point: DATABASE_URL is not set, NODE_ENV is production,
  // and no build indicators are present. This is a real runtime issue.
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
