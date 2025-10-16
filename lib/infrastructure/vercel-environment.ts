/**
 * Vercel Environment Configuration for Async Processing & Microservices
 * Manages environment-specific settings for optimal performance and cost control
 */

export interface EnvironmentConfig {
  // Timeout configurations
  maxDuration: number;
  memory: number;
  
  // Performance settings
  concurrency?: number;
  regions?: string[];
  
  // Rate limiting
  rateLimitEnabled: boolean;
  rateLimitConfig?: {
    maxRequests: number;
    windowMs: number;
  };
  
  // Cost control
  costTier: 'LOW' | 'MEDIUM' | 'HIGH';
  budgetLimit?: number;
  
  // Monitoring
  monitoringEnabled: boolean;
  alertThresholds?: {
    errorRate: number;
    responseTime: number;
    memoryUsage: number;
  };
  
  // Environment variables
  requiredEnvVars: string[];
  optionalEnvVars?: string[];
}

/**
 * Environment configurations by deployment stage
 */
export const ENVIRONMENT_CONFIGS: Record<string, EnvironmentConfig> = {
  development: {
    maxDuration: 60, // 1 minute for dev testing
    memory: 512,
    regions: ['iad1'], // Single region for dev
    rateLimitEnabled: false,
    costTier: 'LOW',
    monitoringEnabled: false,
    requiredEnvVars: [
      'DATABASE_URL',
      'ANTHROPIC_API_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
    ],
    optionalEnvVars: [
      'RESEND_API_KEY',
      'TEST_EMAIL',
      'CRON_SECRET'
    ]
  },
  
  preview: {
    maxDuration: 120, // 2 minutes for preview testing
    memory: 1024,
    regions: ['iad1', 'sfo1'],
    rateLimitEnabled: true,
    rateLimitConfig: {
      maxRequests: 100,
      windowMs: 60 * 60 * 1000 // 1 hour
    },
    costTier: 'MEDIUM',
    monitoringEnabled: true,
    alertThresholds: {
      errorRate: 10, // 10% error rate
      responseTime: 5000, // 5 seconds
      memoryUsage: 85 // 85% memory usage
    },
    requiredEnvVars: [
      'DATABASE_URL',
      'ANTHROPIC_API_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'RESEND_API_KEY',
      'CRON_SECRET'
    ],
    optionalEnvVars: [
      'TEST_EMAIL',
      'ADMIN_EMAIL'
    ]
  },
  
  production: {
    maxDuration: 300, // 5 minutes for production
    memory: 1024,
    regions: ['iad1', 'sfo1'],
    rateLimitEnabled: true,
    rateLimitConfig: {
      maxRequests: 1000,
      windowMs: 60 * 60 * 1000 // 1 hour
    },
    costTier: 'HIGH',
    budgetLimit: 100, // $100 per month
    monitoringEnabled: true,
    alertThresholds: {
      errorRate: 1, // 1% error rate
      responseTime: 2000, // 2 seconds
      memoryUsage: 80 // 80% memory usage
    },
    requiredEnvVars: [
      'DATABASE_URL',
      'ANTHROPIC_API_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'RESEND_API_KEY',
      'CRON_SECRET',
      'ADMIN_EMAIL'
    ],
    optionalEnvVars: [
      'TEST_EMAIL',
      'ENHANCED_SUMMARIZATION_ENABLED',
      'CRON_ALLOWED_IPS'
    ]
  }
};

/**
 * Endpoint-specific environment overrides
 */
export const ENDPOINT_OVERRIDES: Record<string, Partial<EnvironmentConfig>> = {
  // Cron endpoints - Higher memory for batch processing
  '/api/cron/tier-aware': {
    memory: 1024,
    maxDuration: 300,
    costTier: 'MEDIUM',
    alertThresholds: {
      errorRate: 2, // 2% error rate acceptable for cron
      responseTime: 30000, // 30 seconds
      memoryUsage: 90 // 90% memory usage acceptable
    }
  },
  
  '/api/cron/tier-aware-async': {
    memory: 1536, // Higher memory for async processing
    maxDuration: 300,
    costTier: 'HIGH',
    alertThresholds: {
      errorRate: 1, // Stricter error rate for async
      responseTime: 25000, // 25 seconds (faster than sync)
      memoryUsage: 85
    }
  },
  
  '/api/cron/microservices': {
    memory: 512, // Lower memory for microservices
    maxDuration: 30, // Fast response requirement
    costTier: 'LOW',
    alertThresholds: {
      errorRate: 0.5, // Very strict error rate
      responseTime: 10000, // 10 seconds max
      memoryUsage: 75
    }
  },
  
  // AI-intensive endpoints - Maximum resources
  '/api/filings/batch-summary': {
    memory: 2048,
    maxDuration: 300,
    costTier: 'HIGH',
    alertThresholds: {
      errorRate: 3, // Higher tolerance for complex AI processing
      responseTime: 45000, // 45 seconds for batch processing
      memoryUsage: 95
    }
  },
  
  '/api/filings/enhanced-summary': {
    memory: 2048,
    maxDuration: 300,
    costTier: 'HIGH',
    alertThresholds: {
      errorRate: 2,
      responseTime: 60000, // 1 minute for enhanced processing
      memoryUsage: 95
    }
  },
  
  // Streaming endpoints - Optimized for throughput
  '/api/filings/stream-summary': {
    memory: 1536,
    maxDuration: 300,
    costTier: 'MEDIUM',
    alertThresholds: {
      errorRate: 1,
      responseTime: 30000,
      memoryUsage: 80
    }
  },
  
  // Email endpoints - Lightweight
  '/api/email/welcome': {
    memory: 256,
    maxDuration: 30,
    costTier: 'LOW',
    alertThresholds: {
      errorRate: 1,
      responseTime: 10000,
      memoryUsage: 70
    }
  },
  
  '/api/email/filings-summary': {
    memory: 512,
    maxDuration: 60,
    costTier: 'LOW',
    alertThresholds: {
      errorRate: 2,
      responseTime: 15000,
      memoryUsage: 75
    }
  }
};

/**
 * Get environment configuration for current deployment
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const vercelEnv = process.env.VERCEL_ENV || 'development';
  
  // Map Vercel environments to our configs
  const envMap: Record<string, string> = {
    development: 'development',
    preview: 'preview',
    production: 'production'
  };
  
  const configKey = envMap[vercelEnv] || 'development';
  return ENVIRONMENT_CONFIGS[configKey];
}

/**
 * Get endpoint-specific configuration with environment overrides
 */
export function getEndpointConfig(pathname: string): EnvironmentConfig {
  const baseConfig = getEnvironmentConfig();
  const endpointOverride = ENDPOINT_OVERRIDES[pathname];
  
  if (!endpointOverride) {
    return baseConfig;
  }
  
  // Merge configurations with endpoint override taking precedence
  return {
    ...baseConfig,
    ...endpointOverride,
    alertThresholds: {
      ...baseConfig.alertThresholds,
      ...endpointOverride.alertThresholds
    },
    rateLimitConfig: endpointOverride.rateLimitConfig || baseConfig.rateLimitConfig
  };
}

/**
 * Validate required environment variables
 */
export function validateEnvironmentVariables(): { valid: boolean; missing: string[]; warnings: string[] } {
  const config = getEnvironmentConfig();
  const missing: string[] = [];
  const warnings: string[] = [];
  
  // Check required environment variables
  for (const envVar of config.requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  // Check optional environment variables
  if (config.optionalEnvVars) {
    for (const envVar of config.optionalEnvVars) {
      if (!process.env[envVar]) {
        warnings.push(`Optional environment variable ${envVar} is not set`);
      }
    }
  }
  
  // Environment-specific validations
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') {
    // Additional production checks
    if (!process.env.ADMIN_EMAIL) {
      warnings.push('ADMIN_EMAIL not set - admin features will be disabled');
    }
    
    if (!process.env.CRON_ALLOWED_IPS) {
      warnings.push('CRON_ALLOWED_IPS not set - IP allowlisting disabled');
    }
    
    // Validate API key formats
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !anthropicKey.startsWith('sk-ant-')) {
      warnings.push('ANTHROPIC_API_KEY may have incorrect format');
    }
    
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && !resendKey.startsWith('re_')) {
      warnings.push('RESEND_API_KEY may have incorrect format');
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings
  };
}

/**
 * Get cost estimates for endpoint configurations
 */
export function getCostEstimate(pathname: string, requestsPerMonth: number): {
  computeCost: number;
  memoryCost: number;
  totalCost: number;
  tier: string;
} {
  const config = getEndpointConfig(pathname);
  
  // Vercel pricing estimates (approximate)
  const computeCostPerGBSecond = 0.0000185; // $0.0000185 per GB-second
  const requestCostPerMillion = 0.40; // $0.40 per million requests
  
  // Calculate compute cost
  const avgDurationSeconds = config.maxDuration / 2; // Average duration
  const memoryGB = config.memory / 1024;
  const computeGBSeconds = (requestsPerMonth * avgDurationSeconds * memoryGB) / 1000000;
  const computeCost = computeGBSeconds * computeCostPerGBSecond;
  
  // Calculate request cost
  const requestCost = (requestsPerMonth / 1000000) * requestCostPerMillion;
  
  return {
    computeCost,
    memoryCost: requestCost, // Simplified - request cost includes memory
    totalCost: computeCost + requestCost,
    tier: config.costTier
  };
}

/**
 * Performance optimization recommendations
 */
export function getPerformanceRecommendations(pathname: string): string[] {
  const config = getEndpointConfig(pathname);
  const recommendations: string[] = [];
  
  // Memory optimization
  if (config.memory > 1024) {
    recommendations.push('Consider implementing streaming responses to reduce memory usage');
  }
  
  // Timeout optimization
  if (config.maxDuration > 120) {
    recommendations.push('Consider breaking long-running operations into smaller chunks');
  }
  
  // Cost optimization
  if (config.costTier === 'HIGH') {
    recommendations.push('Consider implementing caching to reduce AI API calls');
    recommendations.push('Monitor usage patterns to optimize batch processing');
  }
  
  // Endpoint-specific recommendations
  if (pathname.includes('/cron/')) {
    recommendations.push('Ensure cron jobs are idempotent and handle retries gracefully');
    recommendations.push('Implement circuit breakers for external API calls');
  }
  
  if (pathname.includes('/filings/')) {
    recommendations.push('Implement result caching to avoid re-processing identical filings');
    recommendations.push('Consider preprocessing filings during off-peak hours');
  }
  
  return recommendations;
}