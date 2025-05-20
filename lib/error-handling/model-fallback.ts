/**
 * Model fallback mechanism that implements intelligent fallback between different AI models.
 * This system allows gracefully switching between models when errors occur, with 
 * cost-based selection and adaptive retry strategies depending on the error type.
 */

import { ApiError, ErrorCode } from './index';
import { executeWithRetry, RetryConfig, DefaultRetryConfig, CircuitBreakerConfig, DefaultCircuitBreakerConfig } from './retry';
import { logger } from '@/lib/logging';
import { monitoring } from '@/lib/monitoring';
import { v4 as uuidv4 } from 'uuid';

/**
 * Model information for cost optimization and fallback selection
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'other';
  costPerInputToken: number;
  costPerOutputToken: number;
  maxContextTokens: number;
  capabilities: ModelCapability[];
  averageLatency?: number; // milliseconds
  successRate?: number;    // 0-1
  priority: number;        // Lower is higher priority
}

/**
 * Model capabilities for determining suitable fallbacks
 */
export enum ModelCapability {
  TEXT_COMPLETION = 'text_completion',
  SUMMARIZATION = 'summarization',
  CLASSIFICATION = 'classification',
  EXTRACTION = 'extraction',
  REASONING = 'reasoning',
  CODE_UNDERSTANDING = 'code_understanding',
  MULTILINGUAL = 'multilingual',
  LONG_CONTEXT = 'long_context',
}

/**
 * Claude model information
 */
export const ClaudeModels: Record<string, ModelInfo> = {
  'claude-3-opus-20240229': {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    costPerInputToken: 0.000015, // $15 per million tokens
    costPerOutputToken: 0.000075, // $75 per million tokens
    maxContextTokens: 200000,
    capabilities: [
      ModelCapability.TEXT_COMPLETION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.CLASSIFICATION,
      ModelCapability.EXTRACTION,
      ModelCapability.REASONING,
      ModelCapability.CODE_UNDERSTANDING,
      ModelCapability.MULTILINGUAL,
      ModelCapability.LONG_CONTEXT,
    ],
    priority: 1,
  },
  'claude-3-sonnet-20240229': {
    id: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    costPerInputToken: 0.000003, // $3 per million tokens
    costPerOutputToken: 0.000015, // $15 per million tokens
    maxContextTokens: 200000,
    capabilities: [
      ModelCapability.TEXT_COMPLETION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.CLASSIFICATION,
      ModelCapability.EXTRACTION,
      ModelCapability.REASONING,
      ModelCapability.CODE_UNDERSTANDING,
      ModelCapability.MULTILINGUAL,
      ModelCapability.LONG_CONTEXT,
    ],
    priority: 2,
  },
  'claude-3-haiku-20240307': {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    costPerInputToken: 0.00000025, // $0.25 per million tokens
    costPerOutputToken: 0.00000125, // $1.25 per million tokens
    maxContextTokens: 200000,
    capabilities: [
      ModelCapability.TEXT_COMPLETION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.CLASSIFICATION,
      ModelCapability.EXTRACTION,
      ModelCapability.MULTILINGUAL,
      ModelCapability.LONG_CONTEXT,
    ],
    priority: 3,
  },
  'claude-2.1': {
    id: 'claude-2.1',
    name: 'Claude 2.1',
    provider: 'anthropic',
    costPerInputToken: 0.000008, // $8 per million tokens
    costPerOutputToken: 0.000024, // $24 per million tokens
    maxContextTokens: 100000,
    capabilities: [
      ModelCapability.TEXT_COMPLETION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.CLASSIFICATION,
      ModelCapability.EXTRACTION,
      ModelCapability.REASONING,
      ModelCapability.CODE_UNDERSTANDING,
      ModelCapability.MULTILINGUAL,
    ],
    priority: 4,
  },
  'claude-instant-1.2': {
    id: 'claude-instant-1.2',
    name: 'Claude Instant 1.2',
    provider: 'anthropic',
    costPerInputToken: 0.000000163, // $0.163 per million tokens
    costPerOutputToken: 0.000000551, // $0.551 per million tokens
    maxContextTokens: 100000,
    capabilities: [
      ModelCapability.TEXT_COMPLETION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.CLASSIFICATION,
    ],
    priority: 5,
  },
};

/**
 * Fallback chain configuration
 */
export interface FallbackConfig {
  initialModel: string;
  fallbackModels: string[];
  requiredCapabilities: ModelCapability[];
  maxCostMultiplier: number;
  timeoutMs?: number;
}

/**
 * Default fallback chain for Anthropic Claude models
 */
export const DefaultClaudeFallback: FallbackConfig = {
  initialModel: 'claude-3-sonnet-20240229',
  fallbackModels: [
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-instant-1.2',
  ],
  requiredCapabilities: [
    ModelCapability.SUMMARIZATION,
    ModelCapability.EXTRACTION,
  ],
  maxCostMultiplier: 5, // Max 5x cost increase from initial model
  timeoutMs: 60000, // 1 minute timeout
};

/**
 * Cost-optimized fallback chain for batch processing
 */
export const BatchClaudeFallback: FallbackConfig = {
  initialModel: 'claude-3-haiku-20240307',
  fallbackModels: [
    'claude-3-sonnet-20240229',
    'claude-2.1',
  ],
  requiredCapabilities: [
    ModelCapability.SUMMARIZATION,
  ],
  maxCostMultiplier: 10, // More willing to increase cost for batch jobs
  timeoutMs: 180000, // 3 minute timeout
};

/**
 * Premium fallback chain for high-quality results
 */
export const PremiumClaudeFallback: FallbackConfig = {
  initialModel: 'claude-3-opus-20240229',
  fallbackModels: [
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  requiredCapabilities: [
    ModelCapability.SUMMARIZATION,
    ModelCapability.EXTRACTION,
    ModelCapability.REASONING,
  ],
  maxCostMultiplier: 2, // Only modest cost reduction allowed
  timeoutMs: 120000, // 2 minute timeout
};

/**
 * Cost-based model selector that chooses the most appropriate model
 * based on document complexity, cost constraints and required capabilities
 */
export function selectModelByCost({
  estimatedInputTokens,
  estimatedOutputTokens,
  maxCost,
  requiredCapabilities,
  preferredModels = Object.keys(ClaudeModels),
  excludedModels = [],
}: {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  maxCost?: number;
  requiredCapabilities: ModelCapability[];
  preferredModels?: string[];
  excludedModels?: string[];
}): ModelInfo {
  // Filter to models that have all required capabilities
  const capableModels = Object.values(ClaudeModels).filter(model => {
    // Check if model is in preferred list
    if (!preferredModels.includes(model.id)) {
      return false;
    }
    
    // Check if model is excluded
    if (excludedModels.includes(model.id)) {
      return false;
    }
    
    // Check if model has all required capabilities
    return requiredCapabilities.every(capability => 
      model.capabilities.includes(capability)
    );
  });
  
  if (capableModels.length === 0) {
    throw new ApiError(
      ErrorCode.BAD_REQUEST,
      'No models satisfy the required capabilities',
      { requiredCapabilities }
    );
  }
  
  // Sort by cost for the estimated tokens
  capableModels.sort((a, b) => {
    const aCost = (a.costPerInputToken * estimatedInputTokens) + 
                  (a.costPerOutputToken * estimatedOutputTokens);
    const bCost = (b.costPerInputToken * estimatedInputTokens) + 
                  (b.costPerOutputToken * estimatedOutputTokens);
    return aCost - bCost;
  });
  
  // If max cost is specified, find the first model under the max cost
  if (maxCost !== undefined) {
    for (const model of capableModels) {
      const cost = (model.costPerInputToken * estimatedInputTokens) + 
                   (model.costPerOutputToken * estimatedOutputTokens);
      if (cost <= maxCost) {
        return model;
      }
    }
    
    // If no model is under max cost, throw an error
    throw new ApiError(
      ErrorCode.BAD_REQUEST,
      'No model available under the specified cost limit',
      { 
        maxCost, 
        estimatedInputTokens, 
        estimatedOutputTokens, 
        cheapestModelCost: (capableModels[0].costPerInputToken * estimatedInputTokens) + 
                           (capableModels[0].costPerOutputToken * estimatedOutputTokens) 
      }
    );
  }
  
  // Return the cheapest capable model
  return capableModels[0];
}

/**
 * Update the success metrics for a model
 */
export function updateModelMetrics(
  modelId: string, 
  success: boolean, 
  latencyMs: number
): void {
  // Get existing model in our local store
  const model = ClaudeModels[modelId];
  if (!model) return;
  
  // Update the success rate using exponential moving average
  if (model.successRate === undefined) {
    model.successRate = success ? 1 : 0;
  } else {
    // Weight recent results more heavily (75% new, 25% existing)
    model.successRate = (success ? 0.75 : 0) + (model.successRate * 0.25);
  }
  
  // Update the latency using exponential moving average
  if (model.averageLatency === undefined) {
    model.averageLatency = latencyMs;
  } else {
    // Weight recent results more heavily (25% new, 75% existing)
    model.averageLatency = (latencyMs * 0.25) + (model.averageLatency * 0.75);
  }
  
  // Report metrics
  monitoring.recordValue(`model.${modelId}.latency_ms`, latencyMs);
  monitoring.incrementCounter(`model.${modelId}.requests`, 1, { success: String(success) });
  
  logger.debug(`Updated model metrics for ${modelId}`, {
    success,
    latencyMs,
    newSuccessRate: model.successRate,
    newAverageLatency: model.averageLatency
  });
}

/**
 * Get the appropriate fallback chain for a given task
 */
export function getFallbackChain(
  taskType: 'standard' | 'batch' | 'premium',
  requiredCapabilities?: ModelCapability[]
): FallbackConfig {
  let config: FallbackConfig;
  
  switch (taskType) {
    case 'batch':
      config = { ...BatchClaudeFallback };
      break;
    case 'premium':
      config = { ...PremiumClaudeFallback };
      break;
    case 'standard':
    default:
      config = { ...DefaultClaudeFallback };
      break;
  }
  
  // Override required capabilities if provided
  if (requiredCapabilities && requiredCapabilities.length > 0) {
    config.requiredCapabilities = requiredCapabilities;
  }
  
  return config;
}

/**
 * Parse an error to determine if it indicates a need for a specific fallback strategy
 */
export function parseErrorForFallbackStrategy(error: Error): {
  shouldFallback: boolean;
  recommendedModel?: string;
  retryStrategy?: 'immediate' | 'backoff' | 'abort';
} {
  // Default strategy
  const defaultResponse = { shouldFallback: false, retryStrategy: 'backoff' as const };
  
  // Handle API errors with specific fallback logic
  if (error instanceof ApiError) {
    switch (error.code) {
      case ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED:
        // Context window exceeded - try a model with larger context window or abort
        return {
          shouldFallback: true,
          recommendedModel: 'claude-3-opus-20240229', // Has largest context window
          retryStrategy: 'immediate'
        };
        
      case ErrorCode.AI_QUOTA_EXCEEDED:
        // Rate limit - try a different model that might have separate quota
        return {
          shouldFallback: true,
          retryStrategy: 'immediate'
        };
        
      case ErrorCode.AI_MODEL_ERROR:
        // Generic model error - try fallback model
        return {
          shouldFallback: true,
          retryStrategy: 'immediate'
        };
        
      case ErrorCode.TIMEOUT_ERROR:
        // Timeout - try a faster model
        return {
          shouldFallback: true,
          recommendedModel: 'claude-3-haiku-20240307', // Fastest model
          retryStrategy: 'immediate'
        };
        
      case ErrorCode.NETWORK_UNAVAILABLE:
      case ErrorCode.CONNECTION_RESET:
        // Network issues - retry with backoff before falling back
        return {
          shouldFallback: false,
          retryStrategy: 'backoff'
        };
        
      default:
        return defaultResponse;
    }
  }
  
  // Check error message for clues about fallback needs
  const errorMsg = error.message.toLowerCase();
  
  if (errorMsg.includes('context length') || errorMsg.includes('too many tokens')) {
    return {
      shouldFallback: true,
      recommendedModel: 'claude-3-opus-20240229',
      retryStrategy: 'immediate'
    };
  }
  
  if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
    return {
      shouldFallback: true,
      retryStrategy: 'immediate'
    };
  }
  
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return {
      shouldFallback: true,
      recommendedModel: 'claude-3-haiku-20240307',
      retryStrategy: 'immediate'
    };
  }
  
  // Default: no specific fallback needed
  return defaultResponse;
}

/**
 * Execute an operation with intelligent model fallback 
 * Tries multiple models in sequence if errors occur
 */
export async function executeWithModelFallback<T>(
  // The operation to execute, should take a model ID and return a promise
  operation: (modelId: string) => Promise<T>,
  // Configuration for the fallback chain
  config: FallbackConfig = DefaultClaudeFallback,
  // Service name for circuit breaker
  serviceName: string = 'anthropic-claude',
  // Retry configuration for transient errors within each model attempt
  retryConfig: RetryConfig = DefaultRetryConfig,
  // Circuit breaker configuration
  circuitBreakerConfig: CircuitBreakerConfig = DefaultCircuitBreakerConfig
): Promise<{
  result: T;
  modelUsed: string;
  attempts: number;
  executionTimeMs: number;
}> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // Create list of models to try, starting with initial model
  const modelsToTry = [config.initialModel, ...config.fallbackModels];
  
  // Filter models to ensure they have required capabilities
  const validModels = modelsToTry.filter(modelId => {
    const model = ClaudeModels[modelId];
    if (!model) return false;
    
    return config.requiredCapabilities.every(capability => 
      model.capabilities.includes(capability)
    );
  });
  
  if (validModels.length === 0) {
    throw new ApiError(
      ErrorCode.BAD_REQUEST,
      'No models in the fallback chain satisfy the required capabilities',
      { requiredCapabilities: config.requiredCapabilities }
    );
  }
  
  // Set up overall timeout if configured
  const timeoutPromise = config.timeoutMs 
    ? new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new ApiError(
            ErrorCode.TIMEOUT_ERROR,
            `Operation timed out after ${config.timeoutMs}ms`,
            { serviceName, requestId },
            true,
            requestId
          ));
        }, config.timeoutMs);
      })
    : null;
  
  // Track attempts across all models
  let totalAttempts = 0;
  let lastError: Error | null = null;
  
  // Try each model in sequence
  for (let i = 0; i < validModels.length; i++) {
    const modelId = validModels[i];
    const model = ClaudeModels[modelId];
    
    logger.info(`Attempting to use model ${model.name} (${i+1}/${validModels.length})`, {
      modelId,
      attempt: i + 1,
      requestId
    });
    
    const modelStartTime = Date.now();
    
    try {
      // Create specific service name for this model for circuit breaker
      const modelServiceName = `${serviceName}-${modelId}`;
      
      // Execute with retry and optional timeout
      const result = timeoutPromise
        ? await Promise.race([
            executeWithRetry(
              () => operation(modelId),
              modelServiceName,
              retryConfig,
              circuitBreakerConfig
            ),
            timeoutPromise
          ])
        : await executeWithRetry(
            () => operation(modelId),
            modelServiceName,
            retryConfig,
            circuitBreakerConfig
          );
      
      const executionTime = Date.now() - modelStartTime;
      
      // Update model metrics for successful operation
      updateModelMetrics(modelId, true, executionTime);
      
      // Track which model was used
      monitoring.incrementCounter('model.fallback.success', 1, {
        modelId,
        attemptNumber: String(i + 1),
        isFirstChoice: String(i === 0)
      });
      
      // Log success
      logger.info(`Successfully completed operation with model ${model.name}`, {
        modelId,
        executionTimeMs: executionTime,
        attempts: totalAttempts + 1,
        requestId
      });
      
      return {
        result,
        modelUsed: modelId,
        attempts: totalAttempts + 1,
        executionTimeMs: Date.now() - startTime
      };
    } catch (error: any) {
      // Increment attempt counter
      totalAttempts++;
      
      // Update model metrics for failed operation
      updateModelMetrics(modelId, false, Date.now() - modelStartTime);
      
      // Save error for potential rethrowing
      lastError = error;
      
      // Analyze error for fallback strategy
      const { shouldFallback, recommendedModel, retryStrategy } = parseErrorForFallbackStrategy(error);
      
      logger.warn(`Error with model ${model.name}`, {
        error: error.message,
        modelId,
        shouldFallback,
        recommendedModel,
        retryStrategy,
        remainingModels: validModels.length - i - 1,
        requestId
      });
      
      // If a specific recommended model exists, try to find it in our chain
      if (recommendedModel && i < validModels.length - 1) {
        const recommendedIndex = validModels.indexOf(recommendedModel, i + 1);
        
        if (recommendedIndex !== -1) {
          // Swap the recommended model to the front of the remaining models
          [validModels[i+1], validModels[recommendedIndex]] = 
            [validModels[recommendedIndex], validModels[i+1]];
          
          logger.info(`Prioritizing recommended model ${recommendedModel} for next attempt`, {
            recommendedModel,
            requestId
          });
        }
      }
      
      // If we shouldn't fallback to another model based on error analysis, rethrow
      if (!shouldFallback && i < validModels.length - 1) {
        logger.info(`Not attempting fallback despite error, as error type suggests retrying with same model`, {
          errorType: error instanceof ApiError ? error.code : 'Unknown',
          requestId
        });
        throw error;
      }
      
      // If this is the last model or retryStrategy is abort, stop trying
      if (i === validModels.length - 1 || retryStrategy === 'abort') {
        logger.error(`All models in fallback chain failed or abort strategy triggered`, {
          lastModelId: modelId,
          totalAttempts,
          requestId
        });
        
        monitoring.incrementCounter('model.fallback.exhausted', 1, {
          lastModelId: modelId
        });
        
        // Rethrow the last error
        throw error;
      }
      
      // Continue to next model in the chain
      logger.info(`Falling back to next model after error`, {
        currentModelId: modelId,
        nextModelId: validModels[i+1],
        error: error.message,
        requestId
      });
      
      monitoring.incrementCounter('model.fallback.attempt', 1, {
        fromModelId: modelId,
        toModelId: validModels[i+1],
        errorType: error instanceof ApiError ? error.code : 'Unknown'
      });
    }
  }
  
  // This should never be reached due to the error handling above,
  // but just in case, throw the last error or a generic error
  throw lastError || new ApiError(
    ErrorCode.INTERNAL_ERROR,
    'Model fallback chain completed without success or error',
    { serviceName, requestId }
  );
} 