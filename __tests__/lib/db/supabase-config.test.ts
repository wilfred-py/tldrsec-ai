/**
 * Supabase Configuration Tests
 *
 * Tests for the typed Supabase configuration module.
 */

import {
  getSupabaseConfig,
  getSupabaseDatabaseUrl,
  validateSupabaseConfig,
  withRetry,
  DEFAULT_RETRY_CONFIG,
} from '../../../lib/db/supabase-config';

describe('Supabase Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getSupabaseConfig', () => {
    it('should return configuration when all URLs are set', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://testproject.supabase.co';
      process.env.SUPABASE_DATABASE_URL =
        'postgres://postgres.testproject:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      process.env.SUPABASE_DIRECT_URL =
        'postgres://postgres.testproject:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

      const config = getSupabaseConfig();

      expect(config.projectRef).toBe('testproject');
      expect(config.projectUrl).toBe('https://testproject.supabase.co');
      expect(config.pooledUrl).toContain('6543');
      expect(config.directUrl).toContain('5432');
      expect(config.isConfigured).toBe(true);
    });

    it('should extract project ref from connection string', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = '';
      process.env.SUPABASE_DATABASE_URL =
        'postgres://postgres.myproject123:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

      const config = getSupabaseConfig();

      expect(config.projectRef).toBe('myproject123');
    });

    it('should return empty config when no URLs are set', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_DATABASE_URL;
      delete process.env.SUPABASE_DIRECT_URL;

      const config = getSupabaseConfig();

      expect(config.isConfigured).toBe(false);
      expect(config.projectRef).toBe('');
    });

    it('should detect when Supabase is not active (using Neon)', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://testproject.supabase.co';
      process.env.SUPABASE_DATABASE_URL =
        'postgresql://user:pass@ep-test.neon.tech/db';

      const config = getSupabaseConfig();

      expect(config.isActive).toBe(false);
    });
  });

  describe('validateSupabaseConfig', () => {
    it('should throw when not configured', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_DATABASE_URL;
      delete process.env.SUPABASE_DIRECT_URL;

      expect(() => validateSupabaseConfig()).toThrow('Supabase not configured');
    });

    it('should throw when no database URLs are set', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://testproject.supabase.co';
      delete process.env.SUPABASE_DATABASE_URL;
      delete process.env.SUPABASE_DIRECT_URL;

      // isConfigured will be false since no database URLs are set
      expect(() => validateSupabaseConfig()).toThrow('Supabase not configured');
    });

    it('should not throw when properly configured', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://testproject.supabase.co';
      process.env.SUPABASE_DATABASE_URL =
        'postgres://postgres.testproject:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

      expect(() => validateSupabaseConfig()).not.toThrow();
    });
  });

  describe('getSupabaseDatabaseUrl', () => {
    beforeEach(() => {
      process.env.SUPABASE_DATABASE_URL =
        'postgres://postgres.test:pass@pooler:6543/postgres';
      process.env.SUPABASE_DIRECT_URL =
        'postgres://postgres.test:pass@pooler:5432/postgres';
    });

    it('should return pooled URL by default', () => {
      const url = getSupabaseDatabaseUrl();
      expect(url).toContain('6543');
    });

    it('should return direct URL when requested', () => {
      const url = getSupabaseDatabaseUrl(true);
      expect(url).toContain('5432');
    });

    it('should throw when pooled URL not set', () => {
      delete process.env.SUPABASE_DATABASE_URL;
      delete process.env.SUPABASE_DIRECT_URL;

      expect(() => getSupabaseDatabaseUrl()).toThrow('not configured');
    });

    it('should fall back to direct URL if pooled not available', () => {
      delete process.env.SUPABASE_DATABASE_URL;

      const url = getSupabaseDatabaseUrl();
      expect(url).toContain('5432');
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failures', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        ...DEFAULT_RETRY_CONFIG,
        initialDelayMs: 1,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry configuration errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('DATABASE_URL not configured'));

      await expect(
        withRetry(operation, { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1 })
      ).rejects.toThrow('not configured');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(
        withRetry(operation, {
          maxRetries: 2,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('Connection failed');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});
