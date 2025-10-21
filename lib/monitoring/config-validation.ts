/**
 * Configuration Validation for Monitoring System
 * 
 * Provides Zod-based schema validation for all monitoring configuration
 * with bounds checking, reasonable defaults, and runtime validation.
 */

import { z } from 'zod';
import { logger } from '../logging';

// Environment validation schema
const EnvironmentConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().min(1, 'Database URL is required'),
  RESEND_API_KEY: z.string().min(1, 'Resend API key is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'Anthropic API key is required'),
  ALERT_EMAIL_RECIPIENTS: z.string().optional(),
  ESCALATION_EMAIL_RECIPIENTS: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  
  // Monitoring specific environment variables
  MONITORING_ENABLED: z.string().transform(val => val === 'true').default('true'),
  MONITORING_INTERVAL_MS: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(10000).max(300000).default(60000)
  ),
  ALERT_RATE_LIMIT_HOUR: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(1).max(100).default(10)
  ),
  ALERT_RATE_LIMIT_DAY: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(1).max(1000).default(50)
  ),
  MEMORY_WARNING_THRESHOLD: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(50).max(95).default(70)
  ),
  MEMORY_CRITICAL_THRESHOLD: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(60).max(98).default(85)
  ),
  CPU_WARNING_THRESHOLD: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(50).max(95).default(75)
  ),
  CPU_CRITICAL_THRESHOLD: z.string().transform(val => parseInt(val)).pipe(
    z.number().min(60).max(98).default(90)
  )
});

// Monitoring configuration schema
const MonitoringConfigSchema = z.object({
  intervals: z.object({
    health: z.number().min(10000).max(300000).default(60000),
    metrics: z.number().min(5000).max(120000).default(30000),
    cleanup: z.number().min(60000).max(3600000).default(300000),
    alerts: z.number().min(30000).max(600000).default(120000)
  }).default({}),
  
  thresholds: z.object({
    memory: z.object({
      warning: z.number().min(50).max(95).default(70),
      critical: z.number().min(60).max(98).default(85),
      emergency: z.number().min(70).max(99).default(95)
    }).default({}),
    
    cpu: z.object({
      warning: z.number().min(50).max(95).default(75),
      critical: z.number().min(60).max(98).default(90)
    }).default({}),
    
    database: z.object({
      connectionPoolWarning: z.number().min(50).max(95).default(80),
      connectionPoolCritical: z.number().min(60).max(99).default(95),
      queryTimeWarning: z.number().min(100).max(10000).default(1000),
      queryTimeCritical: z.number().min(500).max(30000).default(5000)
    }).default({}),
    
    performance: z.object({
      apiResponseTimeWarning: z.number().min(100).max(10000).default(2000),
      apiResponseTimeCritical: z.number().min(500).max(30000).default(5000),
      errorRateWarning: z.number().min(1).max(50).default(5),
      errorRateCritical: z.number().min(5).max(100).default(15)
    }).default({})
  }).default({}),
  
  alerts: z.object({
    email: z.object({
      enabled: z.boolean().default(true),
      recipients: z.array(z.string().email()).min(1).default(['admin@tldrsec.app']),
      rateLimits: z.object({
        maxPerHour: z.number().min(1).max(100).default(10),
        maxPerDay: z.number().min(1).max(1000).default(50),
        burstLimit: z.number().min(1).max(20).default(3),
        cooldownMinutes: z.number().min(1).max(120).default(15)
      }).default({})
    }).default({}),
    
    escalation: z.object({
      enabled: z.boolean().default(true),
      recipients: z.array(z.string().email()).default([]),
      delayMinutes: z.number().min(5).max(240).default(60),
      maxEscalations: z.number().min(1).max(10).default(3)
    }).default({}),
    
    deduplication: z.object({
      enabled: z.boolean().default(true),
      timeWindowMinutes: z.number().min(5).max(240).default(30),
      similarityThreshold: z.number().min(0.1).max(1.0).default(0.8),
      maxDuplicates: z.number().min(1).max(20).default(5)
    }).default({})
  }).default({}),
  
  cleanup: z.object({
    metricsRetentionHours: z.number().min(1).max(168).default(24), // 1 week max
    alertsRetentionDays: z.number().min(1).max(90).default(30),
    cacheMaxSize: z.number().min(100).max(10000).default(1000),
    cacheMaxAgeMinutes: z.number().min(5).max(1440).default(60)
  }).default({}),
  
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    failureThreshold: z.number().min(2).max(20).default(5),
    successThreshold: z.number().min(1).max(10).default(3),
    timeoutMs: z.number().min(10000).max(300000).default(60000),
    monitorWindowMs: z.number().min(60000).max(1800000).default(300000)
  }).default({})
});

// Database monitoring configuration schema
const DatabaseConfigSchema = z.object({
  monitoring: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().min(10000).max(300000).default(60000),
    slowQueryThreshold: z.number().min(100).max(10000).default(1000),
    maxMetricsHistory: z.number().min(100).max(10000).default(1440),
    maxQueryHistory: z.number().min(100).max(5000).default(1000)
  }).default({}),
  
  pooling: z.object({
    maxConnections: z.number().min(5).max(100).default(20),
    minConnections: z.number().min(1).max(10).default(2),
    acquireTimeoutMs: z.number().min(1000).max(30000).default(10000),
    idleTimeoutMs: z.number().min(10000).max(300000).default(300000)
  }).default({})
});

// Memory management configuration schema
const MemoryConfigSchema = z.object({
  monitoring: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().min(30000).max(300000).default(60000)
  }).default({}),
  
  thresholds: z.object({
    warning: z.number().min(50).max(95).default(70),
    critical: z.number().min(60).max(98).default(85),
    emergency: z.number().min(70).max(99).default(95)
  }).default({}),
  
  cleanup: z.object({
    automaticCleanup: z.boolean().default(true),
    cleanupIntervalMs: z.number().min(30000).max(600000).default(30000),
    forceCleanupOnEmergency: z.boolean().default(true),
    maxCacheSize: z.number().min(100).max(10000).default(1000),
    maxCacheAgeMs: z.number().min(300000).max(86400000).default(3600000)
  }).default({}),
  
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    memoryThreshold: z.number().min(80).max(99).default(90),
    failureThreshold: z.number().min(2).max(10).default(5),
    timeoutMs: z.number().min(10000).max(300000).default(60000)
  }).default({})
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

export class ConfigValidator {
  private static instance: ConfigValidator;
  private environmentConfig?: EnvironmentConfig;
  private monitoringConfig?: MonitoringConfig;
  private databaseConfig?: DatabaseConfig;
  private memoryConfig?: MemoryConfig;
  
  private constructor() {}
  
  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }
  
  /**
   * Validate and get environment configuration
   */
  getEnvironmentConfig(): EnvironmentConfig {
    if (this.environmentConfig) {
      return this.environmentConfig;
    }
    
    try {
      // Create environment object from process.env
      const envObject = {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ALERT_EMAIL_RECIPIENTS: process.env.ALERT_EMAIL_RECIPIENTS,
        ESCALATION_EMAIL_RECIPIENTS: process.env.ESCALATION_EMAIL_RECIPIENTS,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
        MONITORING_ENABLED: process.env.MONITORING_ENABLED,
        MONITORING_INTERVAL_MS: process.env.MONITORING_INTERVAL_MS,
        ALERT_RATE_LIMIT_HOUR: process.env.ALERT_RATE_LIMIT_HOUR,
        ALERT_RATE_LIMIT_DAY: process.env.ALERT_RATE_LIMIT_DAY,
        MEMORY_WARNING_THRESHOLD: process.env.MEMORY_WARNING_THRESHOLD,
        MEMORY_CRITICAL_THRESHOLD: process.env.MEMORY_CRITICAL_THRESHOLD,
        CPU_WARNING_THRESHOLD: process.env.CPU_WARNING_THRESHOLD,
        CPU_CRITICAL_THRESHOLD: process.env.CPU_CRITICAL_THRESHOLD
      };
      
      this.environmentConfig = EnvironmentConfigSchema.parse(envObject);
      
      logger.info('Environment configuration validated successfully', {
        nodeEnv: this.environmentConfig.NODE_ENV,
        monitoringEnabled: this.environmentConfig.MONITORING_ENABLED,
        alertRecipients: this.environmentConfig.ALERT_EMAIL_RECIPIENTS ? 'configured' : 'default'
      });
      
      return this.environmentConfig;
    } catch (error) {
      logger.error('Environment configuration validation failed', { error });
      throw new Error(`Invalid environment configuration: ${error}`);
    }
  }
  
  /**
   * Validate and get monitoring configuration
   */
  getMonitoringConfig(userConfig: Partial<MonitoringConfig> = {}): MonitoringConfig {
    if (this.monitoringConfig && Object.keys(userConfig).length === 0) {
      return this.monitoringConfig;
    }
    
    try {
      const envConfig = this.getEnvironmentConfig();
      
      // Merge environment variables with user config and defaults
      const configObject = this.deepMerge({
        intervals: {
          health: envConfig.MONITORING_INTERVAL_MS
        },
        thresholds: {
          memory: {
            warning: envConfig.MEMORY_WARNING_THRESHOLD,
            critical: envConfig.MEMORY_CRITICAL_THRESHOLD
          },
          cpu: {
            warning: envConfig.CPU_WARNING_THRESHOLD,
            critical: envConfig.CPU_CRITICAL_THRESHOLD
          }
        },
        alerts: {
          email: {
            recipients: envConfig.ALERT_EMAIL_RECIPIENTS ? 
              envConfig.ALERT_EMAIL_RECIPIENTS.split(',').map(e => e.trim()) : 
              undefined,
            rateLimits: {
              maxPerHour: envConfig.ALERT_RATE_LIMIT_HOUR,
              maxPerDay: envConfig.ALERT_RATE_LIMIT_DAY
            }
          },
          escalation: {
            recipients: envConfig.ESCALATION_EMAIL_RECIPIENTS ? 
              envConfig.ESCALATION_EMAIL_RECIPIENTS.split(',').map(e => e.trim()) : 
              undefined
          }
        }
      }, userConfig);
      
      this.monitoringConfig = MonitoringConfigSchema.parse(configObject);
      
      // Validate threshold relationships
      this.validateThresholdRelationships(this.monitoringConfig);
      
      logger.info('Monitoring configuration validated successfully', {
        memoryWarning: this.monitoringConfig.thresholds.memory.warning,
        memoryCritical: this.monitoringConfig.thresholds.memory.critical,
        emailRecipientsCount: this.monitoringConfig.alerts.email.recipients.length
      });
      
      return this.monitoringConfig;
    } catch (error) {
      logger.error('Monitoring configuration validation failed', { error });
      throw new Error(`Invalid monitoring configuration: ${error}`);
    }
  }
  
  /**
   * Validate and get database configuration
   */
  getDatabaseConfig(userConfig: Partial<DatabaseConfig> = {}): DatabaseConfig {
    if (this.databaseConfig && Object.keys(userConfig).length === 0) {
      return this.databaseConfig;
    }
    
    try {
      const envConfig = this.getEnvironmentConfig();
      
      const configObject = this.deepMerge({
        monitoring: {
          enabled: envConfig.MONITORING_ENABLED,
          intervalMs: envConfig.MONITORING_INTERVAL_MS
        }
      }, userConfig);
      
      this.databaseConfig = DatabaseConfigSchema.parse(configObject);
      
      logger.info('Database configuration validated successfully', {
        monitoringEnabled: this.databaseConfig.monitoring.enabled,
        maxConnections: this.databaseConfig.pooling.maxConnections,
        slowQueryThreshold: this.databaseConfig.monitoring.slowQueryThreshold
      });
      
      return this.databaseConfig;
    } catch (error) {
      logger.error('Database configuration validation failed', { error });
      throw new Error(`Invalid database configuration: ${error}`);
    }
  }
  
  /**
   * Validate and get memory configuration
   */
  getMemoryConfig(userConfig: Partial<MemoryConfig> = {}): MemoryConfig {
    if (this.memoryConfig && Object.keys(userConfig).length === 0) {
      return this.memoryConfig;
    }
    
    try {
      const envConfig = this.getEnvironmentConfig();
      
      const configObject = this.deepMerge({
        monitoring: {
          enabled: envConfig.MONITORING_ENABLED,
          intervalMs: envConfig.MONITORING_INTERVAL_MS
        },
        thresholds: {
          warning: envConfig.MEMORY_WARNING_THRESHOLD,
          critical: envConfig.MEMORY_CRITICAL_THRESHOLD
        }
      }, userConfig);
      
      this.memoryConfig = MemoryConfigSchema.parse(configObject);
      
      // Validate memory threshold progression
      if (this.memoryConfig.thresholds.warning >= this.memoryConfig.thresholds.critical) {
        throw new Error('Memory warning threshold must be less than critical threshold');
      }
      if (this.memoryConfig.thresholds.critical >= this.memoryConfig.thresholds.emergency) {
        throw new Error('Memory critical threshold must be less than emergency threshold');
      }
      
      logger.info('Memory configuration validated successfully', {
        warningThreshold: this.memoryConfig.thresholds.warning,
        criticalThreshold: this.memoryConfig.thresholds.critical,
        emergencyThreshold: this.memoryConfig.thresholds.emergency
      });
      
      return this.memoryConfig;
    } catch (error) {
      logger.error('Memory configuration validation failed', { error });
      throw new Error(`Invalid memory configuration: ${error}`);
    }
  }
  
  /**
   * Validate configuration at runtime
   */
  validateRuntimeConfig(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Validate environment
      const envConfig = this.getEnvironmentConfig();
      
      // Check critical environment variables
      if (envConfig.NODE_ENV === 'production') {
        if (!envConfig.ALERT_EMAIL_RECIPIENTS) {
          warnings.push('No alert email recipients configured for production');
        }
        if (!envConfig.ESCALATION_EMAIL_RECIPIENTS) {
          warnings.push('No escalation email recipients configured for production');
        }
        if (!envConfig.NEXT_PUBLIC_BASE_URL) {
          warnings.push('No base URL configured for alert links');
        }
      }
      
      // Validate monitoring config
      const monitoringConfig = this.getMonitoringConfig();
      
      // Check interval relationships
      if (monitoringConfig.intervals.metrics >= monitoringConfig.intervals.health) {
        warnings.push('Metrics interval should be shorter than health check interval');
      }
      
      // Check alert rate limits are reasonable
      if (monitoringConfig.alerts.email.rateLimits.maxPerHour > 20) {
        warnings.push('High alert rate limit may cause email spam');
      }
      
      // Validate database config
      const databaseConfig = this.getDatabaseConfig();
      
      if (databaseConfig.pooling.minConnections >= databaseConfig.pooling.maxConnections) {
        errors.push('Database min connections must be less than max connections');
      }
      
      // Validate memory config
      const memoryConfig = this.getMemoryConfig();
      
      if (memoryConfig.circuitBreaker.memoryThreshold <= memoryConfig.thresholds.critical) {
        warnings.push('Circuit breaker memory threshold should be higher than critical threshold');
      }
      
    } catch (error) {
      errors.push(`Configuration validation error: ${error}`);
    }
    
    const isValid = errors.length === 0;
    
    if (isValid && warnings.length === 0) {
      logger.info('Runtime configuration validation passed');
    } else if (isValid) {
      logger.warn('Runtime configuration validation passed with warnings', { warnings });
    } else {
      logger.error('Runtime configuration validation failed', { errors, warnings });
    }
    
    return { isValid, errors, warnings };
  }
  
  /**
   * Get configuration summary for debugging
   */
  getConfigSummary(): Record<string, any> {
    try {
      return {
        environment: this.getEnvironmentConfig(),
        monitoring: this.getMonitoringConfig(),
        database: this.getDatabaseConfig(),
        memory: this.getMemoryConfig(),
        validation: this.validateRuntimeConfig()
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown configuration error'
      };
    }
  }
  
  /**
   * Validate threshold relationships
   */
  private validateThresholdRelationships(config: MonitoringConfig): void {
    // Memory thresholds
    if (config.thresholds.memory.warning >= config.thresholds.memory.critical) {
      throw new Error('Memory warning threshold must be less than critical threshold');
    }
    if (config.thresholds.memory.critical >= config.thresholds.memory.emergency) {
      throw new Error('Memory critical threshold must be less than emergency threshold');
    }
    
    // CPU thresholds
    if (config.thresholds.cpu.warning >= config.thresholds.cpu.critical) {
      throw new Error('CPU warning threshold must be less than critical threshold');
    }
    
    // Database thresholds
    if (config.thresholds.database.connectionPoolWarning >= config.thresholds.database.connectionPoolCritical) {
      throw new Error('Database connection pool warning threshold must be less than critical threshold');
    }
    if (config.thresholds.database.queryTimeWarning >= config.thresholds.database.queryTimeCritical) {
      throw new Error('Database query time warning threshold must be less than critical threshold');
    }
    
    // Performance thresholds
    if (config.thresholds.performance.apiResponseTimeWarning >= config.thresholds.performance.apiResponseTimeCritical) {
      throw new Error('API response time warning threshold must be less than critical threshold');
    }
    if (config.thresholds.performance.errorRateWarning >= config.thresholds.performance.errorRateCritical) {
      throw new Error('Error rate warning threshold must be less than critical threshold');
    }
  }
  
  /**
   * Deep merge utility for configuration objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

// Export singleton instance
export const configValidator = ConfigValidator.getInstance();

// Export schemas for external use
export {
  EnvironmentConfigSchema,
  MonitoringConfigSchema,
  DatabaseConfigSchema,
  MemoryConfigSchema
};