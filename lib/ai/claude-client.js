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

/**
 * Claude AI Client
 * Handles communication with the Anthropic Claude API
 */
class ClaudeClient {
  constructor(apiKey) {
    // Initialize the Anthropic client
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    
    // Initialize tracking
    this.totalTokensUsed = { input: 0, output: 0 };
    this.totalCost = 0;
    
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
  async completeChat(params, options = {}) {
    try {
      console.log(`Sending request to Claude API (model: ${params.model})...`);
      
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
      
      return response;
    } catch (error) {
      console.error('Error calling Claude API:', error);
      throw error;
    }
  }
  
  /**
   * Calculate the cost of tokens based on the model and token type
   * @param {string} model - The Claude model used
   * @param {string} tokenType - Either 'input' or 'output'
   * @param {number} tokenCount - Number of tokens
   * @returns {number} - Cost in USD
   */
  calculateCost(model, tokenType, tokenCount) {
    // Pricing as of May 2025 (approximate)
    const pricing = {
      'claude-3-opus-20240229': {
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
    
    // Default to opus pricing if model not found
    const modelPricing = pricing[model] || pricing['claude-3-opus-20240229'];
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
