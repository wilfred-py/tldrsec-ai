/**
 * SEC API Monitoring Integration
 * 
 * Provides monitoring and health tracking for SEC EDGAR API operations.
 * Wraps the existing SEC client with comprehensive monitoring, rate tracking,
 * and failure analysis for the pipeline health monitoring system.
 */

import { logger } from '../logging';
import { SECEdgarClient } from '../sec-edgar/client';
import { recordSecApiOperation } from './pipeline-health-monitoring-system';
import { 
  SECApiResponse, 
  SECRequestOptions, 
  SECFilingSearchParams,
  SECEdgarError,
  SECErrorCode
} from '../sec-edgar/types';

const secApiLogger = logger.child('sec-api-monitor');

// API operation result types
export interface SecApiOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  responseTime: number;
  endpoint: string;
  cached?: boolean;
}

export interface SecApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: Date;
  rateLimitHits: number;
  timeoutCount: number;
  errorsByType: Record<string, number>;
}

/**
 * Enhanced SEC EDGAR client with comprehensive monitoring
 */
export class MonitoredSECEdgarClient extends SECEdgarClient {
  private metrics: SecApiMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastRequestTime: new Date(),
    rateLimitHits: 0,
    timeoutCount: 0,
    errorsByType: {}
  };

  private responseTimes: number[] = [];
  private readonly maxResponseTimeHistory = 100; // Keep last 100 response times

  constructor(config?: any) {
    super(config);
  }

  /**
   * Get current API metrics
   */
  getMetrics(): SecApiMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: new Date(),
      rateLimitHits: 0,
      timeoutCount: 0,
      errorsByType: {}
    };
    this.responseTimes = [];
  }

  /**
   * Execute monitored API operation
   */
  private async executeMonitoredOperation<T>(
    operation: () => Promise<T>,
    endpoint: string,
    operationName: string = 'sec_api_operation'
  ): Promise<SecApiOperationResult<T>> {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = new Date();

    try {
      secApiLogger.debug('Starting SEC API operation', {
        endpoint,
        operationName,
        totalRequests: this.metrics.totalRequests
      });

      // Execute the operation
      const result = await operation();
      const responseTime = Date.now() - startTime;

      // Record successful operation
      this.recordSuccessfulOperation(responseTime, endpoint);

      // Record in health monitoring system
      recordSecApiOperation(endpoint, true, responseTime, 200);

      secApiLogger.debug('SEC API operation completed successfully', {
        endpoint,
        operationName,
        responseTime,
        totalRequests: this.metrics.totalRequests
      });

      return {
        success: true,
        data: result,
        responseTime,
        endpoint
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Analyze error and record metrics
      const { statusCode, errorType } = this.analyzeError(error);
      this.recordFailedOperation(responseTime, endpoint, errorType);

      // Record in health monitoring system
      recordSecApiOperation(endpoint, false, responseTime, statusCode);

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      secApiLogger.error('SEC API operation failed', error, {
        endpoint,
        operationName,
        responseTime,
        statusCode,
        errorType,
        totalRequests: this.metrics.totalRequests
      });

      return {
        success: false,
        error: errorMessage,
        statusCode,
        responseTime,
        endpoint
      };
    }
  }

  /**
   * Enhanced getRecentFilings with monitoring
   */
  async getRecentFilingsWithMonitoring(options: SECRequestOptions = {}): Promise<SecApiOperationResult<SECApiResponse>> {
    return this.executeMonitoredOperation(
      () => super.getRecentFilings(options),
      '/cgi-bin/browse-edgar',
      'get_recent_filings'
    );
  }

  /**
   * Enhanced getFilingDocument with monitoring
   */
  async getFilingDocumentWithMonitoring(
    url: string, 
    options: { retry?: boolean; maxRetries?: number; handleNotFound?: boolean } = {}
  ): Promise<SecApiOperationResult<string | null>> {
    const endpoint = this.sanitizeUrl(url);
    
    return this.executeMonitoredOperation(
      () => super.getFilingDocument(url, options),
      endpoint,
      'get_filing_document'
    );
  }

  /**
   * Enhanced getCompanyInfo with monitoring
   */
  async getCompanyInfoWithMonitoring(identifier: string): Promise<SecApiOperationResult<any>> {
    return this.executeMonitoredOperation(
      () => super.getCompanyInfo(identifier),
      '/cgi-bin/browse-edgar?company',
      'get_company_info'
    );
  }

  /**
   * Enhanced fetchRssFeed with monitoring
   */
  async fetchRssFeedWithMonitoring(url: string): Promise<SecApiOperationResult<string>> {
    const endpoint = this.sanitizeUrl(url);
    
    return this.executeMonitoredOperation(
      () => super.fetchRssFeed(url),
      endpoint,
      'fetch_rss_feed'
    );
  }

  /**
   * Enhanced getRecentFilingsFromApi with monitoring
   */
  async getRecentFilingsFromApiWithMonitoring(params: SECFilingSearchParams): Promise<SecApiOperationResult<SECApiResponse>> {
    return this.executeMonitoredOperation(
      () => super.getRecentFilingsFromApi(params),
      '/api/xbrl/filings',
      'get_recent_filings_api'
    );
  }

  /**
   * Enhanced getFiling with monitoring
   */
  async getFilingWithMonitoring(url: string): Promise<SecApiOperationResult<string>> {
    const endpoint = this.sanitizeUrl(url);
    
    return this.executeMonitoredOperation(
      () => super.getFiling(url),
      endpoint,
      'get_filing'
    );
  }

  /**
   * Batch operation monitoring for multiple API calls
   */
  async executeBatchOperation<T>(
    operations: Array<() => Promise<T>>,
    endpoints: string[],
    operationName: string = 'batch_operation'
  ): Promise<SecApiOperationResult<T[]>> {
    const startTime = Date.now();
    const results: T[] = [];
    let successCount = 0;
    let failureCount = 0;
    
    secApiLogger.info('Starting batch SEC API operation', {
      operationCount: operations.length,
      operationName
    });

    try {
      // Execute operations with controlled concurrency
      const batchResults = await Promise.allSettled(
        operations.map(async (operation, index) => {
          const result = await this.executeMonitoredOperation(
            operation,
            endpoints[index] || `batch_${index}`,
            `${operationName}_${index}`
          );
          
          if (result.success) {
            successCount++;
            return result.data;
          } else {
            failureCount++;
            throw new Error(result.error || 'Operation failed');
          }
        })
      );

      // Collect successful results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }

      const responseTime = Date.now() - startTime;
      const overallSuccess = successCount > 0 && failureCount === 0;

      secApiLogger.info('Batch SEC API operation completed', {
        operationName,
        totalOperations: operations.length,
        successCount,
        failureCount,
        responseTime,
        overallSuccess
      });

      return {
        success: overallSuccess,
        data: results,
        responseTime,
        endpoint: 'batch_operation'
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      secApiLogger.error('Batch SEC API operation failed', error, {
        operationName,
        totalOperations: operations.length,
        successCount,
        failureCount,
        responseTime
      });

      return {
        success: false,
        error: errorMessage,
        responseTime,
        endpoint: 'batch_operation'
      };
    }
  }

  /**
   * Get API health status based on recent performance
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    successRate: number;
    averageResponseTime: number;
    recentErrors: string[];
    recommendations: string[];
  } {
    const { successfulRequests, failedRequests, averageResponseTime, errorsByType } = this.metrics;
    const totalRequests = successfulRequests + failedRequests;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];
    
    // Determine health status
    if (successRate < 75 || averageResponseTime > 10000) {
      status = 'unhealthy';
      recommendations.push('Immediate investigation required');
    } else if (successRate < 90 || averageResponseTime > 5000) {
      status = 'degraded';
      recommendations.push('Monitor API performance closely');
    }

    // Add specific recommendations
    if (this.metrics.rateLimitHits > 0) {
      recommendations.push('Reduce API request rate to avoid rate limiting');
    }
    
    if (this.metrics.timeoutCount > 0) {
      recommendations.push('Investigate network connectivity or increase timeouts');
    }

    if (Object.keys(errorsByType).length > 0) {
      recommendations.push('Review error patterns and implement error handling');
    }

    return {
      status,
      successRate,
      averageResponseTime,
      recentErrors: Object.keys(errorsByType),
      recommendations
    };
  }

  /**
   * Record successful operation metrics
   */
  private recordSuccessfulOperation(responseTime: number, endpoint: string): void {
    this.metrics.successfulRequests++;
    this.updateResponseTimeMetrics(responseTime);

    secApiLogger.debug('SEC API operation successful', {
      endpoint,
      responseTime,
      successRate: (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
    });
  }

  /**
   * Record failed operation metrics
   */
  private recordFailedOperation(responseTime: number, endpoint: string, errorType: string): void {
    this.metrics.failedRequests++;
    this.updateResponseTimeMetrics(responseTime);
    
    // Track error types
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

    secApiLogger.warn('SEC API operation failed', {
      endpoint,
      responseTime,
      errorType,
      failureRate: (this.metrics.failedRequests / this.metrics.totalRequests) * 100
    });
  }

  /**
   * Update response time metrics
   */
  private updateResponseTimeMetrics(responseTime: number): void {
    this.responseTimes.push(responseTime);
    
    // Keep only recent response times
    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes = this.responseTimes.slice(-this.maxResponseTimeHistory);
    }
    
    // Calculate new average
    this.metrics.averageResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Analyze error and extract relevant information
   */
  private analyzeError(error: any): { statusCode?: number; errorType: string } {
    if (error instanceof SECEdgarError) {
      switch (error.code) {
        case SECErrorCode.RATE_LIMIT_EXCEEDED:
          this.metrics.rateLimitHits++;
          return { statusCode: 429, errorType: 'rate_limit' };
        case SECErrorCode.TIMEOUT:
          this.metrics.timeoutCount++;
          return { statusCode: 408, errorType: 'timeout' };
        case SECErrorCode.NETWORK_ERROR:
          return { statusCode: undefined, errorType: 'network_error' };
        case SECErrorCode.DOCUMENT_FETCH_ERROR:
          return { statusCode: error.statusCode, errorType: 'document_fetch_error' };
        default:
          return { statusCode: error.statusCode, errorType: 'unknown_sec_error' };
      }
    }
    
    // Handle other error types
    if (error?.response?.status) {
      return { statusCode: error.response.status, errorType: `http_${error.response.status}` };
    }
    
    if (error?.code === 'ECONNABORTED') {
      this.metrics.timeoutCount++;
      return { statusCode: 408, errorType: 'connection_timeout' };
    }
    
    if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      return { statusCode: undefined, errorType: 'network_error' };
    }
    
    return { statusCode: undefined, errorType: 'unknown_error' };
  }

  /**
   * Sanitize URL for logging (remove sensitive parameters)
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove query parameters that might contain sensitive data
      urlObj.search = '';
      return urlObj.pathname;
    } catch {
      // If URL parsing fails, return a generic endpoint name
      return url.split('?')[0].replace(/\/\d+/g, '/:id');
    }
  }
}

/**
 * Global monitored SEC client instance
 */
export const monitoredSecClient = new MonitoredSECEdgarClient();

/**
 * Utility functions for SEC API monitoring
 */
export class SecApiMonitor {
  /**
   * Create a monitoring wrapper for any SEC API function
   */
  static createWrapper<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    endpoint: string,
    operationName?: string
  ): T {
    return (async (...args: any[]) => {
      const startTime = Date.now();
      
      try {
        const result = await fn(...args);
        const responseTime = Date.now() - startTime;
        
        // Record successful operation
        recordSecApiOperation(endpoint, true, responseTime, 200);
        
        secApiLogger.debug('Wrapped SEC API operation successful', {
          operationName: operationName || fn.name,
          endpoint,
          responseTime
        });
        
        return result;
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const statusCode = error?.response?.status || 500;
        
        // Record failed operation
        recordSecApiOperation(endpoint, false, responseTime, statusCode);
        
        secApiLogger.error('Wrapped SEC API operation failed', error, {
          operationName: operationName || fn.name,
          endpoint,
          responseTime,
          statusCode
        });
        
        throw error;
      }
    }) as T;
  }

  /**
   * Monitor multiple concurrent SEC API operations
   */
  static async monitorConcurrentOperations<T>(
    operations: Array<() => Promise<T>>,
    endpoints: string[],
    options: {
      maxConcurrency?: number;
      timeout?: number;
      operationName?: string;
    } = {}
  ): Promise<Array<{ success: boolean; result?: T; error?: string; endpoint: string }>> {
    const { maxConcurrency = 5, timeout = 30000, operationName = 'concurrent_operations' } = options;
    
    secApiLogger.info('Starting concurrent SEC API operations', {
      operationCount: operations.length,
      maxConcurrency,
      timeout,
      operationName
    });

    const results: Array<{ success: boolean; result?: T; error?: string; endpoint: string }> = [];
    
    // Process operations in batches to respect concurrency limits
    for (let i = 0; i < operations.length; i += maxConcurrency) {
      const batch = operations.slice(i, i + maxConcurrency);
      const batchEndpoints = endpoints.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (operation, index) => {
        const endpoint = batchEndpoints[index] || `batch_${i + index}`;
        const startTime = Date.now();
        
        try {
          // Add timeout to operation
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Operation timeout')), timeout);
          });
          
          const result = await Promise.race([operation(), timeoutPromise]);
          const responseTime = Date.now() - startTime;
          
          recordSecApiOperation(endpoint, true, responseTime, 200);
          
          return { success: true, result, endpoint };
          
        } catch (error) {
          const responseTime = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          recordSecApiOperation(endpoint, false, responseTime, 500);
          
          return { success: false, error: errorMessage, endpoint };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    secApiLogger.info('Concurrent SEC API operations completed', {
      operationName,
      totalOperations: operations.length,
      successCount,
      failureCount,
      successRate: (successCount / results.length) * 100
    });

    return results;
  }
}

// Export convenience functions
export { recordSecApiOperation };

// Export the default monitored client
export default monitoredSecClient;