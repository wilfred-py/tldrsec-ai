/**
 * Configuration for Anthropic Claude AI integration
 * This file contains settings for the Claude API client
 */

export const ClaudeConfig = {
  // API key should be set in the .env file
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  
  // Model selection - default to Claude 3 Sonnet if not specified
  model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
  
  // Request parameters
  maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4000', 10),
  temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.3'),
  
  // Rate limiting configuration
  rateLimit: {
    maxRequests: 10,  // Maximum requests per minute
    maxTokensPerMinute: 100000,  // Token rate limit (if applicable)
    concurrentRequests: 5,  // Maximum concurrent requests
  },
  
  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,  // Start with 1 second delay
    maxDelayMs: 10000,     // Maximum 10 second delay
    backoffFactor: 2,      // Exponential backoff multiplier
  },
  
  // Timeout configuration (in milliseconds)
  timeout: 60000,  // 60 seconds
  
  // Available models
  availableModels: [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
    'claude-instant-1.2',
  ],
  
  // Model capabilities and constraints
  modelInfo: {
    'claude-3-opus-20240229': {
      contextWindow: 200000,
      costPerInputToken: 0.000015,  // $15 per million input tokens
      costPerOutputToken: 0.000075, // $75 per million output tokens
      strengths: 'Most powerful Claude model, best for complex reasoning',
    },
    'claude-3-sonnet-20240229': {
      contextWindow: 180000,
      costPerInputToken: 0.000003,  // $3 per million input tokens
      costPerOutputToken: 0.000015, // $15 per million output tokens
      strengths: 'Excellent balance of intelligence and speed',
    },
    'claude-3-haiku-20240307': {
      contextWindow: 150000,
      costPerInputToken: 0.00000025, // $0.25 per million input tokens
      costPerOutputToken: 0.00000125, // $1.25 per million output tokens
      strengths: 'Fastest Claude model, good for quick responses',
    },
  }
}; 