/**
 * Dedicated Cost Validation Module
 * 
 * Provides centralized, secure cost validation logic to prevent budget manipulation.
 * This module implements multiple layers of validation for financial security.
 */

import { logger } from '../logging';

const costValidationLogger = logger.child('cost-validation');

// Cost validation constants - centralized configuration
export const DAILY_COST_LIMITS = {
  INSTITUTION: Number(process.env.INSTITUTION_COST_LIMIT) || 2.50,
  ENTERPRISE: Number(process.env.ENTERPRISE_COST_LIMIT) || 1.25,
  PROFESSIONAL: Number(process.env.PROFESSIONAL_COST_LIMIT) || 0.60,
  FREE: Number(process.env.FREE_COST_LIMIT) || 0.20
} as const;

export const MAX_COST_PER_OPERATION = 10.0; // Maximum cost allowed per operation
export const COST_PRECISION_DECIMALS = 3; // Round to 3 decimal places
export const MIN_COST_THRESHOLD = 0.001; // Minimum non-zero cost threshold

export type SubscriptionTier = keyof typeof DAILY_COST_LIMITS;

export interface CostValidationResult {
  valid: boolean;
  sanitizedCost: number;
  error?: string;
  warnings?: string[];
}

export interface CostValidationContext {
  userId: string;
  tier: string;
  operation?: string;
  operationType?: 'cached_summary' | 'ai_generation' | 'test_operation' | 'manual_retry';
  isCached?: boolean;
  isRetry?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Environment detection utilities
 */
const EnvironmentUtils = {
  isProduction: () => process.env.NODE_ENV === 'production',
  isTest: () => process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined,
  isDevelopment: () => process.env.NODE_ENV === 'development',
  isCloudflare: () => !!process.env.CF_RAY
};

/**
 * Cost validation rules - each rule is a pure function for testability
 */
const ValidationRules = {
  /**
   * Validates basic cost type and format
   */
  validateCostType: (cost: unknown): { valid: boolean; error?: string } => {
    if (typeof cost !== 'number' || isNaN(cost) || !isFinite(cost)) {
      return { valid: false, error: 'Invalid cost type' };
    }
    return { valid: true };
  },

  /**
   * Prevents negative costs (could reduce budget illegally)
   */
  validateCostSign: (cost: number): { valid: boolean; error?: string } => {
    if (cost < 0) {
      return { valid: false, error: 'Negative cost not allowed' };
    }
    return { valid: true };
  },

  /**
   * Validates minimum cost thresholds with context awareness
   */
  validateMinimumCost: (cost: number, context?: CostValidationContext): { valid: boolean; error?: string; allowZero?: boolean } => {
    if (cost < MIN_COST_THRESHOLD) {
      // Context-aware validation for zero costs
      if (cost === 0) {
        // Allow $0 costs for legitimate operations with proper context
        if (context?.operationType === 'cached_summary' || 
            context?.operationType === 'test_operation' ||
            context?.isCached === true) {
          return { valid: true, allowZero: true };
        }
        
        // In production, require context for zero-cost operations
        if (EnvironmentUtils.isProduction() && !context) {
          return { valid: false, error: 'Zero cost requires operation context in production' };
        }
        
        // Allow in development/test without strict context requirements
        if (EnvironmentUtils.isDevelopment() || EnvironmentUtils.isTest()) {
          return { valid: true, allowZero: true };
        }
        
        // Default: require context for zero costs
        return { valid: false, error: 'Zero cost operation requires valid context' };
      }
      
      // Reject extremely small non-zero costs in all environments (potential bypass)
      return { valid: false, error: 'Cost too small - potential bypass attempt' };
    }
    return { valid: true };
  },

  /**
   * Validates against maximum cost per operation
   */
  validateMaximumCost: (cost: number): { valid: boolean; error?: string } => {
    if (cost > MAX_COST_PER_OPERATION) {
      return { valid: false, error: 'Cost exceeds maximum' };
    }
    return { valid: true };
  },

  /**
   * Validates tier-specific cost limits
   */
  validateTierLimit: (cost: number, tier: string): { valid: boolean; error?: string } => {
    const tierLimit = DAILY_COST_LIMITS[tier as SubscriptionTier];
    if (!tierLimit) {
      return { valid: false, error: 'Invalid tier' };
    }
    
    if (cost > tierLimit) {
      return { valid: false, error: 'Cost exceeds tier limit' };
    }
    
    return { valid: true };
  },

  /**
   * Sanitizes cost precision to prevent floating point manipulation
   */
  sanitizeCostPrecision: (cost: number): { sanitizedCost: number; adjusted: boolean } => {
    const sanitizedCost = Math.round(cost * Math.pow(10, COST_PRECISION_DECIMALS)) / Math.pow(10, COST_PRECISION_DECIMALS);
    const adjusted = Math.abs(cost - sanitizedCost) > 0.0001;
    return { sanitizedCost, adjusted };
  }
};

/**
 * Comprehensive cost validation with detailed logging and security measures
 */
export function validateCostUpdate(
  cost: number, 
  tier: string, 
  context: Partial<CostValidationContext> = {}
): CostValidationResult {
  const { userId = 'unknown', operation = 'unknown', metadata = {} } = context;
  const warnings: string[] = [];

  // Rule 1: Type validation
  const typeValidation = ValidationRules.validateCostType(cost);
  if (!typeValidation.valid) {
    costValidationLogger.error('Cost type validation failed', { 
      cost, tier, userId, operation, error: typeValidation.error 
    });
    return { valid: false, sanitizedCost: 0, error: typeValidation.error };
  }

  // Rule 2: Sign validation
  const signValidation = ValidationRules.validateCostSign(cost);
  if (!signValidation.valid) {
    costValidationLogger.error('Cost sign validation failed', { 
      cost, tier, userId, operation, error: signValidation.error 
    });
    return { valid: false, sanitizedCost: 0, error: signValidation.error };
  }

  // Rule 3: Minimum cost validation
  const minValidation = ValidationRules.validateMinimumCost(cost, context as CostValidationContext);
  if (!minValidation.valid) {
    costValidationLogger.warn('Cost minimum validation failed', { 
      cost, tier, userId, operation, 
      environment: process.env.NODE_ENV,
      isProduction: EnvironmentUtils.isProduction(),
      isTest: EnvironmentUtils.isTest(),
      error: minValidation.error 
    });
    return { valid: false, sanitizedCost: 0, error: minValidation.error };
  }

  // Log zero cost allowance in non-production
  if (minValidation.allowZero) {
    costValidationLogger.debug('Zero cost allowed in non-production environment', { 
      cost, tier, userId, operation,
      environment: process.env.NODE_ENV,
      isTest: EnvironmentUtils.isTest() 
    });
  }

  // Rule 4: Maximum cost validation
  const maxValidation = ValidationRules.validateMaximumCost(cost);
  if (!maxValidation.valid) {
    costValidationLogger.error('Cost maximum validation failed', { 
      cost, tier, userId, operation, max: MAX_COST_PER_OPERATION, error: maxValidation.error 
    });
    return { valid: false, sanitizedCost: 0, error: maxValidation.error };
  }

  // Rule 5: Tier limit validation
  const tierValidation = ValidationRules.validateTierLimit(cost, tier);
  if (!tierValidation.valid) {
    const tierLimit = DAILY_COST_LIMITS[tier as SubscriptionTier];
    costValidationLogger.error('Tier limit validation failed', { 
      cost, tier, tierLimit, userId, operation, error: tierValidation.error 
    });
    return { valid: false, sanitizedCost: 0, error: tierValidation.error };
  }

  // Rule 6: Precision sanitization
  const { sanitizedCost, adjusted } = ValidationRules.sanitizeCostPrecision(cost);
  if (adjusted) {
    const warning = 'Cost precision adjusted';
    warnings.push(warning);
    costValidationLogger.warn(warning, { 
      original: cost, sanitized: sanitizedCost, tier, userId, operation 
    });
  }

  // Success case - log for audit trail
  costValidationLogger.debug('Cost validation successful', {
    cost: sanitizedCost,
    tier,
    userId,
    operation,
    warnings: warnings.length > 0 ? warnings : undefined,
    metadata
  });

  return { 
    valid: true, 
    sanitizedCost,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Batch cost validation for multiple operations
 */
export function validateCostBatch(
  costs: Array<{ cost: number; tier: string; context: Partial<CostValidationContext> }>
): Array<CostValidationResult & { index: number }> {
  return costs.map((item, index) => ({
    ...validateCostUpdate(item.cost, item.tier, item.context),
    index
  }));
}

/**
 * Get cost validation configuration for monitoring/debugging
 */
export function getCostValidationConfig() {
  return {
    DAILY_COST_LIMITS,
    MAX_COST_PER_OPERATION,
    COST_PRECISION_DECIMALS,
    MIN_COST_THRESHOLD,
    environment: {
      isProduction: EnvironmentUtils.isProduction(),
      isTest: EnvironmentUtils.isTest(),
      isDevelopment: EnvironmentUtils.isDevelopment()
    }
  };
}