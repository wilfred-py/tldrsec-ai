/**
 * Database URL Validation
 * Validates database connection strings and detects common misconfigurations
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  provider: 'supabase' | 'neon' | 'unknown';
}

/**
 * Detect database provider from URL
 */
export function detectDatabaseProvider(url: string): 'supabase' | 'neon' | 'unknown' {
  if (url.includes('supabase.com') || url.includes('supabase.co') || url.includes('pooler.supabase.com')) {
    return 'supabase';
  }
  if (url.includes('neon.tech')) {
    return 'neon';
  }
  return 'unknown';
}

/**
 * Check for newline or carriage return characters
 */
export function checkForNewlineIssues(url: string): boolean {
  return url.includes('\n') || url.includes('\r');
}

/**
 * Validate a database URL for use with this application
 */
export function validateDatabaseUrl(url: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provider = detectDatabaseProvider(url);

  // Check 1: No newline characters
  if (checkForNewlineIssues(url)) {
    errors.push('DATABASE_URL contains newline characters');
  }

  // Check 2: Must be Supabase (not Neon)
  if (provider === 'neon') {
    errors.push('DATABASE_URL points to Neon database. Update to Supabase.');
  }

  // Check 3: Valid URL format
  try {
    new URL(url.trim());
  } catch {
    errors.push('DATABASE_URL is not a valid URL format');
  }

  // Check 4: Transaction mode should have pgbouncer parameter
  if (url.includes(':6543') && !url.includes('pgbouncer=true')) {
    warnings.push('Transaction mode (port 6543) should include ?pgbouncer=true');
  }

  // Check 5: Session mode should NOT have pgbouncer parameter
  if (url.includes(':5432') && url.includes('pgbouncer=true')) {
    warnings.push('Session mode (port 5432) should not include pgbouncer parameter');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    provider,
  };
}

/**
 * Validate DIRECT_URL for migrations
 */
export function validateDirectUrl(url: string): ValidationResult {
  const result = validateDatabaseUrl(url);

  // Additional check: DIRECT_URL should use port 5432
  if (!url.includes(':5432')) {
    result.warnings.push('DIRECT_URL should use port 5432 (session mode) for migrations');
  }

  return result;
}
