/**
 * Pattern Detector
 * Part of Phase 3: Prevention & Governance Framework
 * 
 * Advanced pattern recognition algorithms for detecting the recurrence
 * of critical issue patterns using statistical analysis and machine learning
 * techniques.
 */

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface PatternAnalysis {
  pattern: string;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  anomalies: AnomalyPoint[];
  predictions: PredictionPoint[];
}

export interface AnomalyPoint {
  timestamp: number;
  value: number;
  expectedValue: number;
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

export interface PredictionPoint {
  timestamp: number;
  predictedValue: number;
  confidence: number;
  bounds: {
    upper: number;
    lower: number;
  };
}

export class PatternDetector {
  private readonly windowSize: number;
  private readonly anomalyThreshold: number;
  private readonly trendSensitivity: number;

  constructor(options: {
    windowSize?: number;
    anomalyThreshold?: number;
    trendSensitivity?: number;
  } = {}) {
    this.windowSize = options.windowSize || 50;
    this.anomalyThreshold = options.anomalyThreshold || 2.0;
    this.trendSensitivity = options.trendSensitivity || 0.1;
  }

  analyzePattern(data: MetricDataPoint[], patternName: string): PatternAnalysis {
    if (data.length < 3) {
      return {
        pattern: patternName,
        confidence: 0,
        trend: 'stable',
        anomalies: [],
        predictions: []
      };
    }

    const values = data.map(point => point.value);
    const timestamps = data.map(point => point.timestamp);

    const trend = this.detectTrend(values);
    const anomalies = this.detectAnomalies(data);
    const predictions = this.generatePredictions(data, 5); // Predict next 5 points
    const confidence = this.calculateConfidence(values, anomalies);

    return {
      pattern: patternName,
      confidence,
      trend,
      anomalies,
      predictions
    };
  }

  private detectTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    if (values.length < 3) return 'stable';

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    // Calculate linear regression slope
    const slope = this.calculateSlope(x, values);
    const volatility = this.calculateVolatility(values);

    // High volatility indicates unstable pattern
    if (volatility > this.trendSensitivity * 3) {
      return 'volatile';
    }

    // Determine trend based on slope
    if (Math.abs(slope) < this.trendSensitivity) {
      return 'stable';
    } else if (slope > 0) {
      return 'increasing';
    } else {
      return 'decreasing';
    }
  }

  private calculateSlope(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private detectAnomalies(data: MetricDataPoint[]): AnomalyPoint[] {
    const anomalies: AnomalyPoint[] = [];
    const values = data.map(point => point.value);

    if (values.length < 5) return anomalies;

    // Use rolling window for anomaly detection
    const windowSize = Math.min(this.windowSize, Math.floor(values.length / 2));

    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const currentValue = values[i];
      const currentTimestamp = data[i].timestamp;

      const { mean, stdDev } = this.calculateStats(window);
      const zScore = Math.abs((currentValue - mean) / stdDev);

      if (zScore > this.anomalyThreshold) {
        const severity = this.classifyAnomalySeverity(zScore);
        const reason = this.getAnomalyReason(currentValue, mean, stdDev, zScore);

        anomalies.push({
          timestamp: currentTimestamp,
          value: currentValue,
          expectedValue: mean,
          severity,
          reason
        });
      }
    }

    return anomalies;
  }

  private calculateStats(values: number[]): { mean: number; stdDev: number } {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  private classifyAnomalySeverity(zScore: number): 'low' | 'medium' | 'high' {
    if (zScore > 3.0) return 'high';
    if (zScore > 2.5) return 'medium';
    return 'low';
  }

  private getAnomalyReason(value: number, mean: number, stdDev: number, zScore: number): string {
    const direction = value > mean ? 'above' : 'below';
    const magnitude = Math.abs(value - mean);
    
    if (zScore > 3.0) {
      return `Extreme outlier: ${magnitude.toFixed(2)} units ${direction} expected range (${zScore.toFixed(1)} standard deviations)`;
    } else if (zScore > 2.5) {
      return `Significant deviation: ${magnitude.toFixed(2)} units ${direction} normal range`;
    } else {
      return `Minor anomaly: ${magnitude.toFixed(2)} units ${direction} typical values`;
    }
  }

  private generatePredictions(data: MetricDataPoint[], count: number): PredictionPoint[] {
    if (data.length < 3) return [];

    const predictions: PredictionPoint[] = [];
    const values = data.map(point => point.value);
    const timestamps = data.map(point => point.timestamp);
    
    // Use simple linear regression for predictions
    const x = Array.from({ length: values.length }, (_, i) => i);
    const slope = this.calculateSlope(x, values);
    const intercept = this.calculateIntercept(x, values, slope);
    
    // Calculate prediction confidence based on R-squared
    const rSquared = this.calculateRSquared(x, values, slope, intercept);
    const baseConfidence = Math.max(0.1, rSquared);
    
    // Generate predictions
    const lastTimestamp = timestamps[timestamps.length - 1];
    const timestampInterval = timestamps.length > 1 ? timestamps[1] - timestamps[0] : 60000; // Default 1 minute

    for (let i = 1; i <= count; i++) {
      const futureX = values.length + i - 1;
      const predictedValue = slope * futureX + intercept;
      const confidence = baseConfidence * Math.max(0.1, 1 - (i * 0.15)); // Decrease confidence over time
      
      // Calculate prediction bounds
      const { stdDev } = this.calculateStats(values);
      const boundWidth = stdDev * (2 - confidence); // Wider bounds for lower confidence
      
      predictions.push({
        timestamp: lastTimestamp + (i * timestampInterval),
        predictedValue,
        confidence,
        bounds: {
          upper: predictedValue + boundWidth,
          lower: Math.max(0, predictedValue - boundWidth)
        }
      });
    }

    return predictions;
  }

  private calculateIntercept(x: number[], y: number[], slope: number): number {
    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    return meanY - slope * meanX;
  }

  private calculateRSquared(x: number[], y: number[], slope: number, intercept: number): number {
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    
    let totalSumSquares = 0;
    let residualSumSquares = 0;

    for (let i = 0; i < y.length; i++) {
      const predicted = slope * x[i] + intercept;
      totalSumSquares += Math.pow(y[i] - meanY, 2);
      residualSumSquares += Math.pow(y[i] - predicted, 2);
    }

    return totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;
  }

  private calculateConfidence(values: number[], anomalies: AnomalyPoint[]): number {
    // Base confidence on data quality and anomaly frequency
    const dataQuality = Math.min(1.0, values.length / this.windowSize);
    const anomalyRate = anomalies.length / values.length;
    const anomalyPenalty = Math.min(0.5, anomalyRate * 2); // Max 50% penalty

    return Math.max(0.1, dataQuality - anomalyPenalty);
  }

  // Pattern-specific detection methods

  detectMemoryLeakPattern(memoryData: MetricDataPoint[]): boolean {
    if (memoryData.length < 10) return false;

    const analysis = this.analyzePattern(memoryData, 'memory_usage');
    
    // Memory leak indicators:
    // 1. Consistently increasing trend
    // 2. Few anomalies (consistent growth)
    // 3. High confidence in pattern
    return (
      analysis.trend === 'increasing' &&
      analysis.confidence > 0.7 &&
      analysis.anomalies.length < memoryData.length * 0.1 // Less than 10% anomalies
    );
  }

  detectPerformanceDegradation(performanceData: MetricDataPoint[]): boolean {
    if (performanceData.length < 5) return false;

    const analysis = this.analyzePattern(performanceData, 'performance_metrics');
    
    // Performance degradation indicators:
    // 1. Increasing response times or decreasing throughput
    // 2. Recent anomalies showing performance spikes
    // 3. Volatile or increasing trend
    return (
      (analysis.trend === 'increasing' || analysis.trend === 'volatile') &&
      analysis.anomalies.some(anomaly => 
        anomaly.severity === 'high' && 
        Date.now() - anomaly.timestamp < 3600000 // Within last hour
      )
    );
  }

  detectAuthenticationInconsistency(authData: MetricDataPoint[]): boolean {
    if (authData.length < 3) return false;

    const analysis = this.analyzePattern(authData, 'authentication_metrics');
    
    // Authentication inconsistency indicators:
    // 1. Any high-severity anomalies (auth should be consistent)
    // 2. Volatile pattern (inconsistent behavior)
    // 3. Increasing failure rate
    return (
      analysis.anomalies.some(anomaly => anomaly.severity === 'high') ||
      analysis.trend === 'volatile' ||
      (analysis.trend === 'increasing' && authData[authData.length - 1].value > 0)
    );
  }

  detectBottleneckPattern(throughputData: MetricDataPoint[]): boolean {
    if (throughputData.length < 5) return false;

    const analysis = this.analyzePattern(throughputData, 'throughput_metrics');
    
    // Bottleneck indicators:
    // 1. Decreasing throughput trend
    // 2. Recent performance anomalies
    // 3. High confidence in degradation pattern
    return (
      analysis.trend === 'decreasing' &&
      analysis.confidence > 0.6 &&
      analysis.anomalies.some(anomaly => 
        anomaly.severity !== 'low' && 
        Date.now() - anomaly.timestamp < 1800000 // Within last 30 minutes
      )
    );
  }

  // Utility methods for external consumption

  isPatternStable(data: MetricDataPoint[]): boolean {
    if (data.length < 3) return true;

    const analysis = this.analyzePattern(data, 'stability_check');
    return analysis.trend === 'stable' && analysis.anomalies.length === 0;
  }

  getPatternHealth(data: MetricDataPoint[]): 'healthy' | 'warning' | 'critical' {
    if (data.length < 3) return 'healthy';

    const analysis = this.analyzePattern(data, 'health_check');
    
    const hasHighSeverityAnomalies = analysis.anomalies.some(a => a.severity === 'high');
    const hasManyAnomalies = analysis.anomalies.length > data.length * 0.2; // More than 20%
    const isVolatile = analysis.trend === 'volatile';
    
    if (hasHighSeverityAnomalies || (hasManyAnomalies && isVolatile)) {
      return 'critical';
    } else if (hasManyAnomalies || isVolatile || analysis.anomalies.some(a => a.severity === 'medium')) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }
}