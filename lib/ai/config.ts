/**
 * Configuration for OpenRouter AI integration
 * This file contains settings for the OpenRouter API client with xAI model support
 */

/**
 * Detect if we're in a build environment where environment variables may not be available
 * Improved logic for reliable build-time detection across different platforms
 */
function isBuildTime(): boolean {
  // Check for explicit build indicators
  const buildIndicators = [
    process.env.NODE_ENV === 'production' && !process.env.VERCEL, // Non-Vercel production builds
    process.env.CF_PAGES === '1' && !process.env.ANTHROPIC_API_KEY, // Cloudflare Pages build
    process.env.GITHUB_ACTIONS === 'true', // GitHub Actions build
    process.env.CI === 'true' && !process.env.ANTHROPIC_API_KEY, // General CI environment
    process.env.BUILD_PHASE === 'true' // Explicit build phase flag
  ];
  
  return buildIndicators.some(indicator => indicator);
}

/**
 * Get environment variable with fallback and build-time safety
 */
function getEnv(key: string, defaultValue?: string): string {
  // Use test value when in test environment
  if (process.env.NODE_ENV === 'test' && key === 'OPENROUTER_API_KEY') {
    return 'test-api-key-for-testing-only';
  }
  
  // During build time, provide safe defaults to prevent build failures
  if (isBuildTime()) {
    if (key === 'OPENROUTER_API_KEY') {
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
  apiKey: getEnv('OPENROUTER_API_KEY'),
  baseUrl: getEnv('OPENROUTER_API_URL', 'https://openrouter.ai/api/v1'),
  maxRetries: parseInt(getEnv('OPENROUTER_MAX_RETRIES', '3'), 10),
  timeout: parseInt(getEnv('OPENROUTER_TIMEOUT_MS', '600000'), 10),
  rateLimitPerMinute: parseInt(getEnv('OPENROUTER_RATE_LIMIT', '60'), 10),
  headers: {
    'HTTP-Referer': getEnv('OPENROUTER_HTTP_REFERER', ''),
    'X-Title': getEnv('OPENROUTER_X_TITLE', 'tldrsec-ai'),
  }
};

/**
 * Model configuration - centralized model selection
 */
export const modelConfig = {
  // Use DEFAULT_AI_MODEL as the primary environment variable
  defaultModel: getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-4-fast-reasoning'),
  fallbackModel: getEnv('OPENROUTER_FALLBACK_MODEL', getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-2')),
  maxInputTokens: parseInt(getEnv('OPENROUTER_MAX_INPUT_TOKENS', '1280000'), 10), // xAI 2M context
  maxOutputTokens: parseInt(getEnv('OPENROUTER_MAX_OUTPUT_TOKENS', '8000'), 10),
  temperature: parseFloat(getEnv('OPENROUTER_TEMPERATURE', '0.2')),
  topP: parseFloat(getEnv('OPENROUTER_TOP_P', '0.9')),
  topK: parseInt(getEnv('OPENROUTER_TOP_K', '50'), 10)
};

/**
 * Cost tracking configuration - OpenRouter/xAI pricing
 */
export const costConfig = {
  // Cost per million tokens for xAI models via OpenRouter
  xaiGrok4InputCost: parseFloat(getEnv('XAI_GROK4_INPUT_COST', '0.30')), // $0.30/M input
  xaiGrok4OutputCost: parseFloat(getEnv('XAI_GROK4_OUTPUT_COST', '0.50')), // $0.50/M output
  xaiGrok2InputCost: parseFloat(getEnv('XAI_GROK2_INPUT_COST', '0.15')), // $0.15/M input fallback
  xaiGrok2OutputCost: parseFloat(getEnv('XAI_GROK2_OUTPUT_COST', '0.25')), // $0.25/M output fallback
  openRouterSurcharge: parseFloat(getEnv('OPENROUTER_SURCHARGE', '0.10')), // 10% OpenRouter fee
  maxCostPerRequest: parseFloat(getEnv('MAX_COST_PER_REQUEST', '0.75')) // Max $0.75 per enhanced summary
};

/**
 * Get the default AI model from environment variable
 * This is the centralized function all code should use to get the model
 */
export function getDefaultModel(): string {
  return getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-4-fast-reasoning');
}

/**
 * Get fallback model for error handling
 */
export function getFallbackModel(): string {
  return getEnv('OPENROUTER_FALLBACK_MODEL', getDefaultModel());
}

/**
 * Alias for getDefaultModel to maintain backward compatibility
 */
export function getClaudeModel(): string {
  return getDefaultModel();
}

// Runtime validation for production environment
function validateRuntimeConfig(): void {
  if (typeof window === 'undefined' && // Server-side only
      process.env.NODE_ENV === 'production' && 
      process.env.VERCEL && // Vercel production
      !isBuildTime() &&
      !process.env.OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not found in production environment. AI features may not work.');
  }
}

if (typeof window === 'undefined') {
  validateRuntimeConfig();
}

export const OpenRouterConfig = {
  // API key should be set in the .env file, with build-time safety
  apiKey: isBuildTime() ? 'build-time-placeholder-key' : (process.env.OPENROUTER_API_KEY || ''),
  
  // Model selection - use centralized function
  model: getDefaultModel(),
  
  // Request parameters
  maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '8000', 10),
  temperature: parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.2'),
  
  // Rate limiting configuration
  rateLimit: {
    maxRequests: 60,  // Higher for OpenRouter
    maxTokensPerMinute: 1000000,  // Token rate limit
    concurrentRequests: 5,
  },
  
  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
  },
  
  // Timeout configuration (in milliseconds)
  timeout: 180000,  // 3 minutes for enhanced analysis
  
  // Available models (xAI via OpenRouter)
  availableModels: [
    'x-ai/grok-4-fast-reasoning',
    'x-ai/grok-2',
    'meta-llama/llama-3.1-405b-instruct:free',
    'google/gemini-pro-1.5:free',
  ],
  
  // Model capabilities and constraints (xAI focused)
  modelInfo: {
    'x-ai/grok-4-fast-reasoning': {
      contextWindow: 2000000, // 2M tokens
      costPerInputToken: 0.0000003,  // $0.30 per million
      costPerOutputToken: 0.0000005, // $0.50 per million
      strengths: 'Advanced reasoning with 2M context window, optimized for financial analysis',
    },
    'x-ai/grok-2': {
      contextWindow: 128000,
      costPerInputToken: 0.00000015,
      costPerOutputToken: 0.00000025,
      strengths: 'Reliable fallback model for SEC filing analysis',
    },
    'meta-llama/llama-3.1-405b-instruct:free': {
      contextWindow: 128000,
      costPerInputToken: 0.000000, // Free tier
      costPerOutputToken: 0.000000,
      strengths: 'Free fallback for basic summarization',
    },
  }
};
