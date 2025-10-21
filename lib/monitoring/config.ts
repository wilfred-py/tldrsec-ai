/**
 * Monitoring Configuration
 * Centralized configuration for monitoring thresholds, alerts, and system settings
 */

export interface MonitoringConfig {
  thresholds: MonitoringThresholds;
  alerts: AlertConfig;
  retention: RetentionConfig;
  notifications: NotificationConfig;
  healthCheck: HealthCheckConfig;
}

export interface MonitoringThresholds {
  errorRate: {
    warning: number;
    critical: number;
  };
  processingLatency: {
    warning: number; // milliseconds
    critical: number;
  };
  queueDepth: {
    warning: number;
    critical: number;
  };
  memoryUsage: {
    warning: number; // MB
    critical: number;
  };
  successRate: {
    warning: number; // percentage (minimum)
    critical: number;
  };
  activeJobs: {
    warning: number;
    critical: number;
  };
  diskUsage: {
    warning: number; // percentage
    critical: number;
  };
  cpuUsage: {
    warning: number; // percentage
    critical: number;
  };
}

export interface AlertConfig {
  deduplicationWindow: number; // minutes
  escalationDelay: number; // minutes
  maxAlertsPerHour: number;
  autoResolveAfter: number; // hours
  notificationChannels: string[];
  severityLevels: {
    info: AlertSeverityConfig;
    warning: AlertSeverityConfig;
    critical: AlertSeverityConfig;
  };
}

export interface AlertSeverityConfig {
  enabled: boolean;
  notifyImmediately: boolean;
  escalateAfter: number; // minutes
  maxFrequency: number; // minutes between notifications
}

export interface RetentionConfig {
  healthHistory: number; // days
  alertHistory: number; // days
  metricsHistory: number; // days
  cleanupInterval: number; // hours
}

export interface NotificationConfig {
  email: {
    enabled: boolean;
    templates: {
      alert: string;
      escalation: string;
      resolution: string;
    };
    retryAttempts: number;
    retryDelay: number; // seconds
  };
  webhook: {
    enabled: boolean;
    endpoints: string[];
    timeout: number; // seconds
    retryAttempts: number;
  };
  slack: {
    enabled: boolean;
    webhook?: string;
    channels: {
      alerts: string;
      escalations: string;
    };
  };
}

export interface HealthCheckConfig {
  interval: number; // minutes
  timeout: number; // seconds
  retryAttempts: number;
  components: {
    database: boolean;
    emailService: boolean;
    externalAPIs: boolean;
    jobQueue: boolean;
    fileSystem: boolean;
  };
}

/**
 * Default monitoring configuration
 */
export const defaultMonitoringConfig: MonitoringConfig = {
  thresholds: {
    errorRate: {
      warning: 5.0,  // 5% error rate
      critical: 15.0 // 15% error rate
    },
    processingLatency: {
      warning: 30000,  // 30 seconds
      critical: 60000  // 60 seconds
    },
    queueDepth: {
      warning: 100,
      critical: 500
    },
    memoryUsage: {
      warning: 1024,  // 1GB
      critical: 2048  // 2GB
    },
    successRate: {
      warning: 95.0,  // Below 95%
      critical: 85.0  // Below 85%
    },
    activeJobs: {
      warning: 50,
      critical: 100
    },
    diskUsage: {
      warning: 80.0,  // 80% disk usage
      critical: 90.0  // 90% disk usage
    },
    cpuUsage: {
      warning: 70.0,  // 70% CPU usage
      critical: 85.0  // 85% CPU usage
    }
  },
  alerts: {
    deduplicationWindow: 15, // 15 minutes
    escalationDelay: 60,     // 60 minutes
    maxAlertsPerHour: 20,
    autoResolveAfter: 24,    // 24 hours
    notificationChannels: ['email'],
    severityLevels: {
      info: {
        enabled: true,
        notifyImmediately: false,
        escalateAfter: 0,
        maxFrequency: 60
      },
      warning: {
        enabled: true,
        notifyImmediately: true,
        escalateAfter: 120, // 2 hours
        maxFrequency: 30
      },
      critical: {
        enabled: true,
        notifyImmediately: true,
        escalateAfter: 60,  // 1 hour
        maxFrequency: 15
      }
    }
  },
  retention: {
    healthHistory: 90,  // 90 days
    alertHistory: 365,  // 1 year
    metricsHistory: 30, // 30 days
    cleanupInterval: 24 // every 24 hours
  },
  notifications: {
    email: {
      enabled: true,
      templates: {
        alert: 'alert-notification',
        escalation: 'alert-escalation',
        resolution: 'alert-resolution'
      },
      retryAttempts: 3,
      retryDelay: 30
    },
    webhook: {
      enabled: false,
      endpoints: [],
      timeout: 30,
      retryAttempts: 2
    },
    slack: {
      enabled: false,
      channels: {
        alerts: '#alerts',
        escalations: '#critical-alerts'
      }
    }
  },
  healthCheck: {
    interval: 5,        // 5 minutes
    timeout: 30,        // 30 seconds
    retryAttempts: 3,
    components: {
      database: true,
      emailService: true,
      externalAPIs: true,
      jobQueue: true,
      fileSystem: false // Not applicable for serverless
    }
  }
};

/**
 * Environment-specific configuration overrides
 */
export const environmentConfigs: Record<string, Partial<MonitoringConfig>> = {
  development: {
    thresholds: {
      errorRate: {
        warning: 10.0,
        critical: 25.0
      },
      processingLatency: {
        warning: 60000,
        critical: 120000
      }
    },
    alerts: {
      deduplicationWindow: 5,
      maxAlertsPerHour: 50
    },
    notifications: {
      email: {
        enabled: false // Disable emails in development
      }
    },
    healthCheck: {
      interval: 1 // More frequent checks in development
    }
  },
  production: {
    alerts: {
      deduplicationWindow: 15,
      maxAlertsPerHour: 10
    },
    notifications: {
      email: {
        enabled: true
      },
      webhook: {
        enabled: true,
        endpoints: process.env.MONITORING_WEBHOOK_URLS?.split(',') || []
      }
    }
  },
  test: {
    notifications: {
      email: {
        enabled: false
      },
      webhook: {
        enabled: false
      }
    },
    healthCheck: {
      interval: 0.1 // Very frequent for testing
    }
  }
};

/**
 * Get monitoring configuration for current environment
 */
export function getMonitoringConfig(): MonitoringConfig {
  const environment = process.env.NODE_ENV || 'development';
  const baseConfig = { ...defaultMonitoringConfig };
  const envOverrides = environmentConfigs[environment] || {};

  // Deep merge configurations
  return mergeDeep(baseConfig, envOverrides);
}

/**
 * Deep merge utility for configuration objects
 */
function mergeDeep(target: any, source: any): any {
  const output = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }
  
  return output;
}

/**
 * Validate monitoring configuration
 */
export function validateMonitoringConfig(config: MonitoringConfig): string[] {
  const errors: string[] = [];

  // Validate thresholds
  if (config.thresholds.errorRate.warning >= config.thresholds.errorRate.critical) {
    errors.push('Error rate warning threshold must be less than critical threshold');
  }

  if (config.thresholds.processingLatency.warning >= config.thresholds.processingLatency.critical) {
    errors.push('Processing latency warning threshold must be less than critical threshold');
  }

  if (config.thresholds.successRate.warning <= config.thresholds.successRate.critical) {
    errors.push('Success rate warning threshold must be greater than critical threshold');
  }

  // Validate alert configuration
  if (config.alerts.deduplicationWindow < 1) {
    errors.push('Deduplication window must be at least 1 minute');
  }

  if (config.alerts.escalationDelay < 5) {
    errors.push('Escalation delay must be at least 5 minutes');
  }

  // Validate retention periods
  if (config.retention.healthHistory < 1) {
    errors.push('Health history retention must be at least 1 day');
  }

  if (config.retention.alertHistory < 7) {
    errors.push('Alert history retention must be at least 7 days');
  }

  return errors;
}

/**
 * Export the current monitoring configuration
 */
export const monitoringConfig = getMonitoringConfig();