/**
 * Tests for CRON_SECRET Sanitization
 *
 * Unit tests for the sanitizeCronSecret function that handles:
 * - Trailing newline characters (\n)
 * - Literal backslash-n sequences (\\n)
 * - Leading/trailing whitespace
 *
 * This defensive sanitization ensures HMAC signatures match between
 * Vercel (which already trims) and Cloudflare Worker (which needs this fix).
 *
 * @see docs/plans/2026-01-26-pipeline-resilience-zero-intervention.md Phase 1
 */

import { sanitizeCronSecret, generateHmacSignature } from '@/lib/cron/secret-sanitization';

describe('CRON_SECRET Sanitization', () => {
  describe('sanitizeCronSecret', () => {
    it('should remove trailing newline character', () => {
      const dirty = 'valid_secret_here\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should remove literal backslash-n characters', () => {
      const dirty = 'valid_secret_here\\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should remove leading and trailing whitespace', () => {
      const dirty = '  valid_secret_here  ';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should handle multiple contamination types', () => {
      const dirty = '  valid_secret_here\\n\n  ';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('valid_secret_here');
    });

    it('should not modify clean secrets', () => {
      const clean = 'a'.repeat(80);
      const result = sanitizeCronSecret(clean);
      expect(result).toBe(clean);
      expect(result).toHaveLength(80);
    });

    it('should handle null or undefined gracefully', () => {
      // @ts-expect-error - Testing runtime null/undefined handling
      expect(sanitizeCronSecret(null)).toBe('');
      // @ts-expect-error - Testing runtime null/undefined handling
      expect(sanitizeCronSecret(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(sanitizeCronSecret('')).toBe('');
    });

    it('should remove multiple literal backslash-n sequences', () => {
      const dirty = 'secret\\n\\n\\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('secret');
    });

    it('should remove mixed newlines and literal backslash-n', () => {
      const dirty = 'secret\n\\n\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('secret');
    });

    it('should preserve internal content while cleaning edges', () => {
      // Real secrets should not have internal whitespace, but test robustness
      const dirty = '  abc_def_ghi_123  \\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('abc_def_ghi_123');
    });
  });

  describe('HMAC signature matching', () => {
    it('should produce matching signatures when both sides sanitize', async () => {
      const cleanSecret = 'a'.repeat(80);
      const dirtySecret = cleanSecret + '\\n';
      const payload = `${Date.now()}:GET:/api/cron/tier-aware`;

      // Simulate Vercel side (already sanitizes via .trim())
      const vercelSig = await generateHmacSignature(cleanSecret.trim(), payload);

      // Simulate Cloudflare side (now sanitizes)
      const cfSig = await generateHmacSignature(sanitizeCronSecret(dirtySecret), payload);

      expect(vercelSig).toBe(cfSig);
    });

    it('should produce matching signatures with newline contamination', async () => {
      const cleanSecret = 'test_secret_key_12345';
      const dirtySecret = cleanSecret + '\n';
      const payload = '1706234567890:GET:/api/cron/tier-aware';

      const vercelSig = await generateHmacSignature(cleanSecret.trim(), payload);
      const cfSig = await generateHmacSignature(sanitizeCronSecret(dirtySecret), payload);

      expect(vercelSig).toBe(cfSig);
    });

    it('should produce matching signatures with whitespace contamination', async () => {
      const cleanSecret = 'my_cron_secret_value';
      const dirtySecret = '  ' + cleanSecret + '  ';
      const payload = '1706234567890:GET:/api/cron/auto-recover';

      const vercelSig = await generateHmacSignature(cleanSecret.trim(), payload);
      const cfSig = await generateHmacSignature(sanitizeCronSecret(dirtySecret), payload);

      expect(vercelSig).toBe(cfSig);
    });

    it('should produce consistent signatures for same input', async () => {
      const secret = 'consistent_test_secret';
      const payload = '1706234567890:GET:/api/cron/tier-aware';

      const sig1 = await generateHmacSignature(secret, payload);
      const sig2 = await generateHmacSignature(secret, payload);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different payloads', async () => {
      const secret = 'test_secret';
      const payload1 = '1706234567890:GET:/api/cron/tier-aware';
      const payload2 = '1706234567891:GET:/api/cron/tier-aware';

      const sig1 = await generateHmacSignature(secret, payload1);
      const sig2 = await generateHmacSignature(secret, payload2);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long secrets', () => {
      const longSecret = 'x'.repeat(1000) + '\\n';
      const clean = sanitizeCronSecret(longSecret);
      expect(clean).toHaveLength(1000);
    });

    it('should handle secrets with only contamination', () => {
      const dirty = '  \\n\n  ';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe('');
    });

    it('should handle secrets with special characters', () => {
      const secret = 'abc!@#$%^&*()_+-=[]{}|;:\'",.<>?/';
      const dirty = secret + '\\n';
      const clean = sanitizeCronSecret(dirty);
      expect(clean).toBe(secret);
    });
  });
});
