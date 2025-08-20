/**
 * Environment Configuration Validation
 * Validates required environment variables on application startup
 */

import { logger } from '../logging';

const envLogger = logger.child('env-validation');

export interface AppConfig {
  database: {
    url: string;
  };
  security: {
    cronSecret?: string;
    cronSignatureSecret?: string;
    cronApiKeys: string[];
    allowedIps: string[];
  };
  costs: {
    institutionLimit: number;
    enterpriseLimit: number;
    professionalLimit: number;
    freeLimit: number;
  };
  external: {
    anthropicApiKey: string;
    resendApiKey?: string;
    clerkSecretKey?: string;
    clerkPublishableKey?: string;
  };
  platform: {
    name: 'RAILWAY' | 'VERCEL' | 'DEVELOPMENT';
    environment: 'production' | 'development' | 'test';
    isProduction: boolean;
    isDevelopment: boolean;
    isTest: boolean;
  };
}

/**
 * Validate and parse environment variables
 */
export function validateEnvironment(): AppConfig {
  const missingRequired: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  const requiredVars = [
    'DATABASE_URL',
    'ANTHROPIC_API_KEY'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingRequired.push(varName);
    }
  }

  // Optional but recommended variables
  const recommendedVars = [
    'CRON_SECRET',
    'RESEND_API_KEY',
    'CLERK_SECRET_KEY'
  ];

  for (const varName of recommendedVars) {
    if (!process.env[varName]) {
      warnings.push(`${varName} not set - some features may not work`);
    }
  }

  // Validate DATABASE_URL format if present
  if (process.env.DATABASE_URL) {
    try {
      new URL(process.env.DATABASE_URL);
    } catch (error) {
      throw new Error(`Invalid DATABASE_URL format: ${error instanceof Error ? error.message : 'URL parsing failed'}`);
    }
  }

  // Determine platform
  const platform: AppConfig['platform']['name'] = process.env.RAILWAY_ENVIRONMENT 
    ? 'RAILWAY' 
    : process.env.VERCEL_ENV 
      ? 'VERCEL' 
      : 'DEVELOPMENT';

  const environment = (process.env.NODE_ENV || 'development') as 'production' | 'development' | 'test';

  // Parse cost limits with validation
  const costLimits = {
    institutionLimit: parseFloat(process.env.INSTITUTION_COST_LIMIT || '2.50'),
    enterpriseLimit: parseFloat(process.env.ENTERPRISE_COST_LIMIT || '1.25'),
    professionalLimit: parseFloat(process.env.PROFESSIONAL_COST_LIMIT || '0.60'),
    freeLimit: parseFloat(process.env.FREE_COST_LIMIT || '0.20')
  };

  // Validate cost limits
  for (const [tier, limit] of Object.entries(costLimits)) {
    if (isNaN(limit) || limit < 0 || limit > 100) {
      throw new Error(`Invalid cost limit for ${tier}: ${limit}. Must be a number between 0 and 100.`);
    }
  }

  // Parse security configuration
  const cronApiKeys = process.env.CRON_API_KEYS?.split(',').filter(Boolean) || [];
  const allowedIps = process.env.CRON_ALLOWED_IPS?.split(',').filter(Boolean) || [];

  // Validate API keys format if provided
  if (cronApiKeys.length > 0) {
    const invalidKeys = cronApiKeys.filter(key => !/^tldr_[a-zA-Z0-9]{32}$/.test(key.trim()));
    if (invalidKeys.length > 0) {
      throw new Error(`Invalid CRON_API_KEYS format. Keys must match pattern: tldr_[32 alphanumeric chars]. Invalid keys: ${invalidKeys.join(', ')}`);
    }
  }

  // Validate IP addresses if provided
  if (allowedIps.length > 0) {
    const invalidIps = allowedIps.filter(ip => {
      const trimmedIp = ip.trim();
      // Basic validation for IPv4, IPv6, and CIDR notation
      return !/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?|[0-9a-fA-F:]+(::[0-9a-fA-F]*)?|localhost)$/.test(trimmedIp);
    });
    if (invalidIps.length > 0) {
      warnings.push(`Potentially invalid IP addresses in CRON_ALLOWED_IPS: ${invalidIps.join(', ')}`);
    }
  }

  // Check for missing required variables
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  // Log warnings
  if (warnings.length > 0) {
    for (const warning of warnings) {
      envLogger.warn(warning);
    }
  }

  const config: AppConfig = {
    database: {
      url: process.env.DATABASE_URL!
    },
    security: {
      cronSecret: process.env.CRON_SECRET,
      cronSignatureSecret: process.env.CRON_SIGNATURE_SECRET,
      cronApiKeys,
      allowedIps
    },
    costs: costLimits,
    external: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      resendApiKey: process.env.RESEND_API_KEY,
      clerkSecretKey: process.env.CLERK_SECRET_KEY,
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    },
    platform: {
      name: platform,
      environment,
      isProduction: environment === 'production',
      isDevelopment: environment === 'development',
      isTest: environment === 'test'
    }
  };

  envLogger.info('Environment configuration validated successfully', {
    platform: config.platform.name,
    environment: config.platform.environment,
    hasDatabase: !!config.database.url,
    hasCronSecret: !!config.security.cronSecret,
    hasSignatureSecret: !!config.security.cronSignatureSecret,
    apiKeyCount: config.security.cronApiKeys.length,
    allowedIpCount: config.security.allowedIps.length,
    costLimits: {
      institution: config.costs.institutionLimit,
      enterprise: config.costs.enterpriseLimit,
      professional: config.costs.professionalLimit,
      free: config.costs.freeLimit
    }
  });

  return config;
}

/**
 * Validate environment on module import (for early detection of issues)
 */
let globalConfig: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!globalConfig) {
    globalConfig = validateEnvironment();
  }
  return globalConfig;
}

/**
 * Check if we're running in a secure environment
 */
export function isSecureEnvironment(): boolean {
  const config = getAppConfig();
  return config.platform.isProduction && (
    !!config.security.cronSecret || 
    !!config.security.cronSignatureSecret || 
    config.security.cronApiKeys.length > 0
  );
}

/**
 * Get security configuration for the current environment
 */
export function getSecurityConfig() {
  const config = getAppConfig();
  return {
    ...config.security,
    isSecure: isSecureEnvironment(),
    authMethods: [
      config.security.cronSecret && 'CRON_SECRET',
      config.security.cronSignatureSecret && 'SIGNATURE',
      config.security.cronApiKeys.length > 0 && 'API_KEY'
    ].filter(Boolean)
  };
}

/**
 * Validate runtime environment health
 */
export function validateRuntimeEnvironment(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const config = getAppConfig();

    // Check database connectivity would be done here in a real implementation
    // For now, just validate the URL format
    if (!config.database.url.startsWith('postgres://') && !config.database.url.startsWith('postgresql://')) {
      warnings.push('Database URL does not appear to be PostgreSQL');
    }

    // Check security configuration
    if (!isSecureEnvironment()) {
      warnings.push('Running without proper security configuration (no CRON_SECRET, signature secret, or API keys)');
    }

    // Check cost limits are reasonable
    const { costs } = config;
    if (costs.freeLimit > costs.professionalLimit) {
      warnings.push('Free tier limit is higher than professional tier limit');
    }
    if (costs.professionalLimit > costs.enterpriseLimit) {
      warnings.push('Professional tier limit is higher than enterprise tier limit');
    }
    if (costs.enterpriseLimit > costs.institutionLimit) {
      warnings.push('Enterprise tier limit is higher than institution tier limit');
    }

    // Platform-specific checks
    if (config.platform.name === 'RAILWAY' && !process.env.RAILWAY_ENVIRONMENT) {
      warnings.push('Platform detected as Railway but RAILWAY_ENVIRONMENT not set');
    }
    if (config.platform.name === 'VERCEL' && !process.env.VERCEL_ENV) {
      warnings.push('Platform detected as Vercel but VERCEL_ENV not set');
    }

  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown validation error');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Export type for external use
export type { AppConfig };