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
    process.env.NEXT_PHASE === 'phase-production-build', // Next.js build phase (works on Vercel)
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
 * Tiered-pricing threshold for Grok 4.3 (in input tokens).
 * Per xAI docs: requests exceeding 200K total tokens are billed at the higher tier
 * (input doubles to $2.50/M, output doubles to $5.00/M). Boundary is "exceeding",
 * so an exactly-200K call stays in the cheap tier.
 */
export const TIERED_PRICING_THRESHOLD = 200_000;

/**
 * Model configuration - centralized model selection
 *
 * Single-model configuration: every retiring Grok variant (grok-4.1-fast,
 * grok-4-fast, grok-3, grok-code-fast-1, grok-2) is being retired by xAI on
 * 2026-05-15 12pm PT. grok-4.3 is the only non-deprecated production-grade Grok
 * available via OpenRouter.
 *
 * fallbackModel intentionally aliases defaultModel so the OpenRouterClient's
 * outer model-fallback retry loop still gets a second attempt on transient 5xx.
 * This preserves resilience without introducing a separate fallback model that
 * would also need migration.
 */
export const modelConfig = {
  defaultModel: getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-4.3'),
  fallbackModel: getEnv('OPENROUTER_FALLBACK_MODEL', getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-4.3')),
  maxInputTokens: parseInt(getEnv('OPENROUTER_MAX_INPUT_TOKENS', '1000000'), 10), // grok-4.3 1M context
  maxOutputTokens: parseInt(getEnv('OPENROUTER_MAX_OUTPUT_TOKENS', '8000'), 10),
  temperature: parseFloat(getEnv('OPENROUTER_TEMPERATURE', '0.2')),
  topP: parseFloat(getEnv('OPENROUTER_TOP_P', '0.9')),
  topK: parseInt(getEnv('OPENROUTER_TOP_K', '50'), 10)
};

/**
 * Cost tracking configuration - OpenRouter/xAI pricing
 *
 * Grok 4.3 pricing (per https://openrouter.ai/x-ai/grok-4.3):
 *   ≤200K input tokens: $1.25/M input, $2.50/M output
 *   >200K input tokens: $2.50/M input, $5.00/M output
 */
export const costConfig = {
  xaiGrokInputCost: parseFloat(getEnv('XAI_GROK_INPUT_COST', '1.25')),
  xaiGrokOutputCost: parseFloat(getEnv('XAI_GROK_OUTPUT_COST', '2.50')),
  xaiGrokInputCostHigh: parseFloat(getEnv('XAI_GROK_INPUT_COST_HIGH', '2.50')),
  xaiGrokOutputCostHigh: parseFloat(getEnv('XAI_GROK_OUTPUT_COST_HIGH', '5.00')),
  openRouterSurcharge: parseFloat(getEnv('OPENROUTER_SURCHARGE', '0.10')),
  // Per-call cost cap. Bumped from $0.75 (grok-4.1-fast era) because grok-4.3
  // input/output costs are 4-5x higher; same per-call token budget would otherwise
  // hit the cap.
  maxCostPerRequest: parseFloat(getEnv('MAX_COST_PER_REQUEST', '3.00'))
};

/**
 * Get the default AI model from environment variable
 * This is the centralized function all code should use to get the model
 */
export function getDefaultModel(): string {
  return getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-4.3');
}

/**
 * Get fallback model for error handling. Aliases defaultModel by design — see
 * modelConfig comment above for rationale.
 */
export function getFallbackModel(): string {
  return getEnv('OPENROUTER_FALLBACK_MODEL', getDefaultModel());
}

/**
 * @deprecated Use getDefaultModel() instead. Backward-compat alias from the
 * pre-OpenRouter Claude era.
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
  apiKey: isBuildTime() ? 'build-time-placeholder-key' : (process.env.OPENROUTER_API_KEY || ''),

  model: getDefaultModel(),

  maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '8000', 10),
  temperature: parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.2'),

  rateLimit: {
    maxRequests: 60,
    maxTokensPerMinute: 1000000,
    concurrentRequests: 5,
  },

  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
  },

  timeout: 180000,

  // Available models (xAI via OpenRouter). Single entry; legacy Grok variants
  // retire 2026-05-15.
  availableModels: [
    'x-ai/grok-4.3',
  ],

  // Model capabilities and constraints. costPerInputToken/costPerOutputToken
  // reflect the ≤200K-token tier; >200K-token requests are billed at
  // (xaiGrokInputCostHigh / xaiGrokOutputCostHigh). Use calculateCost() in
  // token-counter.ts for tier-aware cost reporting.
  modelInfo: {
    'x-ai/grok-4.3': {
      contextWindow: 1_000_000,
      costPerInputToken: costConfig.xaiGrokInputCost / 1_000_000,
      costPerOutputToken: costConfig.xaiGrokOutputCost / 1_000_000,
      strengths: 'xAI Grok 4.3 — 1M context, built-in reasoning (effort configurable per request), best for SEC-filing analysis and agentic tool calls',
    },
  }
};
