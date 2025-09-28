/**
 * OpenRouter AI Client with xAI Model Intelligence
 * 
 * Provides intelligent model selection, fallback handling, and cost optimization
 * for xAI models through OpenRouter API with sophisticated error handling
 */

import { logger } from '../logging';
import monitoring from '../monitoring';
import { 
  ApiError, 
  createAiQuotaExceededError,
  createAiContextWindowExceededError,
  createAiContentFilteredError,
  createAiUnavailableError,
  createAiModelError,
  createTimeoutError
} from '../error-handling';
import { 
  executeWithRetry, 
  RetryConfig, 
  DefaultRetryConfig,
  CircuitBreakerConfig,
  DefaultCircuitBreakerConfig, 
  TimeoutAbortController
} from '../error-handling/retry';
import { v4 as uuidv4 } from 'uuid';
import Bottleneck from 'bottleneck';

/**
 * OpenRouter API Configuration
 */
const OPENROUTER_CONFIG = {
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY,
  defaultModel: process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4-fast:free',
  timeout: 120000, // 2 minutes
  maxRetries: 3
};

/**
 * xAI Model Configuration with OpenRouter
 */
interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  costPerInputToken: number;  // USD per token
  costPerOutputToken: number; // USD per token
  maxOutputTokens: number;
  capabilities: string[];
  available: boolean;
}

const XAI_MODELS: Record<string, ModelInfo> = {
  'x-ai/grok-4-fast:free': {
    id: 'x-ai/grok-4-fast:free',
    name: 'Grok 4 Fast (Free)',
    contextWindow: 2000000,
    costPerInputToken: 0, // Free during limited time
    costPerOutputToken: 0, // Free during limited time
    maxOutputTokens: 30000,
    capabilities: ['reasoning', 'multimodal', 'tools'],
    available: true
  },
  'x-ai/grok-4': {
    id: 'x-ai/grok-4',
    name: 'Grok 4',
    contextWindow: 256000,
    costPerInputToken: 0.000003, // $3/M tokens
    costPerOutputToken: 0.000015, // $15/M tokens (scales up for >128k tokens)
    maxOutputTokens: 30000,
    capabilities: ['reasoning', 'multimodal', 'tools'],
    available: true
  },
  'x-ai/grok-3': {
    id: 'x-ai/grok-3',
    name: 'Grok 3',
    contextWindow: 256000,
    costPerInputToken: 0.000002, // $2/M tokens
    costPerOutputToken: 0.00001, // $10/M tokens
    maxOutputTokens: 30000,
    capabilities: ['reasoning', 'multimodal'],
    available: true
  }
};

/**
 * Model Selection Strategy
 */
class ModelSelectionAgent {
  private fallbackChain: string[];
  private modelInfo: Record<string, ModelInfo>;

  constructor() {
    this.fallbackChain = [
      'x-ai/grok-4-fast:free',      // Primary free model (2M context)
      'x-ai/grok-4',                // Paid model fallback
      'x-ai/grok-3'                 // Last resort
    ];
    this.modelInfo = XAI_MODELS;
  }

  /**
   * Select optimal model based on requirements and availability
   */
  selectModel(options: {
    preferredModel?: string;
    maxCost?: number;
    requiredContextWindow?: number;
    requiredCapabilities?: string[];
  } = {}): string {
    const { 
      preferredModel = OPENROUTER_CONFIG.defaultModel,
      maxCost,
      requiredContextWindow = 0,
      requiredCapabilities = []
    } = options;

    // Try preferred model first if it meets requirements
    if (this.isModelSuitable(preferredModel, maxCost, requiredContextWindow, requiredCapabilities)) {
      return preferredModel;
    }

    // Fall back through the chain
    for (const modelId of this.fallbackChain) {
      if (this.isModelSuitable(modelId, maxCost, requiredContextWindow, requiredCapabilities)) {
        logger.info(`Model fallback: ${preferredModel} → ${modelId}`, {
          reason: 'preferred_model_unsuitable',
          preferredModel,
          selectedModel: modelId
        });
        return modelId;
      }
    }

    // Default to primary model if no suitable model found
    logger.warn(`No suitable model found, defaulting to ${OPENROUTER_CONFIG.defaultModel}`, {
      preferredModel,
      maxCost,
      requiredContextWindow,
      requiredCapabilities
    });
    
    return OPENROUTER_CONFIG.defaultModel;
  }

  /**
   * Check if model meets requirements
   */
  private isModelSuitable(
    modelId: string, 
    maxCost?: number, 
    requiredContextWindow?: number, 
    requiredCapabilities?: string[]
  ): boolean {
    const model = this.modelInfo[modelId];
    if (!model || !model.available) return false;

    // Check context window requirement
    if (requiredContextWindow && model.contextWindow < requiredContextWindow) {
      return false;
    }

    // Check capability requirements
    if (requiredCapabilities && requiredCapabilities.length > 0) {
      const hasAllCapabilities = requiredCapabilities.every(cap => 
        model.capabilities.includes(cap)
      );
      if (!hasAllCapabilities) return false;
    }

    // Check cost constraint (estimate for 10k tokens)
    if (maxCost) {
      const estimatedCost = (model.costPerInputToken * 10000) + (model.costPerOutputToken * 3000);
      if (estimatedCost > maxCost) return false;
    }

    return true;
  }

  /**
   * Get next model in fallback chain
   */
  getNextModel(currentModel: string): string | null {
    const currentIndex = this.fallbackChain.indexOf(currentModel);
    if (currentIndex === -1 || currentIndex >= this.fallbackChain.length - 1) {
      return null;
    }
    return this.fallbackChain[currentIndex + 1];
  }

  /**
   * Get model information
   */
  getModelInfo(modelId: string): ModelInfo | null {
    return this.modelInfo[modelId] || null;
  }
}

/**
 * OpenRouter Request/Response Types
 */
export type OpenRouterMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type OpenRouterRequestOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  metadata?: Record<string, string>;
  requestType?: 'standard' | 'batch' | 'premium';
  timeout?: number;
  abortSignal?: AbortSignal;
  retryConfig?: Partial<RetryConfig>;
  costLimit?: number;
  requiredCapabilities?: string[];
};

export type OpenRouterResponse = {
  id: string;
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
  executionMetadata?: {
    attempts: number;
    executionTimeMs: number;
    fallbackUsed: boolean;
    originalModel?: string;
  };
  // Additional properties for compatibility
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  attempts: number;
  executionTimeMs: number;
  fallbackUsed: boolean;
  originalModel?: string;
};

/**
 * OpenRouter AI Client with xAI Intelligence
 */
export class OpenRouterClient {
  private limiter: Bottleneck;
  private modelAgent: ModelSelectionAgent;
  private totalTokensUsed: { input: number; output: number };
  private totalCost: number;
  private serviceName = 'openrouter-xai';

  constructor(apiKey?: string) {
    if (!OPENROUTER_CONFIG.apiKey && !apiKey) {
      logger.warn('No OpenRouter API key provided. Set TLDRSEC_AI_SUMMARIZER or OPENROUTER_API_KEY in environment variables.');
    }

    // Initialize rate limiter (OpenRouter has generous limits)
    this.limiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 200, // 5 requests per second
    });

    // Initialize model selection agent
    this.modelAgent = new ModelSelectionAgent();

    // Initialize tracking
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;
  }

  /**
   * Send message to OpenRouter xAI models with intelligent fallback
   */
  async sendMessage(
    messages: OpenRouterMessage[],
    options: OpenRouterRequestOptions = {}
  ): Promise<OpenRouterResponse> {
    const requestId = uuidv4();
    const originalModel = options.model || OPENROUTER_CONFIG.defaultModel;
    const maxTokens = options.maxTokens || 4000;
    const temperature = options.temperature ?? 0.1;
    const requestType = options.requestType || 'standard';
    const abortController = new TimeoutAbortController();
    const timeout = options.timeout || OPENROUTER_CONFIG.timeout;

    // Select optimal model
    const selectedModel = this.modelAgent.selectModel({
      preferredModel: originalModel,
      maxCost: options.costLimit,
      requiredCapabilities: options.requiredCapabilities
    });

    if (timeout) {
      abortController.setTimeout(timeout);
    }

    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        abortController.abort(options.abortSignal?.reason);
      });
    }

    logger.info(`Starting OpenRouter request`, {
      model: selectedModel,
      originalModel,
      requestId,
      requestType
    });

    const startTime = Date.now();
    monitoring.startTimer(`openrouter.request.${requestType}`);

    try {
      // Configure retry behavior
      const retryConfig: RetryConfig = {
        ...DefaultRetryConfig,
        ...options.retryConfig,
        onRetry: (error, attempt, delay) => {
          logger.warn(`Retry attempt ${attempt} for OpenRouter API after ${delay}ms delay`, {
            error: error.message,
            attempt,
            delay,
            requestId,
            model: selectedModel
          });
          monitoring.incrementCounter('openrouter.retry', 1);
        }
      };

      // Configure circuit breaker
      const circuitBreakerConfig: CircuitBreakerConfig = {
        ...DefaultCircuitBreakerConfig,
        failureThreshold: requestType === 'premium' ? 8 : 5
      };

      // Execute with model fallback and retry
      const result = await this.executeWithModelFallback(
        selectedModel,
        originalModel,
        messages,
        maxTokens,
        temperature,
        options.system || '',
        abortController.signal,
        retryConfig,
        circuitBreakerConfig,
        requestId
      );

      const executionTimeMs = Date.now() - startTime;
      
      // Clear timeout
      abortController.clearTimeout();

      // Record metrics
      monitoring.stopTimer(`openrouter.request.${requestType}`);
      monitoring.recordTiming('openrouter.request.duration', executionTimeMs);
      monitoring.recordTiming('openrouter.cost', result.cost.totalCost);

      // Update tracking
      this.totalTokensUsed.input += result.usage.inputTokens;
      this.totalTokensUsed.output += result.usage.outputTokens;
      this.totalCost += result.cost.totalCost;

      logger.info(`OpenRouter request completed successfully`, {
        model: result.model,
        originalModel,
        requestId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        fallbackUsed: result.model !== selectedModel,
        duration: executionTimeMs,
        cost: result.cost.totalCost
      });

      return result;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      
      // Record failure metrics
      monitoring.stopTimer(`openrouter.request.${requestType}`);
      monitoring.recordTiming('openrouter.request.duration', executionTimeMs);
      monitoring.incrementCounter('openrouter.error', 1);
      
      abortController.clearTimeout();
      
      logger.error(`Error in OpenRouter request:`, {
        error: error.message,
        model: selectedModel,
        originalModel,
        requestId,
        stack: error.stack
      });
      
      throw this.normalizeError(error, requestId);
    }
  }

  /**
   * Execute request with model fallback capability
   */
  private async executeWithModelFallback(
    selectedModel: string,
    originalModel: string,
    messages: OpenRouterMessage[],
    maxTokens: number,
    temperature: number,
    system: string,
    abortSignal: AbortSignal,
    retryConfig: RetryConfig,
    circuitBreakerConfig: CircuitBreakerConfig,
    requestId: string
  ): Promise<OpenRouterResponse> {
    let currentModel = selectedModel;
    let attempts = 0;
    const maxModelAttempts = 3;

    while (attempts < maxModelAttempts) {
      attempts++;
      
      try {
        const result = await this.limiter.schedule(() =>
          executeWithRetry(
            async () => this.makeOpenRouterRequest(
              currentModel,
              messages,
              maxTokens,
              temperature,
              system,
              abortSignal
            ),
            `${this.serviceName}-${currentModel}`,
            retryConfig,
            circuitBreakerConfig
          )
        );

        // Success - calculate costs and return
        const modelInfo = this.modelAgent.getModelInfo(currentModel);
        if (!modelInfo) {
          throw new Error(`Model info not found for ${currentModel}`);
        }

        const usage = {
          inputTokens: result.usage?.prompt_tokens || 0,
          outputTokens: result.usage?.completion_tokens || 0,
        };

        const cost = {
          inputCost: usage.inputTokens * modelInfo.costPerInputToken,
          outputCost: usage.outputTokens * modelInfo.costPerOutputToken,
          totalCost: 0
        };
        cost.totalCost = cost.inputCost + cost.outputCost;

        const content = this.extractContent(result.choices?.[0]?.message?.content || '');

        return {
          id: result.id || requestId,
          content,
          model: currentModel,
          usage,
          cost,
          executionMetadata: {
            attempts,
            executionTimeMs: Date.now(),
            fallbackUsed: currentModel !== selectedModel,
            originalModel: currentModel !== selectedModel ? selectedModel : undefined
          },
          // Compatibility properties
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalCost: cost.totalCost,
          attempts,
          executionTimeMs: Date.now(),
          fallbackUsed: currentModel !== selectedModel,
          originalModel: currentModel !== selectedModel ? selectedModel : undefined
        };

      } catch (error) {
        logger.warn(`Model ${currentModel} failed on attempt ${attempts}`, {
          error: error.message,
          requestId,
          currentModel,
          attempts
        });

        // Try next model in fallback chain
        const nextModel = this.modelAgent.getNextModel(currentModel);
        if (nextModel && attempts < maxModelAttempts) {
          logger.info(`Falling back to model ${nextModel}`, {
            failedModel: currentModel,
            nextModel,
            requestId
          });
          currentModel = nextModel;
        } else {
          // No more models to try
          logger.error(`All model fallbacks exhausted`, {
            originalModel: selectedModel,
            lastAttemptedModel: currentModel,
            totalAttempts: attempts,
            requestId
          });
          throw error;
        }
      }
    }

    throw new Error(`All model fallback attempts failed after ${attempts} attempts`);
  }

  /**
   * Make actual OpenRouter API request
   */
  private async makeOpenRouterRequest(
    model: string,
    messages: OpenRouterMessage[],
    maxTokens: number,
    temperature: number,
    system: string,
    abortSignal: AbortSignal
  ) {
    const apiKey = OPENROUTER_CONFIG.apiKey;
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Prepare messages with system message
    const formattedMessages = system ? 
      [{ role: 'system' as const, content: system }, ...messages] : 
      messages;

    const requestBody = {
      model,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    };

    logger.debug(`Making OpenRouter API request`, {
      model,
      messageCount: formattedMessages.length,
      maxTokens,
      temperature
    });

    const response = await fetch(`${OPENROUTER_CONFIG.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://tldrsec.app',
        'X-Title': 'TLDRSEC.AI'
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`OpenRouter API error`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        model
      });
      
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * Extract content from OpenRouter response
   */
  private extractContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content.map(block => {
        if (typeof block === 'string') return block;
        if (block && block.text) return block.text;
        return '';
      }).join('\n');
    }
    
    return String(content || '');
  }

  /**
   * Normalize OpenRouter API errors
   */
  private normalizeError(error: unknown, requestId?: string): ApiError {
    if (error instanceof ApiError) {
      return error;
    }
    
    // Check for abort errors
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      return createTimeoutError(
        'Request was aborted or timed out',
        { originalError: error.message },
        requestId
      );
    }
    
    // Parse OpenRouter API error responses
    const message = error?.message || String(error);
    
    if (message.includes('rate limit') || message.includes('429')) {
      return createAiQuotaExceededError(
        `OpenRouter API rate limit exceeded: ${message}`,
        { originalError: message },
        undefined,
        requestId
      );
    }
    
    if (message.includes('context window') || message.includes('token limit')) {
      return createAiContextWindowExceededError(
        `OpenRouter API context window exceeded: ${message}`,
        { originalError: message },
        requestId
      );
    }
    
    if (message.includes('content policy') || message.includes('filtered')) {
      return createAiContentFilteredError(
        `OpenRouter API content filtered: ${message}`,
        { originalError: message },
        requestId
      );
    }
    
    if (message.includes('503') || message.includes('502') || message.includes('unavailable')) {
      return createAiUnavailableError(
        `OpenRouter API service unavailable: ${message}`,
        { originalError: message },
        requestId
      );
    }
    
    if (message.includes('401') || message.includes('unauthorized')) {
      return createAiModelError(
        `OpenRouter API authentication error: ${message}`,
        { originalError: message },
        requestId
      );
    }
    
    // Default to generic model error
    return createAiModelError(
      `OpenRouter API error: ${message}`,
      { originalError: message },
      requestId
    );
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return {
      totalInputTokens: this.totalTokensUsed.input,
      totalOutputTokens: this.totalTokensUsed.output,
      totalCost: this.totalCost,
    };
  }

  /**
   * Reset usage tracking
   */
  resetUsage() {
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;
    logger.info('OpenRouter client usage statistics reset');
  }

  /**
   * Get available models
   */
  getAvailableModels(): Record<string, ModelInfo> {
    return XAI_MODELS;
  }
}

// Export singleton instance
export const openRouterClient = new OpenRouterClient();

// Export default for compatibility
export default OpenRouterClient;