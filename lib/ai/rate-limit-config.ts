/**
 * Rate Limiting Configuration System
 * 
 * Centralized configuration for AI API rate limiting with environment-based defaults
 * Supports different configurations per environment and user tiers
 */

import { logger } from '../logging';

/**
 * Rate limiting configuration for different user tiers
 */
export interface TierRateLimits {
  requestsPerHour: number;
  requestsPerDay: number;
  requestsBurstCapacity: number;
  tokensPerHour: number;
  tokensPerDay: number;
  tokensBurstCapacity: number;
  costPerHour: number; // USD
  costPerDay: number; // USD
  costBurstCapacity: number; // USD
}

/**
 * Global rate limiting configuration
 */
export interface GlobalRateLimits {
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerHour: number;
  tokensPerDay: number;
  costPerHour: number;
  costPerDay: number;
  burstMultiplier: number; // Multiplier for burst capacity
}

/**
 * Rate limiting behavior configuration
 */
export interface RateLimitBehavior {
  enableRateLimiting: boolean;
  enableCostTracking: boolean;
  enableUserTracking: boolean;
  enableGlobalLimits: boolean;
  
  // Time windows
  shortWindowMs: number; // Hour window
  longWindowMs: number; // Day window
  
  // Burst behavior
  burstWindowMs: number; // Window for burst capacity
  refillRate: number; // Token refill rate (tokens per second)
  
  // Fallback behavior
  failOpen: boolean; // Allow requests if rate limiting fails
  gracefulDegradation: boolean; // Use fallback strategies when limits exceeded
  
  // Monitoring
  alertThreshold: number; // Alert when usage reaches % of limit
  violationThreshold: number; // Escalate when violations exceed this count
}

/**
 * Environment-specific configurations
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Complete rate limiting configuration
 */
export interface RateLimitConfiguration {
  environment: Environment;
  userTiers: {
    free: TierRateLimits;
    professional: TierRateLimits;
    enterprise: TierRateLimits;
    institution: TierRateLimits;
  };
  global: GlobalRateLimits;
  behavior: RateLimitBehavior;
}

/**
 * Default configurations by environment
 */
const DEVELOPMENT_CONFIG: RateLimitConfiguration = {
  environment: 'development',
  userTiers: {
    free: {
      requestsPerHour: 50,
      requestsPerDay: 200,
      requestsBurstCapacity: 10,
      tokensPerHour: 25000,
      tokensPerDay: 100000,
      tokensBurstCapacity: 5000,
      costPerHour: 2.0,
      costPerDay: 10.0,
      costBurstCapacity: 1.0
    },
    professional: {
      requestsPerHour: 200,
      requestsPerDay: 1000,
      requestsBurstCapacity: 40,
      tokensPerHour: 100000,
      tokensPerDay: 500000,
      tokensBurstCapacity: 20000,
      costPerHour: 10.0,
      costPerDay: 50.0,
      costBurstCapacity: 5.0
    },
    enterprise: {
      requestsPerHour: 500,
      requestsPerDay: 2500,
      requestsBurstCapacity: 100,
      tokensPerHour: 250000,
      tokensPerDay: 1250000,
      tokensBurstCapacity: 50000,
      costPerHour: 25.0,
      costPerDay: 125.0,
      costBurstCapacity: 12.5
    },
    institution: {
      requestsPerHour: 1000,
      requestsPerDay: 5000,
      requestsBurstCapacity: 200,
      tokensPerHour: 500000,
      tokensPerDay: 2500000,
      tokensBurstCapacity: 100000,
      costPerHour: 50.0,
      costPerDay: 250.0,
      costBurstCapacity: 25.0
    }
  },
  global: {
    requestsPerHour: 5000,
    requestsPerDay: 50000,
    tokensPerHour: 2500000,
    tokensPerDay: 25000000,
    costPerHour: 250.0,
    costPerDay: 2500.0,
    burstMultiplier: 1.5
  },
  behavior: {
    enableRateLimiting: true,
    enableCostTracking: true,
    enableUserTracking: true,
    enableGlobalLimits: true,
    shortWindowMs: 60 * 60 * 1000, // 1 hour
    longWindowMs: 24 * 60 * 60 * 1000, // 24 hours
    burstWindowMs: 5 * 60 * 1000, // 5 minutes
    refillRate: 1.0, // 1 token per second
    failOpen: true,
    gracefulDegradation: true,
    alertThreshold: 0.8, // 80%
    violationThreshold: 5 // 5 violations
  }
};

const STAGING_CONFIG: RateLimitConfiguration = {
  ...DEVELOPMENT_CONFIG,
  environment: 'staging',
  userTiers: {
    free: {
      requestsPerHour: 100,
      requestsPerDay: 500,
      requestsBurstCapacity: 20,
      tokensPerHour: 50000,
      tokensPerDay: 250000,
      tokensBurstCapacity: 10000,
      costPerHour: 5.0,
      costPerDay: 25.0,
      costBurstCapacity: 2.5
    },
    professional: {
      requestsPerHour: 300,
      requestsPerDay: 1500,
      requestsBurstCapacity: 60,
      tokensPerHour: 150000,
      tokensPerDay: 750000,
      tokensBurstCapacity: 30000,
      costPerHour: 15.0,
      costPerDay: 75.0,
      costBurstCapacity: 7.5
    },
    enterprise: {
      requestsPerHour: 750,
      requestsPerDay: 3750,
      requestsBurstCapacity: 150,
      tokensPerHour: 375000,
      tokensPerDay: 1875000,
      tokensBurstCapacity: 75000,
      costPerHour: 37.5,
      costPerDay: 187.5,
      costBurstCapacity: 18.75
    },
    institution: {
      requestsPerHour: 1500,
      requestsPerDay: 7500,
      requestsBurstCapacity: 300,
      tokensPerHour: 750000,
      tokensPerDay: 3750000,
      tokensBurstCapacity: 150000,
      costPerHour: 75.0,
      costPerDay: 375.0,
      costBurstCapacity: 37.5
    }
  },
  global: {
    requestsPerHour: 7500,
    requestsPerDay: 75000,
    tokensPerHour: 3750000,
    tokensPerDay: 37500000,
    costPerHour: 375.0,
    costPerDay: 3750.0,
    burstMultiplier: 1.5
  }
};

const PRODUCTION_CONFIG: RateLimitConfiguration = {
  ...STAGING_CONFIG,
  environment: 'production',
  userTiers: {
    free: {
      requestsPerHour: 100,
      requestsPerDay: 1000,
      requestsBurstCapacity: 20,
      tokensPerHour: 50000,
      tokensPerDay: 500000,
      tokensBurstCapacity: 10000,
      costPerHour: 10.0,
      costPerDay: 100.0,
      costBurstCapacity: 5.0
    },
    professional: {
      requestsPerHour: 500,
      requestsPerDay: 5000,
      requestsBurstCapacity: 100,
      tokensPerHour: 250000,
      tokensPerDay: 2500000,
      tokensBurstCapacity: 50000,
      costPerHour: 50.0,
      costPerDay: 500.0,
      costBurstCapacity: 25.0
    },
    enterprise: {
      requestsPerHour: 2000,
      requestsPerDay: 20000,
      requestsBurstCapacity: 400,
      tokensPerHour: 1000000,
      tokensPerDay: 10000000,
      tokensBurstCapacity: 200000,
      costPerHour: 200.0,
      costPerDay: 2000.0,
      costBurstCapacity: 100.0
    },
    institution: {
      requestsPerHour: 5000,
      requestsPerDay: 50000,
      requestsBurstCapacity: 1000,
      tokensPerHour: 2500000,
      tokensPerDay: 25000000,
      tokensBurstCapacity: 500000,
      costPerHour: 500.0,
      costPerDay: 5000.0,
      costBurstCapacity: 250.0
    }
  },
  global: {
    requestsPerHour: 25000,
    requestsPerDay: 250000,
    tokensPerHour: 12500000,
    tokensPerDay: 125000000,
    costPerHour: 2500.0,
    costPerDay: 25000.0,
    burstMultiplier: 1.2 // More conservative in production
  },
  behavior: {
    ...DEVELOPMENT_CONFIG.behavior,
    failOpen: false, // More strict in production
    alertThreshold: 0.75, // Earlier warnings
    violationThreshold: 3 // Lower tolerance for violations
  }
};

/**
 * Rate Limit Configuration Manager
 */
export class RateLimitConfigManager {
  private config: RateLimitConfiguration;
  private envOverrides: Map<string, any> = new Map();

  constructor(environment?: Environment) {
    this.config = this.selectEnvironmentConfig(environment);
    this.loadEnvironmentOverrides();
    this.validateConfiguration();
  }

  /**
   * Select configuration based on environment
   */
  private selectEnvironmentConfig(environment?: Environment): RateLimitConfiguration {
    const env = environment || this.detectEnvironment();
    
    switch (env) {
      case 'development':
        return { ...DEVELOPMENT_CONFIG };
      case 'staging':
        return { ...STAGING_CONFIG };
      case 'production':
        return { ...PRODUCTION_CONFIG };
      default:
        logger.warn(`Unknown environment: ${env}, using development config`);
        return { ...DEVELOPMENT_CONFIG };
    }
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): Environment {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    const vercelEnv = process.env.VERCEL_ENV?.toLowerCase();
    
    if (vercelEnv === 'production' || nodeEnv === 'production') {
      return 'production';
    } else if (vercelEnv === 'preview' || nodeEnv === 'staging') {
      return 'staging';
    } else {
      return 'development';
    }
  }

  /**
   * Load environment variable overrides
   */
  private loadEnvironmentOverrides(): void {
    const overrideMapping = {
      // User tier overrides
      AI_FREE_REQUESTS_PER_HOUR: 'userTiers.free.requestsPerHour',
      AI_FREE_TOKENS_PER_HOUR: 'userTiers.free.tokensPerHour',
      AI_FREE_COST_PER_HOUR: 'userTiers.free.costPerHour',
      
      AI_PRO_REQUESTS_PER_HOUR: 'userTiers.professional.requestsPerHour',
      AI_PRO_TOKENS_PER_HOUR: 'userTiers.professional.tokensPerHour',
      AI_PRO_COST_PER_HOUR: 'userTiers.professional.costPerHour',
      
      AI_ENTERPRISE_REQUESTS_PER_HOUR: 'userTiers.enterprise.requestsPerHour',
      AI_ENTERPRISE_TOKENS_PER_HOUR: 'userTiers.enterprise.tokensPerHour',
      AI_ENTERPRISE_COST_PER_HOUR: 'userTiers.enterprise.costPerHour',
      
      // Global overrides
      AI_GLOBAL_REQUESTS_PER_HOUR: 'global.requestsPerHour',
      AI_GLOBAL_TOKENS_PER_HOUR: 'global.tokensPerHour',
      AI_GLOBAL_COST_PER_HOUR: 'global.costPerHour',
      AI_GLOBAL_DAILY_BUDGET: 'global.costPerDay',
      
      // Behavior overrides
      AI_ENABLE_RATE_LIMITING: 'behavior.enableRateLimiting',
      AI_ENABLE_COST_TRACKING: 'behavior.enableCostTracking',
      AI_FAIL_OPEN: 'behavior.failOpen',
      AI_ALERT_THRESHOLD: 'behavior.alertThreshold'
    };

    for (const [envVar, configPath] of Object.entries(overrideMapping)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.envOverrides.set(configPath, this.parseEnvValue(value));
      }
    }

    // Apply overrides to configuration
    for (const [path, value] of this.envOverrides) {
      this.setConfigValue(path, value);
    }

    if (this.envOverrides.size > 0) {
      logger.info('Applied environment variable overrides to rate limit config', {
        overrideCount: this.envOverrides.size,
        environment: this.config.environment
      });
    }
  }

  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvValue(value: string): any {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Numeric values
    const numValue = Number(value);
    if (!isNaN(numValue)) return numValue;
    
    // String values
    return value;
  }

  /**
   * Set nested configuration value using dot notation path
   */
  private setConfigValue(path: string, value: any): void {
    const parts = path.split('.');
    let current: any = this.config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Validate configuration for consistency and safety
   */
  private validateConfiguration(): void {
    const errors: string[] = [];
    
    // Validate tier limits are progressive (enterprise > professional > free)
    const tiers = ['free', 'professional', 'enterprise', 'institution'] as const;
    const metrics = ['requestsPerHour', 'tokensPerHour', 'costPerHour'] as const;
    
    for (const metric of metrics) {
      for (let i = 1; i < tiers.length; i++) {
        const current = this.config.userTiers[tiers[i]][metric];
        const previous = this.config.userTiers[tiers[i-1]][metric];
        
        if (current <= previous) {
          errors.push(`${metric} for ${tiers[i]} (${current}) should be greater than ${tiers[i-1]} (${previous})`);
        }
      }
    }

    // Validate burst capacity is reasonable (not more than 2x regular limit)
    for (const tier of tiers) {
      const tierConfig = this.config.userTiers[tier];
      if (tierConfig.requestsBurstCapacity > tierConfig.requestsPerHour * 0.5) {
        errors.push(`Burst capacity for ${tier} requests is too high relative to hourly limit`);
      }
      if (tierConfig.tokensBurstCapacity > tierConfig.tokensPerHour * 0.5) {
        errors.push(`Burst capacity for ${tier} tokens is too high relative to hourly limit`);
      }
    }

    // Validate global limits are higher than highest tier
    const institutionLimits = this.config.userTiers.institution;
    const globalLimits = this.config.global;
    
    if (globalLimits.requestsPerHour < institutionLimits.requestsPerHour * 2) {
      errors.push('Global request limit should be at least 2x highest tier limit');
    }

    // Log errors but don't fail - use defaults
    if (errors.length > 0) {
      logger.warn('Rate limit configuration validation errors', {
        errors,
        environment: this.config.environment,
        fallback: 'Using configuration despite errors'
      });
    }

    logger.info('Rate limit configuration initialized', {
      environment: this.config.environment,
      enabledFeatures: {
        rateLimiting: this.config.behavior.enableRateLimiting,
        costTracking: this.config.behavior.enableCostTracking,
        userTracking: this.config.behavior.enableUserTracking,
        globalLimits: this.config.behavior.enableGlobalLimits
      },
      overridesApplied: this.envOverrides.size
    });
  }

  /**
   * Get configuration for a specific user tier
   */
  getTierLimits(tier: string): TierRateLimits {
    const normalizedTier = tier.toLowerCase();
    
    if (normalizedTier in this.config.userTiers) {
      return this.config.userTiers[normalizedTier as keyof typeof this.config.userTiers];
    }
    
    // Default to free tier for unknown tiers
    logger.warn(`Unknown user tier: ${tier}, defaulting to free tier limits`);
    return this.config.userTiers.free;
  }

  /**
   * Get global rate limits
   */
  getGlobalLimits(): GlobalRateLimits {
    return this.config.global;
  }

  /**
   * Get behavior configuration
   */
  getBehaviorConfig(): RateLimitBehavior {
    return this.config.behavior;
  }

  /**
   * Get complete configuration
   */
  getConfiguration(): RateLimitConfiguration {
    return { ...this.config };
  }

  /**
   * Check if rate limiting is enabled
   */
  isRateLimitingEnabled(): boolean {
    return this.config.behavior.enableRateLimiting;
  }

  /**
   * Check if cost tracking is enabled
   */
  isCostTrackingEnabled(): boolean {
    return this.config.behavior.enableCostTracking;
  }

  /**
   * Update configuration at runtime (for admin use)
   */
  updateConfiguration(updates: Partial<RateLimitConfiguration>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfiguration();
    
    logger.info('Rate limit configuration updated', {
      updates: Object.keys(updates),
      environment: this.config.environment
    });
  }
}

/**
 * Global configuration manager instance
 */
export const rateLimitConfig = new RateLimitConfigManager();

/**
 * Helper function to get user tier from subscription
 */
export function getUserTier(subscriptionTier?: string): string {
  if (!subscriptionTier) return 'free';
  
  const tier = subscriptionTier.toLowerCase();
  
  // Map various subscription tier names to our rate limiting tiers
  switch (tier) {
    case 'free':
    case 'hobby':
      return 'free';
    case 'professional':
    case 'pro':
      return 'professional';
    case 'enterprise':
      return 'enterprise';
    case 'institution':
      return 'institution';
    default:
      return 'free';
  }
}