/**
 * Integration tests that verify Vercel environment configuration
 *
 * IMPORTANT: When run via Jest (NODE_ENV=test), Next.js loads .env.test which
 * intentionally uses localhost URLs for unit test isolation.
 *
 * These tests verify the DATABASE_URL validation logic works correctly.
 * To verify actual Vercel/production environment variables:
 *   npm run validate:database-env
 *
 * The actual Vercel env vars are verified by:
 * 1. The validate:database-env script
 * 2. The startup validation in lib/config/startup-validation.ts
 * 3. Manual verification via: curl https://tldrsec.app/api/health
 */
import {
  validateDatabaseUrl,
  validateDirectUrl,
  detectDatabaseProvider,
  checkForNewlineIssues,
} from '@/lib/config/database-validation';

describe('Database URL Validation Logic', () => {
  describe('validateDatabaseUrl', () => {
    it('should accept valid Supabase transaction mode URL', () => {
      const url =
        'postgres://postgres.project:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(true);
      expect(result.provider).toBe('supabase');
      expect(result.errors).toHaveLength(0);
    });

    it('should reject Neon database URL', () => {
      const url = 'postgresql://user:pass@ep-xyz.neon.tech/db';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(false);
      expect(result.provider).toBe('neon');
      expect(result.errors).toContain(
        'DATABASE_URL points to Neon database. Update to Supabase.'
      );
    });

    it('should detect hidden newline characters', () => {
      const url = 'postgres://user:pass@host:6543/db\n';
      const result = validateDatabaseUrl(url);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('DATABASE_URL contains newline characters');
    });

    it('should warn when pgbouncer parameter missing on port 6543', () => {
      const url = 'postgres://user:pass@pooler.supabase.com:6543/db';
      const result = validateDatabaseUrl(url);
      expect(result.warnings).toContain(
        'Transaction mode (port 6543) should include ?pgbouncer=true'
      );
    });
  });

  describe('validateDirectUrl', () => {
    it('should accept valid Supabase session mode URL', () => {
      const url =
        'postgres://postgres.project:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
      const result = validateDirectUrl(url);
      expect(result.isValid).toBe(true);
      expect(result.provider).toBe('supabase');
    });

    it('should warn when pgbouncer used on session mode', () => {
      const url =
        'postgres://user:pass@pooler.supabase.com:5432/postgres?pgbouncer=true';
      const result = validateDirectUrl(url);
      expect(result.warnings).toContain(
        'Session mode (port 5432) should not include pgbouncer parameter'
      );
    });
  });

  describe('detectDatabaseProvider', () => {
    it('should detect Supabase from pooler URL', () => {
      const url = 'postgres://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
      expect(detectDatabaseProvider(url)).toBe('supabase');
    });

    it('should detect Neon from URL', () => {
      const url = 'postgresql://user:pass@ep-xyz.neon.tech/db';
      expect(detectDatabaseProvider(url)).toBe('neon');
    });

    it('should return unknown for localhost', () => {
      const url = 'postgresql://test:test@localhost:5432/test';
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

    it('should detect Windows line endings', () => {
      const url = 'postgres://user:pass@host:6543/db\r\n';
      expect(checkForNewlineIssues(url)).toBe(true);
    });
  });
});
