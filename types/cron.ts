/**
 * Cron job monitoring and execution types
 * Provides type safety for cron job statuses, metrics, and configurations
 */

// Cron job status enum - replaces hardcoded strings throughout the codebase
export enum CronJobStatus {
  STARTED = 'STARTED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT'
}

// Trigger source types for cron job executions
export type CronTriggerSource = 'VERCEL_CRON' | 'RAILWAY_CRON' | 'MANUAL_TRIGGER' | 'MANUAL' | 'EXTERNAL';

// Enhanced cron execution metrics interface
export interface CronExecutionMetrics {
  tickersChecked: number;
  newFilingsFound: number;
  filingsProcessed: number;
  emailsSent: number;
  usersNotified: number;
  totalCostUSD: number;
  aiCostUSD: number;
  emailCostUSD: number;
  tokensUsed: number;
  errorCount: number;
  warningCount: number;
  // Additional performance metrics
  avgProcessingTimeMs?: number;
  peakMemoryUsageMB?: number;
  apiCallsCount?: number;
  cacheHitRate?: number;
}

// Filing processing metrics for detailed tracking
export interface FilingProcessingMetrics {
  accessionNumber: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  processingTimeMs: number;
  summaryTokens: number;
  summaryCostUSD: number;
  aiModel: string;
  emailsSent: number;
  // Additional processing details
  contentSizeBytes?: number;
  chunkCount?: number;
  extractionMethod?: 'HTML' | 'XBRL' | 'PDF' | 'TXT';
  errorDetails?: string;
}

// Cron job execution result interface
export interface CronExecutionResult {
  executionId: string;
  duration: number;
  status: CronJobStatus;
  metrics: CronExecutionMetrics;
  errorMessage?: string;
  warnings?: string[];
}

// Monitoring configuration interface
export interface MonitoringConfig {
  enableMetrics: boolean;
  enablePerformanceTracking: boolean;
  metricsRetentionDays: number;
  alertThresholds: {
    errorRate: number;
    processingTimeMs: number;
    costPerExecutionUSD: number;
  };
  batchSize: number;
  timeoutMs: number;
}

// Cron job definition interface
export interface CronJobDefinition {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  timeoutMs: number;
  retryAttempts: number;
  environment: string;
  triggerSource: CronTriggerSource;
}