/**
 * Configuration for Anthropic Claude AI integration
 * This file contains settings for the Claude API client
 */

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Environment variable ${key} is not set`);
    }
    return defaultValue;
  }
  return value;
}

/**
 * Base API configuration
 */
export const apiConfig = {
  apiKey: getEnv('ANTHROPIC_API_KEY'),
  baseUrl: getEnv('ANTHROPIC_API_URL', 'https://api.anthropic.com'),
  maxRetries: parseInt(getEnv('ANTHROPIC_MAX_RETRIES', '3'), 10),
  timeout: parseInt(getEnv('ANTHROPIC_TIMEOUT_MS', '120000'), 10),
  rateLimitPerMinute: parseInt(getEnv('ANTHROPIC_RATE_LIMIT', '30'), 10)
};

/**
 * Model configuration
 */
export const modelConfig = {
  defaultModel: getEnv('CLAUDE_DEFAULT_MODEL', 'claude-3-opus-20240229'),
  fallbackModel: getEnv('CLAUDE_FALLBACK_MODEL', 'claude-3-sonnet-20240229'),
  maxInputTokens: parseInt(getEnv('CLAUDE_MAX_INPUT_TOKENS', '100000'), 10),
  maxOutputTokens: parseInt(getEnv('CLAUDE_MAX_OUTPUT_TOKENS', '4096'), 10),
  temperature: parseFloat(getEnv('CLAUDE_TEMPERATURE', '0.2')),
  topP: parseFloat(getEnv('CLAUDE_TOP_P', '0.9')),
  topK: parseInt(getEnv('CLAUDE_TOP_K', '50'), 10)
};

/**
 * Cost tracking configuration
 */
export const costConfig = {
  // Cost per million tokens
  claude3OpusInputCost: parseFloat(getEnv('CLAUDE3_OPUS_INPUT_COST', '15.0')),
  claude3OpusOutputCost: parseFloat(getEnv('CLAUDE3_OPUS_OUTPUT_COST', '75.0')),
  claude3SonnetInputCost: parseFloat(getEnv('CLAUDE3_SONNET_INPUT_COST', '3.0')),
  claude3SonnetOutputCost: parseFloat(getEnv('CLAUDE3_SONNET_OUTPUT_COST', '15.0')),
  claude3HaikuInputCost: parseFloat(getEnv('CLAUDE3_HAIKU_INPUT_COST', '0.25')),
  claude3HaikuOutputCost: parseFloat(getEnv('CLAUDE3_HAIKU_OUTPUT_COST', '1.25'))
};

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