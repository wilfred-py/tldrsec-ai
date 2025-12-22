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
