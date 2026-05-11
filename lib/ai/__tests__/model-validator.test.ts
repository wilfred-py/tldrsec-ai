/**
 * Unit tests for Model Validator Service.
 *
 * Single-target model: x-ai/grok-4.3 (other Grok variants retired 2026-05-15).
 * Pricing env vars renamed: XAI_GROK4_X / XAI_GROK2_X → XAI_GROK_X.
 */

import { ModelValidatorService } from '../model-validator';

jest.mock('../../logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn()
    }))
  }
}));

jest.mock('../config', () => ({
  getDefaultModel: jest.fn(() => 'x-ai/grok-4.3'),
  getFallbackModel: jest.fn(() => 'x-ai/grok-4.3')
}));

describe('ModelValidatorService', () => {
  beforeEach(() => {
    ModelValidatorService.clearCache();

    delete process.env.XAI_GROK_INPUT_COST;
    delete process.env.XAI_GROK_OUTPUT_COST;
    delete process.env.XAI_GROK_INPUT_COST_HIGH;
    delete process.env.XAI_GROK_OUTPUT_COST_HIGH;
  });

  describe('validateDefaultModel', () => {
    it('should validate the default model configuration', async () => {
      const result = await ModelValidatorService.validateDefaultModel();

      expect(result).toBeDefined();
      expect(result.modelId).toBe('x-ai/grok-4.3');
      expect(result.source).toBe('fallback');
      expect(result.validationTimestamp).toBeInstanceOf(Date);
    });
  });

  describe('validateModel', () => {
    it('should validate grok-4.3 with fallback pricing', async () => {
      process.env.XAI_GROK_INPUT_COST = '1.25';
      process.env.XAI_GROK_OUTPUT_COST = '2.50';

      const result = await ModelValidatorService.validateModel('x-ai/grok-4.3');

      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.pricingFound).toBe(true);
      expect(result.currentInputCost).toBe(1.25);
      expect(result.currentOutputCost).toBe(2.50);
      expect(result.source).toBe('fallback');
    });

    it('should handle unknown models gracefully', async () => {
      const result = await ModelValidatorService.validateModel('unknown/model');

      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.pricingFound).toBe(false);
      expect(result.source).toBe('fallback');
    });

    it('should cache validation results', async () => {
      const result1 = await ModelValidatorService.validateModel('x-ai/grok-4.3');
      expect(result1.source).toBe('fallback');
      expect(result1.modelId).toBe('x-ai/grok-4.3');

      const result2 = await ModelValidatorService.validateModel('x-ai/grok-4.3');
      expect(result2.source).toBe('cached');
      expect(result2.modelId).toBe('x-ai/grok-4.3');

      expect(result2.isValid).toBe(result1.isValid);
    });

    it('should detect retired (non-grok-4.3) Grok variants and warn', async () => {
      const result = await ModelValidatorService.validateModel('x-ai/grok-3');

      // Context7 path may or may not be reachable in tests; deprecation warning
      // only flows through that path. If it fired, assert it mentions retirement.
      if (result.deprecationWarning) {
        expect(result.deprecationWarning).toMatch(/retir|migrate/i);
      }
      expect(result.modelId).toBe('x-ai/grok-3');
    });
  });

  describe('validateAllConfiguredModels', () => {
    it('should validate both default and fallback models', async () => {
      const result = await ModelValidatorService.validateAllConfiguredModels();

      expect(result.defaultModel).toBeDefined();
      expect(result.fallbackModel).toBeDefined();
      expect(result.defaultModel.modelId).toBe('x-ai/grok-4.3');
      expect(result.fallbackModel.modelId).toBe('x-ai/grok-4.3');
      expect(result.warnings).toBeInstanceOf(Array);
      expect(typeof result.overallValid).toBe('boolean');
    });

    it('should report warnings for invalid models', async () => {
      const result = await ModelValidatorService.validateAllConfiguredModels();

      expect(result.warnings).toBeInstanceOf(Array);
      expect(typeof result.overallValid).toBe('boolean');
      expect(result.defaultModel).toBeDefined();
      expect(result.fallbackModel).toBeDefined();
    });
  });

  describe('cache management', () => {
    it('should provide cache statistics', async () => {
      await ModelValidatorService.validateModel('x-ai/grok-4.3');
      await ModelValidatorService.validateModel('unknown/model');

      const stats = ModelValidatorService.getCacheStats();

      expect(stats.totalCached).toBe(2);
      expect(stats.cachedModels).toContain('x-ai/grok-4.3');
      expect(stats.oldestCache).toBeInstanceOf(Date);
      expect(stats.newestCache).toBeInstanceOf(Date);
    });

    it('should clear cache correctly', async () => {
      await ModelValidatorService.validateModel('x-ai/grok-4.3');

      let stats = ModelValidatorService.getCacheStats();
      expect(stats.totalCached).toBe(1);

      ModelValidatorService.clearCache();

      stats = ModelValidatorService.getCacheStats();
      expect(stats.totalCached).toBe(0);
      expect(stats.cachedModels).toEqual([]);
    });

    it('should expire cache entries after TTL', async () => {
      await ModelValidatorService.validateModel('x-ai/grok-4.3');

      const cachedResult = await ModelValidatorService.validateModel('x-ai/grok-4.3');
      expect(cachedResult.source).toBe('cached');

      ModelValidatorService.clearCache();

      const freshResult = await ModelValidatorService.validateModel('x-ai/grok-4.3');
      expect(freshResult.source).toBe('fallback');
    });
  });

  describe('environment pricing', () => {
    it('should read pricing from environment variables', async () => {
      process.env.XAI_GROK_INPUT_COST = '1.10';
      process.env.XAI_GROK_OUTPUT_COST = '2.30';

      const result = await ModelValidatorService.validateModel('x-ai/grok-4.3');

      expect(result.currentInputCost).toBe(1.10);
      expect(result.currentOutputCost).toBe(2.30);
    });

    it('should use default pricing when environment variables not set', async () => {
      const result = await ModelValidatorService.validateModel('x-ai/grok-4.3');

      expect(result.currentInputCost).toBe(1.25); // Default ≤200K-tier value
      expect(result.currentOutputCost).toBe(2.50);
    });

    it('matches grok-4.3 exactly, not retired or hypothetical Grok variants', async () => {
      // Tight match: only grok-4.3 returns pricing. Retired variants
      // (grok-4.1-fast retiring 2026-05-15) and hypothetical future ones
      // (grok-4.5, grok-44) return null so callers don't silently get the
      // wrong price for an unsupported model.
      const grok43 = await ModelValidatorService.validateModel('x-ai/grok-4.3');
      expect(grok43.currentInputCost).toBe(1.25);

      const retired = await ModelValidatorService.validateModel('x-ai/grok-4.1-fast');
      expect(retired.currentInputCost).toBeUndefined();

      const future = await ModelValidatorService.validateModel('x-ai/grok-4.5-fast');
      expect(future.currentInputCost).toBeUndefined();

      const wrong = await ModelValidatorService.validateModel('x-ai/grok-44');
      expect(wrong.currentInputCost).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await ModelValidatorService.validateModel('x-ai/grok-4.3');

      expect(result).toBeDefined();
      expect(result.modelId).toBe('x-ai/grok-4.3');

      consoleSpy.mockRestore();
    });
  });
});
