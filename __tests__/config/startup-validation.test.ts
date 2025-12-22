/**
 * Startup Environment Validation Tests
 * Tests for the startup validation guard that prevents misconfigurations
 */
import {
  validateProductionEnvironment,
  ValidationLevel,
  EnvironmentValidationResult,
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
      process.env.DATABASE_URL =
        'postgres://user:pass@pooler.supabase.com:6543/db?pgbouncer=true';
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
      process.env.DATABASE_URL =
        'postgres://user:pass@pooler.supabase.com:6543/db?pgbouncer=true';
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
      process.env.DIRECT_URL = 'postgres://user:pass@pooler.supabase.com:5432/db';

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
      const mockExit = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const mockConsoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      process.env.DATABASE_URL = 'postgresql://user:pass@neon.tech/db';

      validateProductionEnvironment({ exitOnCriticalFailure: true });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalled();

      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    });

    it('should not call process.exit when validation passes', () => {
      const mockExit = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);

      process.env.DATABASE_URL =
        'postgres://user:pass@pooler.supabase.com:6543/db?pgbouncer=true';
      process.env.DIRECT_URL = 'postgres://user:pass@pooler.supabase.com:5432/db';

      validateProductionEnvironment({ exitOnCriticalFailure: true });

      expect(mockExit).not.toHaveBeenCalled();

      mockExit.mockRestore();
    });
  });

  describe('skipInTest option', () => {
    it('should return valid result when skipInTest is true and NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = 'postgresql://user:pass@neon.tech/db'; // Invalid for production

      const result = validateProductionEnvironment({ skipInTest: true });

      expect(result.isValid).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should validate normally when skipInTest is false even in test environment', () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = 'postgresql://user:pass@neon.tech/db';

      const result = validateProductionEnvironment({ skipInTest: false });

      expect(result.isValid).toBe(false);
    });
  });
});
