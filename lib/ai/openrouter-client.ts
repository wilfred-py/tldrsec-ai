/**
 * OpenRouter AI Client with xAI Model Intelligence
 * 
 * Provides intelligent model selection, fallback handling, and cost optimization
 * for xAI models through OpenRouter API with sophisticated error handling
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { getDefaultModel, getFallbackModel } from './config';
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
  defaultModel: getDefaultModel(),
  timeout: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '270000', 10), // 4.5 minutes - just under Vercel free plan limit
  maxRetries: 0, // Eliminated retries - use model fallback instead
  fallbackTimeout: parseInt(process.env.OPENROUTER_FALLBACK_TIMEOUT_MS || '120000', 10), // 2 minutes for fallback models
  circuitBreakerThreshold: 3 // Open circuit after 3 failures (reduced from 5)
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
  priority: number; // For fallback ordering (lower = higher priority)
  timeout: number; // Model-specific timeout
  circuitBreakerState?: CircuitBreakerState;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  resetTimeout: number;
}

const XAI_MODELS: Record<string, ModelInfo> = {
  'x-ai/grok-4-fast-reasoning': {
    id: 'x-ai/grok-4-fast-reasoning',
    name: 'Grok 4 Fast Reasoning',
    contextWindow: 2000000, // 2M tokens
    costPerInputToken: 0.0000003, // $0.30/M tokens
    costPerOutputToken: 0.0000005, // $0.50/M tokens
    maxOutputTokens: 8000,
    priority: 1, // Highest priority (primary model)
    timeout: 20000 // 20 seconds for reliable response
  },
  'anthropic/claude-3-haiku': {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    contextWindow: 200000,
    costPerInputToken: 0.00000025, // $0.25/M tokens
    costPerOutputToken: 0.00000125, // $1.25/M tokens
    maxOutputTokens: 4096,
    priority: 2, // Reliable fallback
    timeout: 15000 // 15 seconds
  },
  'openai/gpt-3.5-turbo': {
    id: 'openai/gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    contextWindow: 16385,
    costPerInputToken: 0.0000005, // $0.50/M tokens
    costPerOutputToken: 0.0000015, // $1.50/M tokens
    maxOutputTokens: 4096,
    priority: 3, // Last resort fallback
    timeout: 10000 // 10 seconds for fastest response
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
      getDefaultModel(),            // Primary model from env
      getFallbackModel(),           // Fallback model from env
      'anthropic/claude-3-haiku',   // Reliable fallback
      'openai/gpt-3.5-turbo'        // Last resort
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
    _requiredCapabilities?: string[]
  ): boolean {
    const model = this.modelInfo[modelId];
    if (!model) return false;

    // Check context window requirement
    if (requiredContextWindow && model.contextWindow < requiredContextWindow) {
      return false;
    }

    // Note: Capability checking removed since capabilities property was removed from ModelInfo
    // All xAI models have basic reasoning capabilities by default

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
  remainingExecutionTime?: number; // Time remaining in execution context for dynamic timeout calculation
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
/**
 * Model-specific Circuit Breaker Manager
 */
class ModelCircuitBreakerManager {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private readonly failureThreshold = OPENROUTER_CONFIG.circuitBreakerThreshold;
  private readonly resetTimeoutMs = 60000; // 1 minute

  isModelAvailable(modelId: string): boolean {
    const breaker = this.circuitBreakers.get(modelId);
    if (!breaker) return true;

    if (breaker.isOpen) {
      const now = Date.now();
      if (now - breaker.lastFailureTime > this.resetTimeoutMs) {
        // Reset circuit breaker
        breaker.isOpen = false;
        breaker.failures = 0;
        logger.info(`Circuit breaker reset for model ${modelId}`);
        return true;
      }
      return false;
    }
    return true;
  }

  recordFailure(modelId: string, error: Error): void {
    let breaker = this.circuitBreakers.get(modelId);
    if (!breaker) {
      breaker = {
        failures: 0,
        lastFailureTime: 0,
        isOpen: false,
        resetTimeout: this.resetTimeoutMs
      };
      this.circuitBreakers.set(modelId, breaker);
    }

    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failures >= this.failureThreshold) {
      breaker.isOpen = true;
      logger.warn(`Circuit breaker opened for model ${modelId}`, {
        failures: breaker.failures,
        error: error.message
      });
    }
  }

  recordSuccess(modelId: string): void {
    const breaker = this.circuitBreakers.get(modelId);
    if (breaker) {
      breaker.failures = Math.max(0, breaker.failures - 1);
      if (breaker.failures === 0) {
        breaker.isOpen = false;
      }
    }
  }

  getStats(): Record<string, { failures: number; isOpen: boolean }> {
    const stats: Record<string, { failures: number; isOpen: boolean }> = {};
    this.circuitBreakers.forEach((breaker, modelId) => {
      stats[modelId] = {
        failures: breaker.failures,
        isOpen: breaker.isOpen
      };
    });
    return stats;
  }
}

export class OpenRouterClient {
  private limiter: Bottleneck;
  private modelAgent: ModelSelectionAgent;
  private circuitBreakerManager: ModelCircuitBreakerManager;
  private totalTokensUsed: { input: number; output: number };
  private totalCost: number;
  private serviceName = 'openrouter-xai';

  constructor(apiKey?: string) {
    // ENHANCED DEBUG: Log OpenRouter client initialization
    const configuredApiKey = OPENROUTER_CONFIG.apiKey || apiKey;
    const hasApiKey = !!configuredApiKey;
    const apiKeySource = process.env.TLDRSEC_AI_SUMMARIZER ? 'TLDRSEC_AI_SUMMARIZER' : 
                        process.env.OPENROUTER_API_KEY ? 'OPENROUTER_API_KEY' : 
                        apiKey ? 'constructor_param' : 'none';
    
    logger.info('🔧 OpenRouter Client Initialization', {
      hasApiKey,
      apiKeySource,
      apiKeyFormat: hasApiKey ? `${configuredApiKey.substring(0, 8)}...` : 'none',
      defaultModel: OPENROUTER_CONFIG.defaultModel,
      availableEnvVars: {
        TLDRSEC_AI_SUMMARIZER: !!process.env.TLDRSEC_AI_SUMMARIZER,
        OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
        DEFAULT_AI_MODEL: !!process.env.DEFAULT_AI_MODEL,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY
      }
    });

    if (!configuredApiKey) {
      logger.error('❌ CRITICAL: No OpenRouter API key configured!', {
        message: 'OpenRouter API calls will fail',
        requiredEnvVars: ['TLDRSEC_AI_SUMMARIZER', 'OPENROUTER_API_KEY'],
        recommendation: 'Set either TLDRSEC_AI_SUMMARIZER or OPENROUTER_API_KEY environment variable'
      });
    }

    // Initialize rate limiter (OpenRouter has generous limits)
    this.limiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 200, // 5 requests per second
    });

    // Initialize model selection agent
    this.modelAgent = new ModelSelectionAgent();

    // Initialize circuit breaker manager
    this.circuitBreakerManager = new ModelCircuitBreakerManager();

    // Initialize tracking
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;

    logger.info('✅ OpenRouter Client initialized successfully', {
      hasValidConfiguration: hasApiKey,
      defaultModel: OPENROUTER_CONFIG.defaultModel,
      serviceName: this.serviceName
    });
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
    // Calculate dynamic timeout based on remaining execution time
    const dynamicTimeout = this.calculateDynamicTimeout(options.remainingExecutionTime);
    const timeout = options.timeout || dynamicTimeout || OPENROUTER_CONFIG.timeout;

    // Select optimal model with circuit breaker check
    const selectedModel = this.selectAvailableModel({
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

    // ENHANCED DEBUG: Log comprehensive request details
    logger.info(`🚀 OPENROUTER API CALL INITIATED`, {
      requestId,
      selectedModel,
      originalModel,
      requestType,
      hasApiKey: !!OPENROUTER_CONFIG.apiKey,
      apiKeyFormat: OPENROUTER_CONFIG.apiKey ? `${OPENROUTER_CONFIG.apiKey.substring(0, 8)}...` : 'none',
      messageCount: messages.length,
      maxTokens,
      temperature,
      timeout,
      circuitBreakerStats: this.circuitBreakerManager.getStats(),
      configuredOptions: {
        costLimit: options.costLimit,
        requiredCapabilities: options.requiredCapabilities,
        remainingExecutionTime: options.remainingExecutionTime
      }
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

      // ENHANCED DEBUG: Log successful response with comprehensive details
      logger.info(`✅ OPENROUTER API CALL SUCCESSFUL`, {
        requestId,
        actualModel: result.model,
        originalModel,
        selectedModel,
        fallbackUsed: result.model !== selectedModel,
        executionTimeMs,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.inputTokens + result.usage.outputTokens
        },
        cost: {
          inputCost: result.cost.inputCost,
          outputCost: result.cost.outputCost,
          totalCost: result.cost.totalCost
        },
        responseMetrics: {
          contentLength: result.content?.length || 0,
          responseId: result.id,
          attempts: result.attempts || 1
        },
        clientStats: {
          totalInputTokens: this.totalTokensUsed.input + result.usage.inputTokens,
          totalOutputTokens: this.totalTokensUsed.output + result.usage.outputTokens,
          totalCostUSD: this.totalCost + result.cost.totalCost
        }
      });

      return result;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      
      // Record failure metrics
      monitoring.stopTimer(`openrouter.request.${requestType}`);
      monitoring.recordTiming('openrouter.request.duration', executionTimeMs);
      monitoring.incrementCounter('openrouter.error', 1);
      
      abortController.clearTimeout();
      
      // ENHANCED DEBUG: Log comprehensive error details
      logger.error(`❌ OPENROUTER API CALL FAILED`, {
        requestId,
        selectedModel,
        originalModel,
        requestType,
        errorDetails: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined
        },
        requestConfig: {
          hasApiKey: !!OPENROUTER_CONFIG.apiKey,
          baseURL: OPENROUTER_CONFIG.baseURL,
          timeout,
          maxTokens,
          temperature
        },
        executionTimeMs,
        circuitBreakerStats: this.circuitBreakerManager.getStats(),
        recommendation: 'Check API key validity, network connectivity, and model availability'
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

        // Record success in circuit breaker
        this.circuitBreakerManager.recordSuccess(currentModel);

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
        // Record failure in circuit breaker
        this.circuitBreakerManager.recordFailure(currentModel, error instanceof Error ? error : new Error(String(error)));

        logger.warn(`Model ${currentModel} failed on attempt ${attempts}`, {
          error: error instanceof Error ? error.message : String(error),
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

    // ENHANCED DEBUG: Log actual HTTP request details
    logger.info(`🌐 HTTP REQUEST TO OPENROUTER`, {
      url: `${OPENROUTER_CONFIG.baseURL}/chat/completions`,
      method: 'POST',
      model,
      messageCount: formattedMessages.length,
      maxTokens,
      temperature,
      hasSystemMessage: !!system,
      requestBodySize: JSON.stringify(requestBody).length,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.substring(0, 8)}...`,
        'HTTP-Referer': 'https://tldrsec.app',
        'X-Title': 'TLDRSEC.AI'
      }
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
    
    // ENHANCED DEBUG: Log successful HTTP response
    logger.info(`📥 HTTP RESPONSE FROM OPENROUTER`, {
      status: response.status,
      statusText: response.statusText,
      model,
      responseSize: JSON.stringify(result).length,
      hasChoices: !!result.choices && result.choices.length > 0,
      usage: result.usage || null,
      id: result.id || 'unknown',
      contentPreview: result.choices?.[0]?.message?.content?.substring(0, 100) + '...' || 'no content'
    });
    
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
    const errorObj = error as { name?: string; message?: string };
    if (errorObj?.name === 'AbortError' || errorObj?.message?.includes('aborted')) {
      return createTimeoutError(
        'Request was aborted or timed out',
        { originalError: errorObj?.message },
        requestId
      );
    }
    
    // Parse OpenRouter API error responses
    const message = errorObj?.message || String(error);
    
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
   * Calculate dynamic timeout based on remaining execution time
   */
  private calculateDynamicTimeout(remainingTime?: number): number | undefined {
    if (!remainingTime) return undefined;

    // Use 60% of remaining time for AI processing, minimum 20s, maximum 45s
    const dynamicTimeout = Math.max(20000, Math.min(remainingTime * 0.6, 45000));
    
    logger.debug('Calculated dynamic timeout', {
      remainingTime,
      dynamicTimeout,
      percentageUsed: (dynamicTimeout / remainingTime) * 100
    });

    return dynamicTimeout;
  }

  /**
   * Select available model checking circuit breaker status
   */
  private selectAvailableModel(options: {
    preferredModel?: string;
    maxCost?: number;
    requiredCapabilities?: string[];
  }): string {
    const { preferredModel = OPENROUTER_CONFIG.defaultModel } = options;

    // Check if preferred model is available via circuit breaker
    if (this.circuitBreakerManager.isModelAvailable(preferredModel)) {
      const selectedModel = this.modelAgent.selectModel({
        preferredModel,
        maxCost: options.maxCost,
        requiredCapabilities: options.requiredCapabilities
      });
      
      // If selected model is same as preferred and circuit breaker allows it
      if (selectedModel === preferredModel) {
        return selectedModel;
      }
    }

    // Try fallback models that are available
    const fallbackChain = [getDefaultModel(), getFallbackModel(), 'anthropic/claude-3-haiku'];
    
    for (const modelId of fallbackChain) {
      if (this.circuitBreakerManager.isModelAvailable(modelId)) {
        const selectedModel = this.modelAgent.selectModel({
          preferredModel: modelId,
          maxCost: options.maxCost,
          requiredCapabilities: options.requiredCapabilities
        });
        
        if (selectedModel === modelId) {
          logger.info(`Model fallback due to circuit breaker`, {
            originalModel: preferredModel,
            selectedModel: modelId,
            reason: 'circuit_breaker_open'
          });
          return selectedModel;
        }
      }
    }

    // Last resort: use default model even if circuit breaker is open
    logger.warn(`All models circuit breaker open, using default model`, {
      preferredModel,
      defaultModel: OPENROUTER_CONFIG.defaultModel,
      circuitBreakerStats: this.circuitBreakerManager.getStats()
    });
    
    return OPENROUTER_CONFIG.defaultModel;
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats(): Record<string, { failures: number; isOpen: boolean }> {
    return this.circuitBreakerManager.getStats();
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