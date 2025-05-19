/**
 * Parser Monitor and Analytics
 * 
 * This module provides utilities for monitoring parser performance, tracking errors,
 * and collecting analytics on parsing operations.
 */

import { ParserErrorCategory, ParserError } from './parser-error-handler';
import { Logger } from '@/lib/logging';

// Create a logger for parser monitoring
const logger = new Logger({}, 'parser-monitor');

/**
 * Parser performance metrics
 */
export interface ParserMetrics {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  totalParsingTime: number;
  averageParsingTime: number;
  errorCountByCategory: Partial<Record<ParserErrorCategory, number>>;
  lastError?: ParserError | Error;
  lastSuccessTime?: number;
  lastErrorTime?: number;
}

/**
 * Structure of an individual parse operation record
 */
export interface ParseOperationRecord {
  id: string;
  parserType: string;
  sourceType: string;
  startTime: number;
  endTime?: number;
  elapsedTime?: number;
  success: boolean;
  errorCategory?: ParserErrorCategory;
  errorMessage?: string;
  usedFallback: boolean;
  usedRetry: boolean;
  retryCount: number;
  resultSize?: number;
  metadataSize?: number;
}

/**
 * Global metrics storage
 */
const metricsStore: Record<string, ParserMetrics> = {};

/**
 * Recent operation records 
 * (limited size circular buffer)
 */
const recentOperations: ParseOperationRecord[] = [];
const MAX_RECENT_OPERATIONS = 100;

/**
 * Initialize metrics for a parser
 */
export function initializeMetrics(parserType: string): ParserMetrics {
  if (!metricsStore[parserType]) {
    metricsStore[parserType] = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      totalParsingTime: 0,
      averageParsingTime: 0,
      errorCountByCategory: {}
    };
  }
  return metricsStore[parserType];
}

/**
 * Get metrics for a specific parser
 */
export function getMetrics(parserType: string): ParserMetrics {
  return metricsStore[parserType] || initializeMetrics(parserType);
}

/**
 * Get all parser metrics
 */
export function getAllMetrics(): Record<string, ParserMetrics> {
  return { ...metricsStore }; // Return a copy
}

/**
 * Get recent operation records
 */
export function getRecentOperations(
  limit = MAX_RECENT_OPERATIONS,
  filter?: (record: ParseOperationRecord) => boolean
): ParseOperationRecord[] {
  // Apply filter if provided, otherwise return all (up to limit)
  const records = filter
    ? recentOperations.filter(filter)
    : [...recentOperations];
  
  // Sort by most recent first
  records.sort((a, b) => b.startTime - a.startTime);
  
  // Return up to the limit
  return records.slice(0, limit);
}

/**
 * Record the start of a parse operation
 */
export function startParseOperation(
  parserType: string,
  sourceType: string
): string {
  const id = `${parserType}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const startTime = Date.now();
  
  // Create and add the record
  const record: ParseOperationRecord = {
    id,
    parserType,
    sourceType,
    startTime,
    success: false, // Will be updated on completion
    usedFallback: false,
    usedRetry: false,
    retryCount: 0
  };
  
  // Add to recent operations
  addRecentOperation(record);
  
  // Update metrics
  const metrics = getMetrics(parserType);
  metrics.totalAttempts++;
  
  return id;
}

/**
 * Record a successful parse completion
 */
export function recordParseSuccess(
  operationId: string,
  options: {
    resultSize?: number;
    metadataSize?: number;
    usedFallback?: boolean;
    usedRetry?: boolean;
    retryCount?: number;
  } = {}
): void {
  // Find the operation record
  const record = findOperationRecord(operationId);
  if (!record) {
    logger.warn(`Cannot find operation record for ID: ${operationId}`);
    return;
  }
  
  // Update record
  record.endTime = Date.now();
  record.elapsedTime = record.endTime - record.startTime;
  record.success = true;
  record.usedFallback = options.usedFallback || false;
  record.usedRetry = options.usedRetry || false;
  record.retryCount = options.retryCount || 0;
  record.resultSize = options.resultSize;
  record.metadataSize = options.metadataSize;
  
  // Update metrics
  const metrics = getMetrics(record.parserType);
  metrics.successCount++;
  metrics.totalParsingTime += record.elapsedTime;
  metrics.averageParsingTime = metrics.totalParsingTime / metrics.successCount;
  metrics.lastSuccessTime = record.endTime;
  
  if (record.retryCount > 0) {
    metrics.retryCount += record.retryCount;
  }
  
  logger.debug(`Successful parsing operation: ${operationId} (${record.elapsedTime}ms)`);
}

/**
 * Record a parse failure
 */
export function recordParseFailure(
  operationId: string,
  error: Error,
  options: {
    usedRetry?: boolean;
    retryCount?: number;
  } = {}
): void {
  // Find the operation record
  const record = findOperationRecord(operationId);
  if (!record) {
    logger.warn(`Cannot find operation record for ID: ${operationId}`);
    return;
  }
  
  // Update record
  record.endTime = Date.now();
  record.elapsedTime = record.endTime - record.startTime;
  record.success = false;
  record.usedRetry = options.usedRetry || false;
  record.retryCount = options.retryCount || 0;
  
  // Determine error category
  if (error instanceof ParserError) {
    record.errorCategory = error.info.category;
    record.errorMessage = error.message;
  } else {
    record.errorMessage = error.message;
  }
  
  // Update metrics
  const metrics = getMetrics(record.parserType);
  metrics.failureCount++;
  metrics.lastError = error;
  metrics.lastErrorTime = record.endTime;
  
  // Track error category
  if (record.errorCategory) {
    const categoryCount = metrics.errorCountByCategory[record.errorCategory] || 0;
    metrics.errorCountByCategory[record.errorCategory] = categoryCount + 1;
  }
  
  if (record.retryCount > 0) {
    metrics.retryCount += record.retryCount;
  }
  
  logger.warn(
    `Parsing operation failed: ${operationId} (${record.elapsedTime}ms)`,
    { error, parserType: record.parserType }
  );
}

/**
 * Get success rate for a parser
 */
export function getSuccessRate(parserType: string): number {
  const metrics = getMetrics(parserType);
  return metrics.totalAttempts > 0
    ? metrics.successCount / metrics.totalAttempts
    : 0;
}

/**
 * Get error distribution by category
 */
export function getErrorDistribution(
  parserType: string
): Record<string, { count: number; percentage: number }> {
  const metrics = getMetrics(parserType);
  const totalErrors = metrics.failureCount;
  const distribution: Record<string, { count: number; percentage: number }> = {};
  
  if (totalErrors > 0) {
    for (const [category, count] of Object.entries(metrics.errorCountByCategory)) {
      distribution[category] = {
        count: count || 0,
        percentage: ((count || 0) / totalErrors) * 100
      };
    }
  }
  
  return distribution;
}

/**
 * Generate a report on parser performance
 */
export function generatePerformanceReport(
  parserType?: string
): Record<string, any> {
  if (parserType) {
    // Report for a specific parser
    const metrics = getMetrics(parserType);
    const errorDistribution = getErrorDistribution(parserType);
    const recentOps = getRecentOperations(10, 
      record => record.parserType === parserType
    );
    
    return {
      parserType,
      metrics,
      errorDistribution,
      successRate: getSuccessRate(parserType),
      recentOperations: recentOps,
      generatedAt: new Date().toISOString()
    };
  } else {
    // Report for all parsers
    const report: Record<string, any> = {
      summary: {
        totalParsers: Object.keys(metricsStore).length,
        totalOperations: Object.values(metricsStore)
          .reduce((sum, metrics) => sum + metrics.totalAttempts, 0),
        overallSuccessRate: calculateOverallSuccessRate(),
        recentOperations: getRecentOperations(10)
      },
      parserReports: {}
    };
    
    // Add individual parser reports
    for (const parser of Object.keys(metricsStore)) {
      report.parserReports[parser] = generatePerformanceReport(parser);
    }
    
    return report;
  }
}

// Helper functions

/**
 * Find an operation record by ID
 */
function findOperationRecord(operationId: string): ParseOperationRecord | undefined {
  return recentOperations.find(record => record.id === operationId);
}

/**
 * Add an operation to the recent operations list
 */
function addRecentOperation(record: ParseOperationRecord): void {
  // Add to the beginning
  recentOperations.unshift(record);
  
  // Trim to maximum size
  if (recentOperations.length > MAX_RECENT_OPERATIONS) {
    recentOperations.pop(); // Remove the oldest
  }
}

/**
 * Calculate overall success rate across all parsers
 */
function calculateOverallSuccessRate(): number {
  let totalAttempts = 0;
  let totalSuccesses = 0;
  
  for (const metrics of Object.values(metricsStore)) {
    totalAttempts += metrics.totalAttempts;
    totalSuccesses += metrics.successCount;
  }
  
  return totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;
}

/**
 * Wrapper function to monitor parse operations
 */
export async function monitoredParsing<T>(
  parserType: string,
  sourceType: string,
  parsingFn: () => Promise<T>,
  options: {
    getResultSize?: (result: T) => number;
    getMetadataSize?: (result: T) => number;
  } = {}
): Promise<T> {
  // Start monitoring the operation
  const operationId = startParseOperation(parserType, sourceType);
  let usedRetry = false;
  let retryCount = 0;
  let usedFallback = false;
  
  try {
    const result = await parsingFn();
    
    // Record success with result sizes if available
    const resultSize = options.getResultSize ? options.getResultSize(result) : undefined;
    const metadataSize = options.getMetadataSize ? options.getMetadataSize(result) : undefined;
    
    recordParseSuccess(operationId, {
      resultSize,
      metadataSize,
      usedRetry,
      retryCount,
      usedFallback
    });
    
    return result;
  } catch (error) {
    // Track if a fallback or retry was used from the error
    if (error instanceof ParserError) {
      usedRetry = error.shouldRetry();
      usedFallback = error.shouldUseFallback();
    }
    
    // Record the failure
    recordParseFailure(operationId, error instanceof Error ? error : new Error(String(error)), {
      usedRetry,
      retryCount
    });
    
    // Rethrow the error
    throw error;
  }
} 