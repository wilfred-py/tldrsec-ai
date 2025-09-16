/**
 * Configuration for Anthropic Claude AI integration
 * This file contains settings for the Claude API client
 */

/**
 * Detect if we're in a build environment where environment variables may not be available
 */
function isBuildTime(): boolean {
  return process.env.NODE_ENV === 'production' && !process.env.VERCEL && !process.env.ANTHROPIC_API_KEY;
}

/**
 * Get environment variable with fallback and build-time safety
 */
function getEnv(key: string, defaultValue?: string): string {
  // Use test value when in test environment
  if (process.env.NODE_ENV === 'test' && key === 'ANTHROPIC_API_KEY') {
    return 'test-api-key-for-testing-only';
  }
  
  // During build time, provide safe defaults to prevent build failures
  if (isBuildTime()) {
    if (key === 'ANTHROPIC_API_KEY') {
      return 'build-time-placeholder-key';
    }
    return defaultValue || 'build-time-placeholder';
  }
  
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
 * Model configuration - centralized model selection
 */
export const modelConfig = {
  // Use ANTHROPIC_MODEL as the primary environment variable for consistency
  defaultModel: getEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
  fallbackModel: getEnv('ANTHROPIC_FALLBACK_MODEL', getEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514')),
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
  claudeSonnet4InputCost: parseFloat(getEnv('CLAUDE_SONNET4_INPUT_COST', '3.0')),
  claudeSonnet4OutputCost: parseFloat(getEnv('CLAUDE_SONNET4_OUTPUT_COST', '15.0')),
  claude3OpusInputCost: parseFloat(getEnv('CLAUDE3_OPUS_INPUT_COST', '15.0')),
  claude3OpusOutputCost: parseFloat(getEnv('CLAUDE3_OPUS_OUTPUT_COST', '75.0')),
  claude3SonnetInputCost: parseFloat(getEnv('CLAUDE3_SONNET_INPUT_COST', '3.0')),
  claude3SonnetOutputCost: parseFloat(getEnv('CLAUDE3_SONNET_OUTPUT_COST', '15.0')),
  claude3HaikuInputCost: parseFloat(getEnv('CLAUDE3_HAIKU_INPUT_COST', '0.25')),
  claude3HaikuOutputCost: parseFloat(getEnv('CLAUDE3_HAIKU_OUTPUT_COST', '1.25'))
};

/**
 * Get the current Claude model from environment variable
 * This is the centralized function all code should use to get the model
 */
export function getClaudeModel(): string {
  return getEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514');
}

/**
 * Get fallback model for error handling
 */
export function getFallbackModel(): string {
  return getEnv('ANTHROPIC_FALLBACK_MODEL', getClaudeModel());
}

export const ClaudeConfig = {
  // API key should be set in the .env file, with build-time safety
  apiKey: isBuildTime() ? 'build-time-placeholder-key' : (process.env.ANTHROPIC_API_KEY || ''),
  
  // Model selection - use centralized function
  model: getClaudeModel(),
  
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
    'claude-sonnet-4-20250514',
    'claude-3-opus-20240229', // Legacy model kept for backward compatibility
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
    'claude-instant-1.2',
  ],
  
  // Model capabilities and constraints
  modelInfo: {
    'claude-sonnet-4-20250514': {
      contextWindow: 200000,
      costPerInputToken: 0.000003,  // $3 per million input tokens
      costPerOutputToken: 0.000015, // $15 per million output tokens
      strengths: 'Latest Claude Sonnet model with improved capabilities',
    },
    'claude-3-opus-20240229': { // Legacy model pricing kept for backward compatibility
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