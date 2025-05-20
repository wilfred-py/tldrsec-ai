import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ClaudeConfig } from './config';
import Bottleneck from 'bottleneck';
import { v4 as uuidv4 } from 'uuid';
import { 
  ApiError, 
  ErrorCode, 
  createAiQuotaExceededError,
  createAiContextWindowExceededError,
  createAiContentFilteredError,
  createAiUnavailableError,
  createAiModelError,
  createAiParsingError,
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
import { 
  executeWithModelFallback, 
  FallbackConfig, 
  DefaultClaudeFallback,
  BatchClaudeFallback, 
  PremiumClaudeFallback,
  ModelCapability,
  selectModelByCost
} from '../error-handling/model-fallback';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

/**
 * Type definitions for Claude API requests and responses
 */
export type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ClaudeRequestOptions = {
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
  requiredCapabilities?: ModelCapability[];
};

export type ClaudeResponse = {
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
};

// Type for executeWithModelFallback return value
type ModelFallbackResult<T> = {
  result: T;
  modelUsed: string;
  attempts: number;
  executionTimeMs: number;
};

/**
 * Claude AI Client
 * Handles communication with the Anthropic Claude API with:
 * - Authentication
 * - Rate limiting
 * - Advanced error handling
 * - Exponential backoff retries
 * - Circuit breaker protection
 * - Intelligent model fallback
 * - Cost tracking and optimization
 * - Performance monitoring
 */
export class ClaudeClient {
  private anthropic: Anthropic;
  private limiter: Bottleneck;
  private totalTokensUsed: { input: number; output: number };
  private totalCost: number;
  private serviceName = 'anthropic-claude';

  constructor(apiKey?: string) {
    // Initialize the Anthropic client
    this.anthropic = new Anthropic({
      apiKey: apiKey || ClaudeConfig.apiKey,
    });

    // Initialize rate limiter
    this.limiter = new Bottleneck({
      maxConcurrent: ClaudeConfig.rateLimit.concurrentRequests,
      minTime: 60000 / ClaudeConfig.rateLimit.maxRequests, // Distribute requests evenly
    });

    // Initialize tracking
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;

    // Validate API key
    if (!apiKey && !ClaudeConfig.apiKey) {
      logger.warn('No Anthropic API key provided. Set ANTHROPIC_API_KEY in your environment variables.');
    }
  }

  /**
   * Complete a chat with Claude (newer API format)
   * @param params Chat completion parameters
   * @returns Response from Claude API
   */
  async completeChat(
    params: {
      model: string;
      messages: MessageParam[];
      max_tokens?: number;
      temperature?: number;
      system?: string;
    },
    options: Omit<ClaudeRequestOptions, 'model' | 'maxTokens' | 'temperature' | 'system'> = {}
  ) {
    const requestId = uuidv4();
    const requestType = options.requestType || 'standard';
    const abortController = new TimeoutAbortController();
    const timeout = options.timeout || ClaudeConfig.timeout;
    
    // Set timeout if specified
    if (timeout) {
      abortController.setTimeout(timeout);
    }
    
    // Use external abort signal if provided
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        abortController.abort(options.abortSignal?.reason);
      });
    }
    
    logger.info(`Starting chat completion with model ${params.model}`, {
      model: params.model,
      requestId,
      requestType
    });
    
    // Start monitoring timing
    const startTime = Date.now();
    monitoring.startTimer(`claude.request.${requestType}`);

    try {
      // Configure retry behavior
      const retryConfig: RetryConfig = {
        ...DefaultRetryConfig,
        ...options.retryConfig,
        onRetry: (error, attempt, delay) => {
          logger.warn(`Retry attempt ${attempt} for Claude API after ${delay}ms delay`, {
            error: error.message,
            attempt,
            delay,
            requestId
          });
          
          monitoring.incrementCounter('claude.retry', 1, {
            model: params.model,
            requestType
          });
        }
      };
      
      // Configure circuit breaker
      const circuitBreakerConfig: CircuitBreakerConfig = {
        ...DefaultCircuitBreakerConfig,
        // Higher threshold for premium requests
        failureThreshold: requestType === 'premium' ? 8 : 5
      };
      
      // Configure fallback chain based on request type
      const fallbackConfig: FallbackConfig = options.requiredCapabilities ? 
        {
          ...(requestType === 'batch' ? BatchClaudeFallback : 
             requestType === 'premium' ? PremiumClaudeFallback : 
             DefaultClaudeFallback),
          initialModel: params.model,
          requiredCapabilities: options.requiredCapabilities
        } : 
        {
          ...(requestType === 'batch' ? BatchClaudeFallback : 
             requestType === 'premium' ? PremiumClaudeFallback : 
             DefaultClaudeFallback),
          initialModel: params.model
        };
        
      // Execute with model fallback capabilities
      const result = await this.limiter.schedule<ModelFallbackResult<Anthropic.Messages.Message>>(() => 
        executeWithModelFallback(
          async (modelId) => {
            // Use the retry system with circuit breaker
            return executeWithRetry(
              async () => this.anthropic.messages.create({
                model: modelId,
                max_tokens: params.max_tokens || ClaudeConfig.maxTokens,
                temperature: params.temperature ?? ClaudeConfig.temperature,
                system: params.system || '',
                messages: params.messages,
              }, {
                // Pass abort signal as separate request option
                signal: abortController.signal
              }),
              `${this.serviceName}-${modelId}`,
              retryConfig,
              circuitBreakerConfig
            );
          },
          fallbackConfig,
          this.serviceName,
          retryConfig,
          circuitBreakerConfig
        )
      );

      const { modelUsed, attempts, executionTimeMs } = result;
      const responseResult = result.result;

      // Record timing metrics
      monitoring.stopTimer(`claude.request.${requestType}`);
      monitoring.recordValue('claude.request.duration', Date.now() - startTime, {
        model: modelUsed,
        requestType,
        success: 'true'
      });
      
      // Clear the timeout if it was set
      abortController.clearTimeout();
      
      // Update tracking
      this.totalTokensUsed.input += responseResult.usage?.input_tokens || 0;
      this.totalTokensUsed.output += responseResult.usage?.output_tokens || 0;

      // Calculate cost
      const modelInfo = ClaudeConfig.modelInfo[modelUsed as keyof typeof ClaudeConfig.modelInfo] || {
        costPerInputToken: 0,
        costPerOutputToken: 0,
      };
      
      const inputCost = (responseResult.usage?.input_tokens || 0) * modelInfo.costPerInputToken;
      const outputCost = (responseResult.usage?.output_tokens || 0) * modelInfo.costPerOutputToken;
      this.totalCost += inputCost + outputCost;
      
      // Record cost metrics
      monitoring.recordValue('claude.cost', inputCost + outputCost, {
        model: modelUsed,
        requestType
      });

      logger.info(`Chat completion completed successfully`, {
        model: modelUsed,
        originalModel: params.model,
        requestId,
        inputTokens: responseResult.usage?.input_tokens,
        outputTokens: responseResult.usage?.output_tokens,
        fallbackUsed: modelUsed !== params.model,
        duration: executionTimeMs
      });

      // Add metadata about model fallback
      responseResult.model = modelUsed;
      return {
        ...responseResult,
        executionMetadata: {
          attempts,
          executionTimeMs,
          fallbackUsed: modelUsed !== params.model,
          originalModel: modelUsed !== params.model ? params.model : undefined
        }
      };
    } catch (error: any) {
      // Record failure metrics
      monitoring.stopTimer(`claude.request.${requestType}`);
      monitoring.recordValue('claude.request.duration', Date.now() - startTime, {
        model: params.model,
        requestType,
        success: 'false'
      });
      monitoring.incrementCounter('claude.error', 1, {
        model: params.model,
        errorType: error instanceof ApiError ? error.code : 'UNKNOWN'
      });
      
      // Clear the timeout if it was set
      abortController.clearTimeout();
      
      logger.error(`Error in chat completion:`, {
        error: error.message,
        model: params.model,
        requestId,
        stack: error.stack
      });
      
      throw this.normalizeError(error, requestId);
    }
  }

  /**
   * Send a message to Claude and get a response with advanced error handling and fallback
   * @param messages An array of messages with role and content
   * @param options Optional parameters for the request
   * @returns Structured response from Claude
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {}
  ): Promise<ClaudeResponse> {
    const requestId = uuidv4();
    const model = options.model || ClaudeConfig.model;
    const maxTokens = options.maxTokens || ClaudeConfig.maxTokens;
    const temperature = options.temperature ?? ClaudeConfig.temperature;
    const system = options.system || '';
    const requestType = options.requestType || 'standard';
    const abortController = new TimeoutAbortController();
    const timeout = options.timeout || ClaudeConfig.timeout;
    
    // Estimate token counts for cost optimization if not using fallback
    const estimatedInputTokens = this.estimateTokenCount(
      messages.map(m => m.content).join(' ') + (system || '')
    );
    const estimatedOutputTokens = maxTokens;
    
    // Set timeout if specified
    if (timeout) {
      abortController.setTimeout(timeout);
    }
    
    // Use external abort signal if provided
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        abortController.abort(options.abortSignal?.reason);
      });
    }
    
    logger.info(`Starting Claude request`, {
      model,
      requestId,
      requestType,
      estimatedInputTokens,
      estimatedOutputTokens
    });
    
    // Start monitoring timing
    const startTime = Date.now();
    monitoring.startTimer(`claude.request.${requestType}`);

    try {
      // Configure retry behavior
      const retryConfig: RetryConfig = {
        ...DefaultRetryConfig,
        ...options.retryConfig,
        onRetry: (error, attempt, delay) => {
          logger.warn(`Retry attempt ${attempt} for Claude API after ${delay}ms delay`, {
            error: error.message,
            attempt,
            delay,
            requestId
          });
          
          monitoring.incrementCounter('claude.retry', 1, {
            model,
            requestType
          });
        }
      };
      
      // Configure circuit breaker
      const circuitBreakerConfig: CircuitBreakerConfig = {
        ...DefaultCircuitBreakerConfig,
        // Higher threshold for premium requests
        failureThreshold: requestType === 'premium' ? 8 : 5
      };
      
      // If cost limit is specified, select the best model within the cost limit
      let selectedModel = model;
      let useCostOptimization = false;
      
      if (options.costLimit && options.requiredCapabilities) {
        try {
          const optimalModel = selectModelByCost({
            estimatedInputTokens,
            estimatedOutputTokens,
            maxCost: options.costLimit,
            requiredCapabilities: options.requiredCapabilities
          });
          
          selectedModel = optimalModel.id;
          useCostOptimization = true;
          
          logger.info(`Cost optimization selected model ${selectedModel}`, {
            originalModel: model,
            selectedModel,
            estimatedCost: (optimalModel.costPerInputToken * estimatedInputTokens) + 
                          (optimalModel.costPerOutputToken * estimatedOutputTokens),
            costLimit: options.costLimit,
            requestId
          });
        } catch (error) {
          logger.warn(`Cost optimization failed, using original model ${model}`, {
            error: error instanceof Error ? error.message : String(error),
            requestId
          });
        }
      }
      
      // Configure fallback chain based on request type
      const fallbackConfig: FallbackConfig = options.requiredCapabilities ? 
        {
          ...(requestType === 'batch' ? BatchClaudeFallback : 
             requestType === 'premium' ? PremiumClaudeFallback : 
             DefaultClaudeFallback),
          initialModel: selectedModel,
          requiredCapabilities: options.requiredCapabilities
        } : 
        {
          ...(requestType === 'batch' ? BatchClaudeFallback : 
             requestType === 'premium' ? PremiumClaudeFallback : 
             DefaultClaudeFallback),
          initialModel: selectedModel
        };
        
      // Execute with model fallback capabilities
      const result = await this.limiter.schedule<ModelFallbackResult<Anthropic.Messages.Message>>(() => 
        executeWithModelFallback(
          async (modelId) => {
            // Use the retry system with circuit breaker
            return executeWithRetry(
              async () => this.anthropic.messages.create({
                model: modelId,
                max_tokens: maxTokens,
                temperature,
                system,
                messages: messages.map(m => ({
                  role: m.role,
                  content: m.content,
                })),
              }, {
                // Pass abort signal as separate request option
                signal: abortController.signal
              }),
              `${this.serviceName}-${modelId}`,
              retryConfig,
              circuitBreakerConfig
            );
          },
          fallbackConfig,
          this.serviceName,
          retryConfig,
          circuitBreakerConfig
        )
      );

      const { modelUsed, attempts, executionTimeMs } = result;
      const responseResult = result.result;

      // Extract content from the response
      const content = this.extractTextContent(responseResult.content);

      // Calculate token usage and cost
      const usage = {
        inputTokens: responseResult.usage?.input_tokens || 0,
        outputTokens: responseResult.usage?.output_tokens || 0,
      };

      const modelInfo = ClaudeConfig.modelInfo[modelUsed as keyof typeof ClaudeConfig.modelInfo] || {
        costPerInputToken: 0,
        costPerOutputToken: 0,
      };

      const cost = {
        inputCost: usage.inputTokens * modelInfo.costPerInputToken,
        outputCost: usage.outputTokens * modelInfo.costPerOutputToken,
        totalCost: 0,
      };
      cost.totalCost = cost.inputCost + cost.outputCost;

      // Update tracking
      this.totalTokensUsed.input += usage.inputTokens;
      this.totalTokensUsed.output += usage.outputTokens;
      this.totalCost += cost.totalCost;
      
      // Record metrics
      monitoring.stopTimer(`claude.request.${requestType}`);
      monitoring.recordValue('claude.request.duration', executionTimeMs, {
        model: modelUsed,
        requestType,
        success: 'true'
      });
      monitoring.recordValue('claude.cost', cost.totalCost, {
        model: modelUsed, 
        requestType
      });
      
      // Clear the timeout if it was set
      abortController.clearTimeout();

      logger.info(`Claude request completed successfully`, {
        model: modelUsed,
        originalModel: model,
        costOptimized: useCostOptimization,
        requestId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimateAccuracy: estimatedInputTokens > 0 ? 
          Math.round((usage.inputTokens / estimatedInputTokens) * 100) : 0,
        fallbackUsed: modelUsed !== selectedModel,
        duration: executionTimeMs,
        cost: cost.totalCost
      });

      return {
        id: responseResult.id,
        content,
        model: modelUsed,
        usage,
        cost,
        executionMetadata: {
          attempts,
          executionTimeMs,
          fallbackUsed: modelUsed !== selectedModel,
          originalModel: useCostOptimization ? model : 
                       (modelUsed !== selectedModel ? selectedModel : undefined)
        }
      };
    } catch (error: any) {
      // Record failure metrics
      monitoring.stopTimer(`claude.request.${requestType}`);
      monitoring.recordValue('claude.request.duration', Date.now() - startTime, {
        model,
        requestType,
        success: 'false'
      });
      monitoring.incrementCounter('claude.error', 1, {
        model,
        errorType: error instanceof ApiError ? error.code : 'UNKNOWN'
      });
      
      // Clear the timeout if it was set
      abortController.clearTimeout();
      
      logger.error(`Error in Claude request:`, {
        error: error.message,
        model,
        requestId,
        stack: error.stack
      });
      
      throw this.normalizeError(error, requestId);
    }
  }

  /**
   * Extract text content from Claude API response blocks
   * @param contentBlocks Array of content blocks from Claude
   * @returns Combined text content
   */
  private extractTextContent(contentBlocks: Anthropic.ContentBlock[]): string {
    if (!Array.isArray(contentBlocks)) {
      return typeof contentBlocks === 'string' ? contentBlocks : '';
    }
    
    return contentBlocks
      .filter(block => block.type === 'text')
      .map(block => {
        if (block.type === 'text') {
          return block.text;
        }
        return '';
      })
      .join('\n');
  }

  /**
   * Estimate token count for input text
   * Very rough approximation, to be used for cost estimation only
   * @param text Input text to estimate
   * @returns Estimated token count
   */
  private estimateTokenCount(text: string): number {
    // Claude roughly uses 1 token per ~4 characters for English text
    const characterCount = text.length;
    return Math.ceil(characterCount / 4);
  }

  /**
   * Normalize errors from Claude API to consistent ApiError format
   * @param error Original error from Claude API
   * @param requestId Request ID for tracking
   * @returns Normalized ApiError
   */
  private normalizeError(error: any, requestId?: string): ApiError {
    // If it's already an ApiError, just return it
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
    
    // Parse Anthropic API error types
    if (error.status && error.type) {
      const status = error.status;
      const type = error.type;
      const message = error.message || 'Unknown Anthropic API error';
      
      // Rate limit errors
      if (status === 429 || type.includes('rate_limit') || type.includes('quota')) {
        return createAiQuotaExceededError(
          `Claude API rate limit exceeded: ${message}`,
          { statusCode: status, errorType: type },
          error.retryAfter ? error.retryAfter * 1000 : undefined,
          requestId
        );
      }
      
      // Context window errors
      if (type.includes('context_window') || message.includes('context window') || 
          message.includes('too many tokens')) {
        return createAiContextWindowExceededError(
          `Claude API context window exceeded: ${message}`,
          { statusCode: status, errorType: type },
          requestId
        );
      }
      
      // Content policy errors
      if (type.includes('content_policy') || message.includes('content policy') ||
          message.includes('violates') || message.includes('harmful')) {
        return createAiContentFilteredError(
          `Claude API content policy violation: ${message}`,
          { statusCode: status, errorType: type },
          requestId
        );
      }
      
      // Service availability errors
      if (status >= 500 || type.includes('unavailable') || type.includes('server')) {
        return createAiUnavailableError(
          `Claude API service error: ${message}`,
          { statusCode: status, errorType: type },
          requestId
        );
      }
      
      // General model errors
      if (type.includes('model') || type.includes('parameter')) {
        return createAiModelError(
          `Claude API model error: ${message}`,
          { statusCode: status, errorType: type },
          requestId
        );
      }
    }
    
    // Check for timeout errors
    if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
      return createTimeoutError(
        `Claude API request timed out: ${error.message}`,
        { originalError: error.message },
        requestId
      );
    }
    
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || error.message?.includes('network')) {
      return createAiUnavailableError(
        `Claude API network error: ${error.message}`,
        { originalError: error.message, code: error.code },
        requestId
      );
    }
    
    // JSON parsing errors
    if (error.message?.includes('JSON') || error.message?.includes('parse')) {
      return createAiParsingError(
        `Claude API response parsing error: ${error.message}`,
        { originalError: error.message },
        requestId
      );
    }
    
    // Default to generic AI model error
    return createAiModelError(
      `Claude API error: ${error.message || 'Unknown error'}`,
      { originalError: error.message || error.toString() },
      requestId
    );
  }

  /**
   * Get usage statistics
   * @returns Current token usage and cost information
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
    logger.info('Claude client usage statistics reset');
  }
}

// Export a singleton instance for convenience
export const claudeClient = new ClaudeClient(); 