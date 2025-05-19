/**
 * Parser Metrics Collection and Analysis
 * 
 * Utilities for tracking, storing, and analyzing parser performance metrics
 * across multiple requests.
 */

import { ParserMetrics } from './types';
import { SECFilingType } from '../prompts/prompt-types';

class ParserMetricsCollector {
  private metrics: ParserMetrics[] = [];
  private maxStoredMetrics: number = 1000;
  
  /**
   * Record a new metric entry
   * 
   * @param metric - Metric to record
   */
  recordMetric(metric: ParserMetrics): void {
    this.metrics.push(metric);
    
    // Trim the metrics array if it gets too large
    if (this.metrics.length > this.maxStoredMetrics) {
      this.metrics = this.metrics.slice(-this.maxStoredMetrics);
    }
  }
  
  /**
   * Get all recorded metrics
   * 
   * @returns Array of recorded metrics
   */
  getAllMetrics(): ParserMetrics[] {
    return [...this.metrics];
  }
  
  /**
   * Get success rate for a specific filing type or all filings
   * 
   * @param filingType - Optional filing type to filter by
   * @returns Success rate as a percentage
   */
  getSuccessRate(filingType?: SECFilingType): number {
    const filtered = filingType 
      ? this.metrics.filter(m => m.documentType === filingType)
      : this.metrics;
      
    if (filtered.length === 0) {
      return 0;
    }
    
    const successfulExtractions = filtered.filter(m => m.extractionSuccess).length;
    const successfulValidations = filtered.filter(m => m.validationSuccess).length;
    
    // Success means both extraction and validation worked
    const overallSuccess = filtered.filter(m => m.extractionSuccess && m.validationSuccess).length;
    
    return (overallSuccess / filtered.length) * 100;
  }
  
  /**
   * Get average extraction time
   * 
   * @param filingType - Optional filing type to filter by
   * @returns Average extraction time in milliseconds
   */
  getAverageExtractionTime(filingType?: SECFilingType): number {
    const filtered = filingType 
      ? this.metrics.filter(m => m.documentType === filingType)
      : this.metrics;
      
    if (filtered.length === 0) {
      return 0;
    }
    
    const totalTime = filtered.reduce((sum, m) => sum + m.extractionTimeMs, 0);
    return totalTime / filtered.length;
  }
  
  /**
   * Get average validation time
   * 
   * @param filingType - Optional filing type to filter by
   * @returns Average validation time in milliseconds
   */
  getAverageValidationTime(filingType?: SECFilingType): number {
    const filtered = filingType 
      ? this.metrics.filter(m => m.documentType === filingType && m.extractionSuccess)
      : this.metrics.filter(m => m.extractionSuccess);
      
    if (filtered.length === 0) {
      return 0;
    }
    
    const totalTime = filtered.reduce((sum, m) => sum + m.validationTimeMs, 0);
    return totalTime / filtered.length;
  }
  
  /**
   * Get statistics about extraction methods used
   * 
   * @param filingType - Optional filing type to filter by
   * @returns Object with counts and percentages of each extraction method
   */
  getExtractionMethodStats(filingType?: SECFilingType): Record<string, { count: number, percentage: number }> {
    const filtered = filingType 
      ? this.metrics.filter(m => m.documentType === filingType)
      : this.metrics;
      
    if (filtered.length === 0) {
      return {};
    }
    
    // Count occurrences of each extraction method
    const methodCounts: Record<string, number> = {};
    
    for (const metric of filtered) {
      const method = metric.extractionMethod;
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    }
    
    // Calculate percentages
    const result: Record<string, { count: number, percentage: number }> = {};
    
    for (const [method, count] of Object.entries(methodCounts)) {
      result[method] = {
        count,
        percentage: (count / filtered.length) * 100
      };
    }
    
    return result;
  }
  
  /**
   * Get error statistics
   * 
   * @param filingType - Optional filing type to filter by
   * @returns Object with counts and percentages of each error type
   */
  getErrorStats(filingType?: SECFilingType): Record<string, { count: number, percentage: number }> {
    const filtered = filingType 
      ? this.metrics.filter(m => m.documentType === filingType && (m.errorType || !m.extractionSuccess || !m.validationSuccess))
      : this.metrics.filter(m => m.errorType || !m.extractionSuccess || !m.validationSuccess);
      
    if (filtered.length === 0) {
      return {};
    }
    
    // Count occurrences of each error type
    const errorCounts: Record<string, number> = {};
    
    for (const metric of filtered) {
      let errorType = metric.errorType || 'Unknown';
      
      if (!metric.extractionSuccess) {
        errorType = `ExtractionFailed:${metric.extractionMethod}`;
      } else if (!metric.validationSuccess) {
        errorType = 'ValidationFailed';
      }
      
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    }
    
    // Calculate percentages
    const result: Record<string, { count: number, percentage: number }> = {};
    
    for (const [errorType, count] of Object.entries(errorCounts)) {
      result[errorType] = {
        count,
        percentage: (count / filtered.length) * 100
      };
    }
    
    return result;
  }
  
  /**
   * Clear all stored metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
  
  /**
   * Get a summary of parser performance
   * 
   * @param filingType - Optional filing type to filter by
   * @returns Summary object with key statistics
   */
  getSummary(filingType?: SECFilingType): Record<string, any> {
    return {
      totalRequests: filingType 
        ? this.metrics.filter(m => m.documentType === filingType).length
        : this.metrics.length,
      successRate: this.getSuccessRate(filingType),
      averageExtractionTimeMs: this.getAverageExtractionTime(filingType),
      averageValidationTimeMs: this.getAverageValidationTime(filingType),
      extractionMethods: this.getExtractionMethodStats(filingType),
      errors: this.getErrorStats(filingType),
      byFilingType: filingType 
        ? undefined 
        : this.getFilingTypeBreakdown()
    };
  }
  
  /**
   * Get a breakdown of metrics by filing type
   * 
   * @returns Object with metrics for each filing type
   */
  private getFilingTypeBreakdown(): Record<string, any> {
    const result: Record<string, any> = {};
    
    // Get unique filing types in the metrics
    const filingTypes = new Set<string>();
    this.metrics.forEach(m => {
      if (m.documentType) {
        filingTypes.add(m.documentType);
      }
    });
    
    // Get summary for each filing type
    for (const filingType of filingTypes) {
      result[filingType] = {
        count: this.metrics.filter(m => m.documentType === filingType).length,
        successRate: this.getSuccessRate(filingType as SECFilingType),
        averageExtractionTimeMs: this.getAverageExtractionTime(filingType as SECFilingType)
      };
    }
    
    return result;
  }
}

// Export singleton instance
export const parserMetrics = new ParserMetricsCollector(); 