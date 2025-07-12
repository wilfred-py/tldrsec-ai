/**
 * Claude AI Client for JavaScript
 * 
 * This is a simplified version of the TypeScript Claude client for use in JavaScript environments.
 * It provides basic functionality for communicating with the Anthropic Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Default retry configuration
// Optimized for Anthropic's 20,000 tokens per minute rate limit
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 15000, // 15 seconds - allows partial reset of rate limit window
  maxDelayMs: 60000, // 60 seconds maximum
  backoffFactor: 2, // Exponential backoff factor
  retryableStatusCodes: [429, 500, 502, 503, 504] // Rate limit and server errors
};

/**
 * Claude AI Client
 * Handles communication with the Anthropic Claude API
 */
class ClaudeClient {
  constructor(apiKey, retryConfig = {}) {
    // Initialize the Anthropic client
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    
    // Initialize tracking
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;
    
    // Set retry configuration by merging defaults with provided config
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig
    };
    
    // Validate API key
    if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
      console.warn('No Anthropic API key provided. Set ANTHROPIC_API_KEY in your environment variables.');
    }
  }
  
  /**
   * Complete a chat with Claude (newer API format)
   * @param {Object} params - Chat completion parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Response from Claude API
   */
  /**
   * Complete a chat with Claude (newer API format) with retry logic
   * @param {Object} params - Chat completion parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Response from Claude API
   */
  async completeChat(params, options = {}) {
    const { maxRetries = this.retryConfig.maxRetries } = options;
    let attempts = 0;
    let lastError = null;
    
    // Add execution metadata to track attempts
    const executionMetadata = { attempts: 0 };
    
    while (attempts <= maxRetries) {
      attempts++;
      executionMetadata.attempts = attempts;
      
      try {
        console.log(`Sending request to Claude API (model: ${params.model}, attempt: ${attempts})...`);
        
        const startTime = Date.now();
        
        // Extract system message if present
        let systemMessage = '';
        let userMessages = [];
        
        // Process messages to handle system role correctly
        if (params.messages && Array.isArray(params.messages)) {
          // Extract system message if present
          const systemMsg = params.messages.find(msg => msg.role === 'system');
          if (systemMsg) {
            systemMessage = systemMsg.content;
          }
          
          // Filter out system messages and keep only user/assistant messages
          userMessages = params.messages.filter(msg => msg.role !== 'system');
        }
        
        // Call the Anthropic API with correct format
        const response = await this.anthropic.messages.create({
          model: params.model,
          messages: userMessages,
          max_tokens: params.max_tokens || 2000,
          temperature: params.temperature || 0.7,
          system: systemMessage || params.system, // Use extracted system message or provided system parameter
        });
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`Claude API response received in ${executionTime}ms`);
        
        // Track token usage
        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;
        
        this.totalTokensUsed.input += inputTokens;
        this.totalTokensUsed.output += outputTokens;
        
        // Calculate cost (approximate)
        const inputCost = this.calculateCost(params.model, 'input', inputTokens);
        const outputCost = this.calculateCost(params.model, 'output', outputTokens);
        const totalCost = inputCost + outputCost;
        
        this.totalCost += totalCost;
        
        // Log usage
        console.log(`Claude usage: ${inputTokens} input tokens, ${outputTokens} output tokens`);
        console.log(`Estimated cost: $${totalCost.toFixed(6)}`);
        
        // Add execution metadata to response
        response.executionMetadata = executionMetadata;
        
        return response;
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRateLimit = error.status === 429;
        const isServerError = this.retryConfig.retryableStatusCodes.includes(error.status);
        const isRetryable = isRateLimit || isServerError;
        
        // If not retryable or max retries reached, throw the error
        if (!isRetryable || attempts > maxRetries) {
          console.error(`Error calling Claude API (attempt ${attempts}/${maxRetries + 1}):`, error);
          
          // Add retry exhausted information to the error
          if (attempts > maxRetries) {
            error.code = 'RETRY_EXHAUSTED';
            error.message = `Max retries (${maxRetries}) exceeded: ${error.message}`;
          }
          
          throw error;
        }
        
        // Calculate backoff delay with jitter
        const delayMs = Math.min(
          this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffFactor, attempts - 1),
          this.retryConfig.maxDelayMs
        );
        
        // Add some randomness (jitter) to prevent thundering herd
        const jitteredDelayMs = delayMs * (0.8 + Math.random() * 0.4);
        
        console.warn(`Rate limit or server error (${error.status}). Retrying in ${Math.round(jitteredDelayMs)}ms... (attempt ${attempts}/${maxRetries + 1})`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, jitteredDelayMs));
      }
    }
    
    // This should never be reached due to the throw in the catch block
    // but just in case, throw the last error
    throw lastError;
  }
  
  /**
   * Calculate the cost of tokens based on the model and token type
   * @param {string} model - The Claude model used
   * @param {string} tokenType - Either 'input' or 'output'
   * @param {number} tokenCount - Number of tokens
   * @returns {number} - Cost in USD
   */
  calculateCost(model, tokenType, tokenCount) {
    // Pricing as of July 2025 (approximate)
    const pricing = {
      'claude-sonnet-4-20250514': {
        input: 0.000003,  // $3 per million input tokens
        output: 0.000015, // $15 per million output tokens
      },
      'claude-3-opus-20240229': { // Legacy model pricing kept for backward compatibility
        input: 0.000015,  // $15 per million input tokens
        output: 0.000075, // $75 per million output tokens
      },
      'claude-3-sonnet-20240229': {
        input: 0.000003,  // $3 per million input tokens
        output: 0.000015, // $15 per million output tokens
      },
      'claude-3-haiku-20240307': {
        input: 0.000000625, // $0.625 per million input tokens
        output: 0.0000025,  // $2.5 per million output tokens
      }
    };
    
    // Default to Claude Sonnet 4 pricing if model not found
    const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];
    const ratePerToken = modelPricing[tokenType];
    
    return tokenCount * ratePerToken;
  }
  
  /**
   * Get usage statistics
   * @returns {Object} - Current token usage and cost information
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
    console.log('Claude client usage statistics reset');
  }
}

// Export a singleton instance for convenience
export const claudeClient = new ClaudeClient();
