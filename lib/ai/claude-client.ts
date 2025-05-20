import Anthropic from '@anthropic-ai/sdk';
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages';
import { ClaudeConfig } from './config';
import Bottleneck from 'bottleneck';
import { v4 as uuidv4 } from 'uuid';

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
};

/**
 * Error types
 */
export class ClaudeApiError extends Error {
  status: number;
  type: string;

  constructor(message: string, status: number, type: string) {
    super(message);
    this.status = status;
    this.type = type;
    this.name = 'ClaudeApiError';
  }
}

/**
 * Claude AI Client
 * Handles communication with the Anthropic Claude API with:
 * - Authentication
 * - Rate limiting
 * - Retries for transient errors
 * - Cost tracking
 * - Error handling
 */
export class ClaudeClient {
  private anthropic: Anthropic;
  private limiter: Bottleneck;
  private totalTokensUsed: { input: number; output: number };
  private totalCost: number;

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
      console.warn('No Anthropic API key provided. Set ANTHROPIC_API_KEY in your environment variables.');
    }
  }

  /**
   * Complete a chat with Claude (newer API format)
   * @param params Chat completion parameters
   * @returns Response from Claude API
   */
  async completeChat(params: {
    model: string;
    messages: Array<{ role: string; content: string | any[] }>;
    max_tokens?: number;
    temperature?: number;
    system?: string;
  }) {
    const requestId = uuidv4();
    console.log(`[Claude] Starting chat completion ${requestId} with model ${params.model}`);

    try {
      // Use the rate limiter to prevent hitting API limits
      const response = await this.limiter.schedule(() => this.executeWithRetry(
        async () => this.anthropic.messages.create({
          model: params.model,
          max_tokens: params.max_tokens || ClaudeConfig.maxTokens,
          temperature: params.temperature ?? ClaudeConfig.temperature,
          system: params.system || '',
          messages: params.messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : m.content
          })),
        })
      ));

      // Update tracking
      this.totalTokensUsed.input += response.usage?.input_tokens || 0;
      this.totalTokensUsed.output += response.usage?.output_tokens || 0;

      // Calculate cost
      const modelInfo = ClaudeConfig.modelInfo[params.model as keyof typeof ClaudeConfig.modelInfo] || {
        costPerInputToken: 0,
        costPerOutputToken: 0,
      };
      
      const inputCost = (response.usage?.input_tokens || 0) * modelInfo.costPerInputToken;
      const outputCost = (response.usage?.output_tokens || 0) * modelInfo.costPerOutputToken;
      this.totalCost += inputCost + outputCost;

      console.log(`[Claude] Chat completion ${requestId} completed. Used ${response.usage?.input_tokens} input and ${response.usage?.output_tokens} output tokens.`);

      return response;
    } catch (error: any) {
      console.error(`[Claude] Error in chat completion ${requestId}:`, error.message);
      throw this.formatError(error);
    }
  }

  /**
   * Send a message to Claude and get a response
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

    console.log(`[Claude] Starting request ${requestId} with model ${model}`);

    try {
      // Use the rate limiter to prevent hitting API limits
      const response = await this.limiter.schedule(() => this.executeWithRetry(
        async () => this.anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        })
      ));

      // Extract content from the response
      const content = this.extractTextContent(response.content);

      // Calculate token usage and cost
      const usage = {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      };

      const modelInfo = ClaudeConfig.modelInfo[model as keyof typeof ClaudeConfig.modelInfo] || {
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

      console.log(`[Claude] Request ${requestId} completed. Used ${usage.inputTokens} input and ${usage.outputTokens} output tokens.`);

      return {
        id: response.id,
        content,
        model: response.model,
        usage,
        cost,
      };
    } catch (error: any) {
      console.error(`[Claude] Error in request ${requestId}:`, error.message);
      throw this.formatError(error);
    }
  }

  /**
   * Extract text content from Claude API response blocks
   * @param contentBlocks Array of content blocks from Claude
   * @returns Combined text content
   */
  private extractTextContent(contentBlocks: any[]): string {
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
   * Execute a function with retry logic for handling transient errors
   * @param fn Function to execute with retry logic
   * @returns Result of the function
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = ClaudeConfig.retry.initialDelayMs;

    for (let attempt = 1; attempt <= ClaudeConfig.retry.maxRetries + 1; attempt++) {
      try {
        return await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Request timed out')), ClaudeConfig.timeout);
          }),
        ]);
      } catch (error: any) {
        lastError = error;

        // Don't retry if it's not a transient error
        if (!this.isTransientError(error)) {
          throw error;
        }

        // Last attempt
        if (attempt > ClaudeConfig.retry.maxRetries) {
          throw error;
        }

        console.warn(`[Claude] Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Exponential backoff with jitter
        delay = Math.min(
          delay * ClaudeConfig.retry.backoffFactor * (0.8 + Math.random() * 0.4),
          ClaudeConfig.retry.maxDelayMs
        );
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Unknown error during retry');
  }

  /**
   * Check if an error is likely transient and should be retried
   * @param error Error to check
   * @returns True if the error is transient and should be retried
   */
  private isTransientError(error: any): boolean {
    // Network errors
    if (error.name === 'FetchError' || error.code === 'ECONNRESET') {
      return true;
    }

    // Rate limiting
    if (error.status === 429) {
      return true;
    }

    // Server errors
    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    return false;
  }

  /**
   * Format error for consistent handling
   * @param error Original error
   * @returns Formatted error
   */
  private formatError(error: any): Error {
    if (error.status) {
      return new ClaudeApiError(
        error.message || 'Claude API error',
        error.status,
        error.type || 'unknown'
      );
    }
    return error;
  }

  /**
   * Get usage statistics
   * @returns Current usage data
   */
  getUsage() {
    return {
      tokens: { ...this.totalTokensUsed },
      cost: this.totalCost,
      formattedCost: `$${this.totalCost.toFixed(4)}`,
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;
  }
}

// Export a singleton instance for convenience
export const claudeClient = new ClaudeClient(); 