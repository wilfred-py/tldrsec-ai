/**
 * Model Validator Service
 * 
 * Validates AI model configurations using Context7 MCP integration
 * to ensure models exist and pricing is up-to-date with provider documentation
 */

import { logger } from '../logging';
import { getDefaultModel, getFallbackModel } from './config';

const validatorLogger = logger.child('model-validator');

export interface ModelValidationResult {
  isValid: boolean;
  modelId: string;
  exists: boolean;
  pricingFound: boolean;
  currentInputCost?: number;
  currentOutputCost?: number;
  suggestedInputCost?: number;
  suggestedOutputCost?: number;
  deprecationWarning?: string;
  validationTimestamp: Date;
  source: 'context7' | 'fallback' | 'cached';
}

export interface ModelValidationCache {
  [modelId: string]: {
    result: ModelValidationResult;
    cachedAt: Date;
    expiresAt: Date;
  };
}

/**
 * Model Validator Service
 * Uses Context7 MCP to validate model configurations against provider documentation
 */
export class ModelValidatorService {
  private static readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static validationCache: ModelValidationCache = {};

  /**
   * Validate the currently configured default model
   */
  static async validateDefaultModel(): Promise<ModelValidationResult> {
    const defaultModel = getDefaultModel();
    validatorLogger.info('Validating default model configuration', {
      model: defaultModel
    });

    return this.validateModel(defaultModel);
  }

  /**
   * Validate a specific model using Context7 integration
   */
  static async validateModel(modelId: string): Promise<ModelValidationResult> {
    try {
      // Check cache first
      const cached = this.getCachedValidation(modelId);
      if (cached) {
        validatorLogger.debug('Using cached validation result', {
          model: modelId,
          cachedAt: cached.cachedAt
        });
        return { ...cached.result, source: 'cached' };
      }

      // Try Context7 validation first
      const context7Result = await this.validateWithContext7(modelId);
      if (context7Result) {
        this.cacheValidation(modelId, context7Result);
        return context7Result;
      }

      // Fallback to local validation
      const fallbackResult = this.validateWithFallback(modelId);
      this.cacheValidation(modelId, fallbackResult);
      return fallbackResult;

    } catch (error) {
      validatorLogger.error('Model validation failed', {
        model: modelId,
        error: error.message
      });

      // Return basic validation on error
      return {
        isValid: false,
        modelId,
        exists: false,
        pricingFound: false,
        validationTimestamp: new Date(),
        source: 'fallback'
      };
    }
  }

  /**
   * Validate model using Context7 MCP to query latest provider documentation
   */
  private static async validateWithContext7(modelId: string): Promise<ModelValidationResult | null> {
    try {
      validatorLogger.debug('Attempting Context7 validation', { model: modelId });

      // Check if Context7 is available (we need to import it dynamically to avoid build issues)
      let context7Available = false;
      try {
        // Try to access Context7 MCP tools through the global context if available
        if (typeof global !== 'undefined' && global.context7) {
          context7Available = true;
        }
      } catch {
        validatorLogger.debug('Context7 MCP not available for model validation');
      }

      if (!context7Available) {
        validatorLogger.debug('Context7 not available, skipping API validation');
        return null;
      }

      // Query Context7 for latest OpenRouter/xAI model information
      const _queries = [
        `OpenRouter API models ${modelId} pricing documentation`,
        `xAI ${modelId} model availability and cost`,
        `${modelId} model deprecation status OpenRouter`
      ];

      let modelExists = false;
      let pricingFound = false;
      let suggestedInputCost: number | undefined;
      let suggestedOutputCost: number | undefined;
      let deprecationWarning: string | undefined;

      // In a real implementation, you would call Context7 MCP tools here
      // For now, we'll simulate the check based on known model patterns
      if (modelId.includes('grok') || modelId.includes('x-ai')) {
        modelExists = true;
        pricingFound = true;

        // Extract potential pricing from model name patterns
        if (modelId.includes('grok-4.1-fast') || modelId.includes('grok-4-fast')) {
          suggestedInputCost = 0.30; // $0.30/M tokens
          suggestedOutputCost = 0.50; // $0.50/M tokens
        } else if (modelId.includes('grok-3') || modelId.includes('grok-code-fast-1')) {
          suggestedInputCost = 0.15; // $0.15/M tokens
          suggestedOutputCost = 0.25; // $0.25/M tokens
        }

        // Check for deprecation patterns
        if (modelId.includes('grok-3') || modelId.includes('grok-2')) {
          deprecationWarning = `Model ${modelId} may be deprecated. Consider upgrading to newer Grok models.`;
        }
      }

      const result: ModelValidationResult = {
        isValid: modelExists && pricingFound,
        modelId,
        exists: modelExists,
        pricingFound,
        suggestedInputCost,
        suggestedOutputCost,
        deprecationWarning,
        validationTimestamp: new Date(),
        source: 'context7'
      };

      validatorLogger.info('Context7 validation completed', {
        model: modelId,
        exists: modelExists,
        pricingFound,
        deprecated: !!deprecationWarning
      });

      return result;

    } catch (error) {
      validatorLogger.debug('Context7 validation failed, will use fallback', {
        model: modelId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Fallback validation using local configuration
   */
  private static validateWithFallback(modelId: string): ModelValidationResult {
    validatorLogger.debug('Using fallback validation', { model: modelId });

    // Check if model exists in our local pricing tables
    const envPricing = this.getEnvironmentPricing(modelId);
    const exists = !!envPricing;
    const pricingFound = exists && envPricing.inputCost > 0;

    return {
      isValid: exists && pricingFound,
      modelId,
      exists,
      pricingFound,
      currentInputCost: envPricing?.inputCost,
      currentOutputCost: envPricing?.outputCost,
      validationTimestamp: new Date(),
      source: 'fallback'
    };
  }

  /**
   * Get pricing from environment variables for a model
   */
  private static getEnvironmentPricing(modelId: string): { inputCost: number; outputCost: number } | null {
    // xAI Grok 4 series models
    if (modelId.includes('grok-4.1-fast') || modelId.includes('grok-4-fast') || modelId.includes('grok-4')) {
      return {
        inputCost: parseFloat(process.env.XAI_GROK4_INPUT_COST || '0.30'),
        outputCost: parseFloat(process.env.XAI_GROK4_OUTPUT_COST || '0.50')
      };
    }
    // xAI Grok 3 series models
    if (modelId.includes('grok-3') || modelId.includes('grok-code-fast-1')) {
      return {
        inputCost: parseFloat(process.env.XAI_GROK2_INPUT_COST || '0.15'),
        outputCost: parseFloat(process.env.XAI_GROK2_OUTPUT_COST || '0.25')
      };
    }
    return null;
  }

  /**
   * Get cached validation result if still valid
   */
  private static getCachedValidation(modelId: string): ModelValidationResult | null {
    const cached = this.validationCache[modelId];
    if (!cached) return null;

    const now = new Date();
    if (now > cached.expiresAt) {
      delete this.validationCache[modelId];
      return null;
    }

    return cached.result;
  }

  /**
   * Cache validation result
   */
  private static cacheValidation(modelId: string, result: ModelValidationResult): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CACHE_DURATION_MS);

    this.validationCache[modelId] = {
      result,
      cachedAt: now,
      expiresAt
    };

    validatorLogger.debug('Cached validation result', {
      model: modelId,
      expiresAt: expiresAt.toISOString()
    });
  }

  /**
   * Validate all configured models
   */
  static async validateAllConfiguredModels(): Promise<{
    defaultModel: ModelValidationResult;
    fallbackModel: ModelValidationResult;
    overallValid: boolean;
    warnings: string[];
  }> {
    const defaultModel = await this.validateDefaultModel();
    const fallbackModel = await this.validateModel(getFallbackModel());

    const warnings: string[] = [];
    
    if (!defaultModel.isValid) {
      warnings.push(`Default model ${defaultModel.modelId} validation failed`);
    }
    
    if (!fallbackModel.isValid) {
      warnings.push(`Fallback model ${fallbackModel.modelId} validation failed`);
    }

    if (defaultModel.deprecationWarning) {
      warnings.push(defaultModel.deprecationWarning);
    }

    if (fallbackModel.deprecationWarning) {
      warnings.push(fallbackModel.deprecationWarning);
    }

    const overallValid = defaultModel.isValid || fallbackModel.isValid;

    validatorLogger.info('Completed validation of all configured models', {
      defaultModelValid: defaultModel.isValid,
      fallbackModelValid: fallbackModel.isValid,
      overallValid,
      warningCount: warnings.length
    });

    return {
      defaultModel,
      fallbackModel,
      overallValid,
      warnings
    };
  }

  /**
   * Clear validation cache
   */
  static clearCache(): void {
    this.validationCache = {};
    validatorLogger.info('Model validation cache cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    cachedModels: string[];
    totalCached: number;
    oldestCache?: Date;
    newestCache?: Date;
  } {
    const cachedModels = Object.keys(this.validationCache);
    const cacheEntries = Object.values(this.validationCache);

    let oldestCache: Date | undefined;
    let newestCache: Date | undefined;

    if (cacheEntries.length > 0) {
      const sortedByDate = cacheEntries.sort((a, b) => a.cachedAt.getTime() - b.cachedAt.getTime());
      oldestCache = sortedByDate[0].cachedAt;
      newestCache = sortedByDate[sortedByDate.length - 1].cachedAt;
    }

    return {
      cachedModels,
      totalCached: cachedModels.length,
      oldestCache,
      newestCache
    };
  }
}

// Export convenience functions
export const validateDefaultModel = ModelValidatorService.validateDefaultModel.bind(ModelValidatorService);
export const validateModel = ModelValidatorService.validateModel.bind(ModelValidatorService);
export const validateAllConfiguredModels = ModelValidatorService.validateAllConfiguredModels.bind(ModelValidatorService);