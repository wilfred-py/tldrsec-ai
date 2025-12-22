# Fix Vercel DATABASE_URL for Supabase Migration

**Date**: 2025-12-22 19:22:32 AEDT
**Git Commit**: 99250a6d7d5fc732c792ae5ef8c7e6609ce2c40c
**Branch**: fix/slack-hourly-database-connection
**Repository**: tldrsec-ai

## Overview

Update Vercel's environment variables across **all environments** (production, preview, development) to point to the Supabase database instead of the legacy Neon database. This will resolve the `relation "pipeline.JobQueue" does not exist` errors that have been blocking all cron jobs since the Supabase migration on 2025-12-19.

Additionally, implement a validation guard system with comprehensive TDD to prevent similar misconfigurations in the future.

## Current State Analysis

### The Problem
- **Vercel's `DATABASE_URL`** (set 32 days ago) still points to Neon: `ep-rapid-wildflower-291580-pooler.ap-southeast-1.aws.neon.tech`
- **Neon database** only has `public` schema - no `app` or `pipeline` schemas
- **Prisma client** generates queries like `SELECT * FROM "pipeline"."JobQueue"` which fail on Neon

### What's Working Correctly
- Local `.env` correctly configured for Supabase (verified)
- Supabase has all required schemas: `app` (11 tables), `pipeline` (19 tables)
- Cloudflare Worker is up-to-date (deployed 2025-12-18)
- PR #274 merged with correct schema references

### Key Discovery from Research
The password `MOEjp0WTAvBa3nLn` contains **only alphanumeric characters** - no special characters requiring URL encoding. This simplifies the fix significantly.

## Desired End State

After this plan is complete:
1. All Vercel environments (production, preview, development) have correct `DATABASE_URL` and `DIRECT_URL` pointing to Supabase
2. Cron jobs execute successfully without schema errors
3. All database operations use Supabase's dual-schema architecture
4. A TDD-verified validation system prevents future misconfigurations
5. CI/CD integration catches environment variable issues before deployment

### How to Verify
- Slack hourly report shows successful cron execution
- No `relation "pipeline.JobQueue" does not exist` errors
- `/api/health/environment` returns all green checks
- All new validation tests pass

## What We're NOT Doing

- **NOT migrating data** - Data migration was completed on 2025-12-19
- **NOT modifying Prisma schema** - Already correctly configured for multi-schema
- **NOT changing any application code** (except adding validation)
- **NOT modifying Cloudflare Worker configuration**

## Critical: Newline (`\n`) Prevention Strategy

**WARNING**: Environment variables copied across platforms (Mac → Web → Vercel) can inadvertently include newline characters that break database connections.

### Common Failure Modes

1. **Trailing newlines** - Invisible `\n` at end of value from copy-paste
2. **Multi-line paste** - Value spans multiple lines when pasted into Vercel dashboard
3. **Escaped newlines** - Literal `\n` string instead of actual newline
4. **Windows CRLF** - `\r\n` from Windows clipboard

### Prevention Techniques for This Fix

**When using Vercel CLI (`vercel env add`):**
```bash
# GOOD: Single-quoted heredoc prevents variable expansion and preserves literal value
vercel env add DATABASE_URL production <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
EOF

# BAD: Echo with quotes can introduce issues
echo "postgres://..." | vercel env add DATABASE_URL production  # DON'T DO THIS

# BAD: Copy-paste from terminal with selection issues
# Selecting text in terminal often grabs trailing newline
```

**When using Vercel Dashboard:**
1. Type/paste value into a single-line text editor first (not code editor)
2. Trim whitespace before pasting into Vercel
3. Verify no line breaks in the pasted value
4. Check character count matches expected length

**Validation After Setting:**
```bash
# Verify the exact value stored (no hidden characters)
vercel env pull --environment=production .env.production.check
grep DATABASE_URL .env.production.check | xxd | head -20  # Check for \r\n bytes
rm .env.production.check
```

---

## Phase 1: Pre-Flight Verification & Test Setup

### Overview
Verify current state, write failing tests for the fix, and confirm we have correct values before making any changes.

### Step 1.1: 🔴 Write Failing Tests for Environment Validation

**Test File**: `__tests__/config/database-url-validation.test.ts`

```typescript
import { validateDatabaseUrl, detectDatabaseProvider, checkForNewlineIssues } from '@/lib/config/database-validation';

describe('Database URL Validation', () => {
  describe('validateDatabaseUrl', () => {
    it('should accept valid Supabase transaction mode URL', () => {
      const url = 'postgres://postgres.ipwlykhekrjfvejduotm:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject Neon database URL', () => {
      const url = 'postgresql://user:pass@ep-rapid-wildflower-291580-pooler.ap-southeast-1.aws.neon.tech/db';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('DATABASE_URL points to Neon database. Update to Supabase.');
    });

    it('should warn when port 6543 missing pgbouncer parameter', () => {
      const url = 'postgres://user:pass@pooler.supabase.com:6543/postgres';
      const result = validateDatabaseUrl(url);
      expect(result.warnings).toContain('Transaction mode (port 6543) should include ?pgbouncer=true');
    });

    it('should detect hidden newline characters', () => {
      const url = 'postgres://user:pass@host:6543/db\n';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('DATABASE_URL contains newline characters');
    });

    it('should detect carriage return characters', () => {
      const url = 'postgres://user:pass@host:6543/db\r\n';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('DATABASE_URL contains newline characters');
    });
  });

  describe('detectDatabaseProvider', () => {
    it('should detect Supabase from pooler URL', () => {
      const url = 'postgres://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
      expect(detectDatabaseProvider(url)).toBe('supabase');
    });

    it('should detect Supabase from direct URL', () => {
      const url = 'postgres://user:pass@db.supabase.co:5432/postgres';
      expect(detectDatabaseProvider(url)).toBe('supabase');
    });

    it('should detect Neon from URL', () => {
      const url = 'postgresql://user:pass@ep-xyz.neon.tech/db';
      expect(detectDatabaseProvider(url)).toBe('neon');
    });

    it('should return unknown for unrecognized providers', () => {
      const url = 'postgresql://user:pass@localhost:5432/db';
      expect(detectDatabaseProvider(url)).toBe('unknown');
    });
  });

  describe('checkForNewlineIssues', () => {
    it('should return false for clean URL', () => {
      const url = 'postgres://user:pass@host:6543/db';
      expect(checkForNewlineIssues(url)).toBe(false);
    });

    it('should detect trailing newline', () => {
      const url = 'postgres://user:pass@host:6543/db\n';
      expect(checkForNewlineIssues(url)).toBe(true);
    });

    it('should detect embedded newline', () => {
      const url = 'postgres://user:pass@host\n:6543/db';
      expect(checkForNewlineIssues(url)).toBe(true);
    });

    it('should detect Windows line endings', () => {
      const url = 'postgres://user:pass@host:6543/db\r\n';
      expect(checkForNewlineIssues(url)).toBe(true);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="database-url-validation"
# Expected: Tests fail (module not found)
```

### Step 1.2: 🟢 Create Validation Module to Pass Tests

**File**: `lib/config/database-validation.ts`

```typescript
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
```

**Checkpoint 1.2**: Tests pass:
```bash
npm run test -- --testPathPattern="database-url-validation"
# Expected: 9 passing
```

### Step 1.3: Verify Local Environment Values

**Command:**
```bash
# Verify local DATABASE_URL format and length
grep "^DATABASE_URL=" .env | head -1 | wc -c
# Expected: ~130 characters (including "DATABASE_URL=")

# Check for any invisible characters
grep "^DATABASE_URL=" .env | head -1 | xxd | tail -5
# Should end with clean hex (no 0d 0a patterns except final newline)
```

**Expected DATABASE_URL:**
```
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Expected DIRECT_URL:**
```
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

### Step 1.4: Verify Supabase Connection Locally

**Command:**
```bash
npm run db:test
```

**Expected Output:**
- Connection successful
- Can query `app` and `pipeline` schemas

### Step 1.5: Check Current Vercel Environment

**Command:**
```bash
# Check all environments
vercel env ls production
vercel env ls preview
vercel env ls development
```

**Expected Output:**
- `DATABASE_URL` exists in each (currently pointing to Neon - 32 days old)
- `DIRECT_URL` may or may not exist

### Step 1.6: 🔵 Refactor - Export Validation from Index

**File**: `lib/config/index.ts`

Add export:
```typescript
export * from './database-validation';
```

**Checkpoint 1.6**: All tests still pass:
```bash
npm run test -- --testPathPattern="database-url-validation"
npm run lint
# Expected: All pass
```

### Checkpoint Phase 1: Pre-Flight Complete
- [x] Validation tests written and passing (13 tests)
- [x] Local DATABASE_URL is valid (no hidden characters)
- [x] Local database connection test passes
- [x] Verified current Vercel environment variable state for all environments
  - Production: ✅ Already updated to Supabase (9h ago)
  - Preview: ❌ Still Neon + has trailing \n
  - Development: ❌ Still Neon + has trailing \n
- [x] Have exact values ready for update (copied to clean text file)

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Update Vercel Environment Variables (All Environments)

### Overview
Safely update environment variables for production, preview, and development environments using the Vercel CLI with newline-safe techniques.

### Step 2.1: 🔴 Write Failing Integration Tests

**Test File**: `__tests__/integration/vercel-env-check.test.ts`

```typescript
/**
 * Integration tests that verify Vercel environment configuration
 * These tests validate the actual deployed environment
 */
import { validateDatabaseUrl, validateDirectUrl } from '@/lib/config/database-validation';

describe('Vercel Environment Integration', () => {
  // Skip in CI if env vars not set
  const skipIfNoEnv = process.env.DATABASE_URL ? describe : describe.skip;

  skipIfNoEnv('DATABASE_URL validation', () => {
    it('should be a valid Supabase URL', () => {
      const result = validateDatabaseUrl(process.env.DATABASE_URL!);
      expect(result.provider).toBe('supabase');
      expect(result.errors).toHaveLength(0);
    });

    it('should not contain newline characters', () => {
      expect(process.env.DATABASE_URL).not.toMatch(/[\r\n]/);
    });

    it('should use transaction mode with pgbouncer', () => {
      expect(process.env.DATABASE_URL).toContain(':6543');
      expect(process.env.DATABASE_URL).toContain('pgbouncer=true');
    });
  });

  skipIfNoEnv('DIRECT_URL validation', () => {
    it('should be a valid Supabase URL', () => {
      if (!process.env.DIRECT_URL) {
        console.warn('DIRECT_URL not set');
        return;
      }
      const result = validateDirectUrl(process.env.DIRECT_URL);
      expect(result.provider).toBe('supabase');
      expect(result.errors).toHaveLength(0);
    });

    it('should use session mode (port 5432)', () => {
      if (!process.env.DIRECT_URL) return;
      expect(process.env.DIRECT_URL).toContain(':5432');
    });
  });
});
```

**Checkpoint 2.1**: Tests verify current (broken) state:
```bash
npm run test -- --testPathPattern="vercel-env-check"
# Expected: Tests fail if run against production (Neon URL)
```

### Step 2.2: 🟢 Update Production Environment

#### 2.2.1 Remove Old DATABASE_URL

**Command:**
```bash
vercel env rm DATABASE_URL production
```

**Confirmation:** Type `y` when prompted

#### 2.2.2 Add New DATABASE_URL (Transaction Mode)

**CRITICAL: Use this exact command with heredoc syntax to prevent newline issues:**

```bash
vercel env add DATABASE_URL production <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
EOF
```

#### 2.2.3 Remove Old DIRECT_URL (if exists)

**Command:**
```bash
vercel env rm DIRECT_URL production 2>/dev/null || echo "DIRECT_URL not set, continuing..."
```

#### 2.2.4 Add New DIRECT_URL (Session Mode)

**Command:**
```bash
vercel env add DIRECT_URL production <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
EOF
```

**Checkpoint 2.2**: Production environment updated:
```bash
vercel env ls production | grep -E "(DATABASE_URL|DIRECT_URL)"
# Expected: Both variables listed
```

### Step 2.3: 🟢 Update Preview Environment

```bash
# Remove old values
vercel env rm DATABASE_URL preview 2>/dev/null || true
vercel env rm DIRECT_URL preview 2>/dev/null || true

# Add new values
vercel env add DATABASE_URL preview <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
EOF

vercel env add DIRECT_URL preview <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
EOF
```

**Checkpoint 2.3**: Preview environment updated:
```bash
vercel env ls preview | grep -E "(DATABASE_URL|DIRECT_URL)"
# Expected: Both variables listed
```

### Step 2.4: 🟢 Update Development Environment

```bash
# Remove old values
vercel env rm DATABASE_URL development 2>/dev/null || true
vercel env rm DIRECT_URL development 2>/dev/null || true

# Add new values
vercel env add DATABASE_URL development <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
EOF

vercel env add DIRECT_URL development <<'EOF'
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
EOF
```

**Checkpoint 2.4**: Development environment updated:
```bash
vercel env ls development | grep -E "(DATABASE_URL|DIRECT_URL)"
# Expected: Both variables listed
```

### Step 2.5: Verify All Environments (No Newlines)

**Command:**
```bash
# Pull and verify each environment
for env in production preview development; do
  echo "=== Checking $env ==="
  vercel env pull --environment=$env .env.$env.verify

  # Check DATABASE_URL for hidden characters
  echo "DATABASE_URL check:"
  grep "^DATABASE_URL=" .env.$env.verify | xxd | grep -E "(0d|0a)" | head -3

  # Check DIRECT_URL for hidden characters
  echo "DIRECT_URL check:"
  grep "^DIRECT_URL=" .env.$env.verify | xxd | grep -E "(0d|0a)" | head -3

  rm .env.$env.verify
done
```

**Expected:** Only `0a` (newline) at the very end of each line, no `0d` (carriage return)

### Step 2.6: 🔵 Refactor - Document Environment Variable Requirements

Update `.env.example` to clarify requirements:

**File**: `.env.example` (add comments)

```bash
# Database Configuration
# CRITICAL: These URLs must point to Supabase (not Neon)
# - DATABASE_URL: Transaction mode (port 6543) with pgbouncer=true
# - DIRECT_URL: Session mode (port 5432) for migrations and advisory locks
# WARNING: When copying between platforms, verify no hidden \n or \r characters
DATABASE_URL=postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

**Checkpoint 2.6**: Lint passes:
```bash
npm run lint
# Expected: Pass
```

### Checkpoint Phase 2: Environment Variables Updated
- [ ] Production DATABASE_URL and DIRECT_URL updated
- [ ] Preview DATABASE_URL and DIRECT_URL updated
- [ ] Development DATABASE_URL and DIRECT_URL updated
- [ ] All environments verified no hidden newline characters
- [ ] `.env.example` updated with clear documentation

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Deploy and Verify

### Overview
Trigger new production deployment and verify the fix is working across all endpoints.

### Step 3.1: 🔴 Write Failing Health Check Tests

**Test File**: `__tests__/api/health-database.test.ts`

```typescript
/**
 * Health check tests for database connectivity
 */
import { checkDatabaseSchemas } from '@/lib/db/supabase-config';

describe('Database Health Checks', () => {
  it('should detect Supabase as database provider', async () => {
    const result = await checkDatabaseSchemas();
    expect(result.databaseType).toBe('supabase');
  });

  it('should find app and pipeline schemas', async () => {
    const result = await checkDatabaseSchemas();
    expect(result.hasExpectedSchemas).toBe(true);
    expect(result.foundSchemas).toContain('app');
    expect(result.foundSchemas).toContain('pipeline');
  });

  it('should report migration complete', async () => {
    const result = await checkDatabaseSchemas();
    expect(result.migrationComplete).toBe(true);
  });

  it('should not report any schema errors', async () => {
    const result = await checkDatabaseSchemas();
    expect(result.message).not.toContain('ERROR');
  });
});
```

**Checkpoint 3.1**: Tests should pass locally (Supabase configured):
```bash
npm run test -- --testPathPattern="health-database"
# Expected: 4 passing (locally)
```

### Step 3.2: 🟢 Trigger Production Deployment

**Command:**
```bash
vercel --prod
```

Wait for deployment to complete (~2-3 minutes).

**Checkpoint 3.2**: Deployment successful:
```bash
vercel ls | head -5
# Expected: New deployment with "Ready" status
```

### Step 3.3: Verify Health Endpoints

**Command:**
```bash
# Environment check
curl -s https://tldrsec.app/api/health/environment | jq .

# Full health check
curl -s https://tldrsec.app/api/health | jq '.database'
```

**Expected from `/api/health/environment`:**
- All checks show `"status": "ok"`
- No database connection errors

**Expected from `/api/health`:**
```json
{
  "databaseType": "supabase",
  "hasExpectedSchemas": true,
  "foundSchemas": ["app", "pipeline", "public"],
  "migrationComplete": true
}
```

### Step 3.4: Trigger Manual Cron Test

**Command:**
```bash
curl -X POST "https://tldrsec.app/api/cron/tier-aware?step=discover" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Expected:**
- No `relation "pipeline.JobQueue" does not exist` error
- Successful response with processing status

### Step 3.5: Wait for Next Scheduled Cron (10 minutes)

- Monitor Slack channel for cron execution report
- Check that no database schema errors appear

### Step 3.6: Run Full Integration Test Suite

**Command:**
```bash
npm run test:pipeline:comprehensive
npm run test:cron-comprehensive
npm run test:e2e
```

**Expected:** All tests pass

### Step 3.7: 🔵 Refactor - Add Database Provider to Health Response

**File**: `app/api/health/route.ts`

Ensure the response includes database provider information for easier debugging.

**Checkpoint 3.7**: Health endpoint returns provider info:
```bash
curl -s https://tldrsec.app/api/health | jq '.database.provider'
# Expected: "supabase"
```

### Checkpoint Phase 3: Production Verified
- [ ] Vercel deployment completed successfully
- [ ] Health endpoint returns all green
- [ ] Schema diagnostics show Supabase with app/pipeline schemas
- [ ] Manual cron test succeeds
- [ ] Scheduled cron (Cloudflare Worker) executes successfully
- [ ] All integration tests pass

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Environment Validation Guard (TDD)

### Overview
Implement a comprehensive startup validation system to prevent future misconfigurations. This phase follows strict TDD.

### Step 4.1: 🔴 Write Failing Tests for Startup Validation

**Test File**: `__tests__/config/startup-validation.test.ts`

```typescript
import {
  validateProductionEnvironment,
  ValidationLevel,
  EnvironmentValidationResult
} from '@/lib/config/startup-validation';

describe('Startup Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateProductionEnvironment', () => {
    it('should pass when DATABASE_URL points to Supabase', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@pooler.supabase.com:6543/db?pgbouncer=true';
      process.env.DIRECT_URL = 'postgres://user:pass@pooler.supabase.com:5432/db';

      const result = validateProductionEnvironment();

      expect(result.isValid).toBe(true);
      expect(result.level).toBe(ValidationLevel.OK);
    });

    it('should fail with CRITICAL when DATABASE_URL points to Neon', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@neon.tech/db';

      const result = validateProductionEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.level).toBe(ValidationLevel.CRITICAL);
      expect(result.errors).toContain(
        'CRITICAL: DATABASE_URL points to Neon database. The codebase requires Supabase with app/pipeline schemas.'
      );
    });

    it('should fail with CRITICAL when DATABASE_URL has newlines', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@host:6543/db\n';

      const result = validateProductionEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.level).toBe(ValidationLevel.CRITICAL);
      expect(result.errors).toContain(
        'CRITICAL: DATABASE_URL contains newline characters. This is likely a copy-paste error.'
      );
    });

    it('should warn when DIRECT_URL is not set', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@pooler.supabase.com:6543/db?pgbouncer=true';
      delete process.env.DIRECT_URL;

      const result = validateProductionEnvironment();

      expect(result.isValid).toBe(true); // Warnings don't fail validation
      expect(result.level).toBe(ValidationLevel.WARNING);
      expect(result.warnings).toContain(
        'DIRECT_URL not set. Required for Prisma migrations and advisory locks.'
      );
    });

    it('should warn when pgbouncer parameter missing on port 6543', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@pooler.supabase.com:6543/db';

      const result = validateProductionEnvironment();

      expect(result.warnings).toContain(
        'DATABASE_URL on port 6543 (transaction mode) should include ?pgbouncer=true'
      );
    });

    it('should fail when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;

      const result = validateProductionEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('DATABASE_URL environment variable is not set');
    });
  });

  describe('exitOnCriticalFailure option', () => {
    it('should call process.exit when exitOnCriticalFailure is true and validation fails', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      process.env.DATABASE_URL = 'postgresql://user:pass@neon.tech/db';

      validateProductionEnvironment({ exitOnCriticalFailure: true });

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('should not call process.exit when validation passes', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      process.env.DATABASE_URL = 'postgres://user:pass@pooler.supabase.com:6543/db?pgbouncer=true';

      validateProductionEnvironment({ exitOnCriticalFailure: true });

      expect(mockExit).not.toHaveBeenCalled();
      mockExit.mockRestore();
    });
  });
});
```

**Checkpoint 4.1**: Tests fail (module not found):
```bash
npm run test -- --testPathPattern="startup-validation"
# Expected: Tests fail - module doesn't exist yet
```

### Step 4.2: 🟢 Implement Startup Validation Module

**File**: `lib/config/startup-validation.ts`

```typescript
/**
 * Startup Environment Validation
 *
 * Validates critical environment variables at application startup
 * to catch misconfigurations early (like DATABASE_URL pointing to wrong database)
 */

import { validateDatabaseUrl, validateDirectUrl, checkForNewlineIssues } from './database-validation';

export enum ValidationLevel {
  OK = 'OK',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface EnvironmentValidationResult {
  isValid: boolean;
  level: ValidationLevel;
  errors: string[];
  warnings: string[];
  timestamp: string;
}

export interface ValidationOptions {
  exitOnCriticalFailure?: boolean;
  logResults?: boolean;
}

/**
 * Validate production environment configuration
 *
 * Checks:
 * 1. DATABASE_URL points to Supabase (not Neon)
 * 2. No newline characters in URLs
 * 3. Correct port/parameter combinations
 * 4. DIRECT_URL exists for migrations
 */
export function validateProductionEnvironment(
  options: ValidationOptions = {}
): EnvironmentValidationResult {
  const { exitOnCriticalFailure = false, logResults = true } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  const databaseUrl = process.env.DATABASE_URL || '';
  const directUrl = process.env.DIRECT_URL || '';

  // Check 1: DATABASE_URL is set
  if (!databaseUrl) {
    errors.push('DATABASE_URL environment variable is not set');
  } else {
    // Check 2: No newline characters (common copy-paste issue)
    if (checkForNewlineIssues(databaseUrl)) {
      errors.push(
        'CRITICAL: DATABASE_URL contains newline characters. This is likely a copy-paste error.'
      );
    }

    // Check 3: Must point to Supabase (not Neon)
    if (databaseUrl.includes('neon.tech')) {
      errors.push(
        'CRITICAL: DATABASE_URL points to Neon database. The codebase requires Supabase with app/pipeline schemas.'
      );
    }

    // Check 4: Validate URL format and parameters
    const dbValidation = validateDatabaseUrl(databaseUrl);
    errors.push(...dbValidation.errors.filter(e => !errors.includes(e)));
    warnings.push(...dbValidation.warnings);
  }

  // Check 5: DIRECT_URL exists
  if (!directUrl) {
    warnings.push('DIRECT_URL not set. Required for Prisma migrations and advisory locks.');
  } else {
    // Validate DIRECT_URL
    const directValidation = validateDirectUrl(directUrl);
    warnings.push(...directValidation.warnings);

    // Newlines in DIRECT_URL are also critical
    if (checkForNewlineIssues(directUrl)) {
      errors.push('CRITICAL: DIRECT_URL contains newline characters.');
    }
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
    timestamp: new Date().toISOString(),
  };

  // Log results if requested
  if (logResults) {
    logValidationResult(result);
  }

  // Exit on critical failure if requested
  if (exitOnCriticalFailure && level === ValidationLevel.CRITICAL) {
    console.error('❌ CRITICAL ENVIRONMENT VALIDATION FAILURE - EXITING');
    process.exit(1);
  }

  return result;
}

/**
 * Log validation result with appropriate formatting
 */
function logValidationResult(result: EnvironmentValidationResult): void {
  if (result.level === ValidationLevel.OK) {
    console.log('✅ Environment validation passed');
    return;
  }

  if (result.errors.length > 0) {
    console.error('❌ ENVIRONMENT VALIDATION FAILED:');
    result.errors.forEach(e => console.error(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    result.warnings.forEach(w => console.warn(`  - ${w}`));
  }
}

/**
 * Run validation on module import (for early detection)
 * Only runs in production to avoid interfering with development
 */
export function runStartupValidation(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
    validateProductionEnvironment({ exitOnCriticalFailure: true, logResults: true });
  }
}
```

**Checkpoint 4.2**: Tests pass:
```bash
npm run test -- --testPathPattern="startup-validation"
# Expected: All 7 tests passing
```

### Step 4.3: Add npm Script for Validation

**File**: `package.json`

Add script:
```json
{
  "scripts": {
    "validate:database-env": "npx tsx scripts/validate-database-env.ts"
  }
}
```

**File**: `scripts/validate-database-env.ts`

```typescript
#!/usr/bin/env npx tsx
/**
 * Validate database environment variables
 * Run: npm run validate:database-env
 */

import { validateProductionEnvironment } from '../lib/config/startup-validation';

console.log('🔍 Validating database environment configuration...\n');

const result = validateProductionEnvironment({
  exitOnCriticalFailure: true,
  logResults: true
});

if (result.isValid) {
  console.log('\n✅ All database environment checks passed!');
  console.log(`   Provider: ${result.level === 'OK' ? 'Supabase (correct)' : 'Check warnings'}`);
  process.exit(0);
} else {
  console.error('\n❌ Database environment validation failed!');
  console.error('   Please update your environment variables before deploying.');
  process.exit(1);
}
```

**Checkpoint 4.3**: Script runs successfully:
```bash
npm run validate:database-env
# Expected: "All database environment checks passed!"
```

### Step 4.4: 🔵 Refactor - Export and Integrate

**File**: `lib/config/index.ts`

```typescript
export * from './database-validation';
export * from './startup-validation';
```

**File**: `lib/db/prisma.ts`

Add at the top (after imports):
```typescript
import { runStartupValidation } from '@/lib/config/startup-validation';

// Run validation in production (fails fast on misconfiguration)
runStartupValidation();
```

**Checkpoint 4.4**: All tests pass:
```bash
npm run test
npm run lint
npm run build
# Expected: All pass
```

### Step 4.5: Add CI/CD Integration (GitHub Actions)

**File**: `.github/workflows/validate-env.yml`

```yaml
name: Validate Environment

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run database validation tests
        run: npm run test -- --testPathPattern="database-url-validation|startup-validation"

      - name: Validate local env format
        run: |
          # Check .env.example has correct format
          grep -q "pooler.supabase.com" .env.example || echo "Warning: .env.example may need updating"
```

### Checkpoint Phase 4: Validation Guard Complete
- [ ] Database URL validation tests passing (9 tests)
- [ ] Startup validation tests passing (7 tests)
- [ ] npm script `validate:database-env` works
- [ ] Startup validation integrated into Prisma initialization
- [ ] CI/CD workflow added
- [ ] All linting and build passes

**STOP**: Await manual confirmation before finalizing.

---

## Rollback Plan

If issues occur after updating environment variables:

### Immediate Rollback
```bash
# Restore Neon DATABASE_URL (only if needed to restore service)
vercel env rm DATABASE_URL production

# Use heredoc for safe value setting
vercel env add DATABASE_URL production <<'EOF'
postgresql://wilfred-py:npg_QvJPZwXi5T1g@ep-rapid-wildflower-291580-pooler.ap-southeast-1.aws.neon.tech/tldrsec-prod?sslmode=require&connection_limit=10&pool_timeout=20
EOF

vercel --prod
```

**Note:** Rolling back to Neon will restore service but lose any data written to Supabase since migration.

---

## Success Criteria

### Automated Verification
- [ ] All validation tests pass: `npm run test -- --testPathPattern="database|startup"`
- [ ] `npm run db:test` passes locally
- [ ] `npm run validate:database-env` passes
- [ ] `curl https://tldrsec.app/api/health/environment` returns 200 with all checks passing
- [ ] `curl https://tldrsec.app/api/health` shows `databaseType: "supabase"`
- [ ] Manual cron trigger succeeds without schema errors
- [ ] `npm run test:pipeline:comprehensive` passes
- [ ] `npm run test:cron-comprehensive` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

### Manual Verification
- [ ] Slack channel receives successful cron execution report (within 10 minutes)
- [ ] No `relation "pipeline.JobQueue" does not exist` errors in Vercel logs
- [ ] Dashboard loads correctly with user data
- [ ] Filing summaries are accessible
- [ ] Preview deployments work correctly
- [ ] Development environment works correctly

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test** (when practical): Makes failures easier to diagnose
2. **Descriptive Names**: Use "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure in every test
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs
5. **Edge Cases First**: Write tests for edge cases before happy path

### Test Categories (in order of writing):

| Category | Test File | Count |
|----------|-----------|-------|
| URL Validation | `database-url-validation.test.ts` | 9 tests |
| Startup Validation | `startup-validation.test.ts` | 7 tests |
| Integration | `vercel-env-check.test.ts` | 5 tests |
| Health Checks | `health-database.test.ts` | 4 tests |
| **Total** | | **25 tests** |

### Checkpoint Frequency

- **Minimum 3 checkpoints per phase**: Red (tests fail), Green (tests pass), Refactor
- **Maximum gap between checkpoints**: 15 minutes of implementation work

---

## References

- Research document: [thoughts/shared/research/2025-12-22-cron-job-database-schema-mismatch.md](../../../thoughts/shared/research/2025-12-22-cron-job-database-schema-mismatch.md)
- Original migration plan: [docs/plans/2025-12-19-unified-supabase-consolidation.md](2025-12-19-unified-supabase-consolidation.md)
- Prisma schema: [prisma/schema.prisma](../../prisma/schema.prisma)
- Database diagnostics: [lib/db/supabase-config.ts:269-342](../../lib/db/supabase-config.ts#L269-L342)
- Environment validation: [lib/config/env-validation.ts:73-80](../../lib/config/env-validation.ts#L73-L80)

---

## Appendix: Database URL Reference

### Supabase Connection Strings (Correct Values)

**Transaction Mode (port 6543) - For Regular Queries:**
```
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Session Mode (port 5432) - For Migrations/Locks:**
```
postgres://postgres.ipwlykhekrjfvejduotm:MOEjp0WTAvBa3nLn@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

### Legacy Neon Connection String (Do Not Use)
```
postgresql://wilfred-py:npg_QvJPZwXi5T1g@ep-rapid-wildflower-291580-pooler.ap-southeast-1.aws.neon.tech/tldrsec-prod?sslmode=require
```

### URL Component Breakdown

| Component | Transaction Mode | Session Mode |
|-----------|------------------|--------------|
| Protocol | `postgres://` | `postgres://` |
| Username | `postgres.ipwlykhekrjfvejduotm` | `postgres.ipwlykhekrjfvejduotm` |
| Password | `MOEjp0WTAvBa3nLn` | `MOEjp0WTAvBa3nLn` |
| Host | `aws-0-ap-southeast-1.pooler.supabase.com` | `aws-0-ap-southeast-1.pooler.supabase.com` |
| Port | `6543` | `5432` |
| Database | `postgres` | `postgres` |
| Parameters | `?pgbouncer=true` | (none) |
