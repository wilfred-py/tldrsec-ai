/**
 * Enhanced Filing Services Type Definitions
 * 
 * Centralized type definitions for the enhanced filing processing system
 */

import { FilingType } from '../../../types/sec/filing';

// Re-export core types for convenience
export { FilingType };

/**
 * Processing modes for the enhanced system
 */
export type ProcessingMode = 'single' | 'chunked' | 'hybrid';

/**
 * Processing status for tracking
 */
export type ProcessingStatus = 
  | 'PENDING'
  | 'FETCHING_DOCUMENT'
  | 'PARSING_CONTENT'
  | 'CHUNKING'
  | 'SUMMARIZING'
  | 'AGGREGATING'
  | 'CACHING'
  | 'COMPLETED'
  | 'FAILED';

/**
 * Enhanced configuration options
 */
export interface EnhancedConfig {
  features: {
    intelligentChunking: boolean;
    documentPrioritization: boolean;
    structuredSummaries: boolean;
    enhancedCaching: boolean;
    fallbackProcessing: boolean;
  };
  limits: {
    maxTokensPerChunk: number;
    maxChunks: number;
    singleProcessingLimit: number;
    maxRetries: number;
  };
  caching: {
    ttlDays: number;
    enabled: boolean;
  };
  monitoring: {
    verboseLogging: boolean;
    performanceTracking: boolean;
  };
}

/**
 * Processing metrics for monitoring and optimization
 */
export interface ProcessingMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  stages: {
    documentFetch?: number;
    contentParsing?: number;
    chunking?: number;
    summarization?: number;
    caching?: number;
  };
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  cacheHit: boolean;
  retries: number;
  errors: string[];
}

/**
 * Document quality assessment
 */
export interface DocumentQuality {
  score: number; // 0-1 quality score
  factors: {
    contentLength: number;
    structureDetected: boolean;
    financialDataPresent: boolean;
    readabilityScore: number;
  };
  issues: string[];
  recommendations: string[];
}

/**
 * Enhanced error information
 */
export interface EnhancedError {
  code: string;
  message: string;
  context: {
    ticker?: string;
    filingType?: FilingType;
    stage?: ProcessingStatus;
    retryable: boolean;
  };
  originalError?: Error;
  timestamp: Date;
}

/**
 * Fallback strategy configuration
 */
export interface FallbackStrategy {
  enabled: boolean;
  triggers: {
    tokenLimitExceeded: boolean;
    aiProcessingFailed: boolean;
    documentNotFound: boolean;
    parsingFailed: boolean;
  };
  actions: {
    useGenericSummary: boolean;
    retryWithSmallerChunks: boolean;
    skipComplexFormatting: boolean;
    useCachedSimilar: boolean;
  };
}

/**
 * A/B testing configuration for gradual rollout
 */
export interface ABTestConfig {
  enabled: boolean;
  trafficSplit: number; // 0-1, percentage to use enhanced flow
  criteria: {
    byTicker?: string[];
    byFormType?: FilingType[];
    byUserEmail?: string[];
  };
  metrics: {
    trackSuccessRate: boolean;
    trackPerformance: boolean;
    trackCost: boolean;
    trackUserSatisfaction: boolean;
  };
}

/**
 * Enhanced filing summary request
 */
export interface EnhancedFilingSummaryRequest {
  ticker: string;
  formType: FilingType;
  options?: {
    priority?: 'low' | 'normal' | 'high';
    timeout?: number;
    forceRefresh?: boolean;
    debugMode?: boolean;
  };
  context?: {
    userId?: string;
    requestId?: string;
    source?: 'email' | 'api' | 'web' | 'test';
  };
}

/**
 * Enhanced processing pipeline result
 */
export interface EnhancedProcessingResult {
  success: boolean;
  data?: any;
  error?: EnhancedError;
  metrics: ProcessingMetrics;
  quality?: DocumentQuality;
  metadata: {
    processingMode: ProcessingMode;
    version: string;
    configUsed: Partial<EnhancedConfig>;
    fallbacksUsed: string[];
  };
}

/**
 * Monitoring and alerting thresholds
 */
export interface MonitoringThresholds {
  performance: {
    maxProcessingTimeMs: number;
    maxCostPerSummary: number;
    minSuccessRate: number;
  };
  quality: {
    minQualityScore: number;
    maxErrorRate: number;
  };
  resources: {
    maxTokensPerHour: number;
    maxCostPerHour: number;
  };
}

/**
 * Feature flags with environment variable mapping
 */
export interface FeatureFlags {
  [key: string]: {
    enabled: boolean;
    envVar: string;
    default: boolean;
    description: string;
  };
}

/**
 * System health status
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    documentProcessor: 'up' | 'down' | 'degraded';
    aiSummarizer: 'up' | 'down' | 'degraded';
    caching: 'up' | 'down' | 'degraded';
    database: 'up' | 'down' | 'degraded';
  };
  metrics: {
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
  };
  lastChecked: Date;
}

/**
 * Export all types for easy importing
 */
export type {
  ProcessingMode,
  ProcessingStatus,
  EnhancedConfig,
  ProcessingMetrics,
  DocumentQuality,
  EnhancedError,
  FallbackStrategy,
  ABTestConfig,
  EnhancedFilingSummaryRequest,
  EnhancedProcessingResult,
  MonitoringThresholds,
  FeatureFlags,
  SystemHealth
};