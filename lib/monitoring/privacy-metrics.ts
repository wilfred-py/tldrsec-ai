/**
 * Privacy and consent monitoring metrics
 * Tracks privacy compliance and consent patterns
 */

import { logger } from '@/lib/logging';

export interface PrivacyMetrics {
  consentChecks: number;
  consentGiven: number;
  consentDenied: number;
  cacheHits: number;
  validationErrors: number;
  authorizationFailures: number;
}

class PrivacyMonitor {
  private metrics: PrivacyMetrics = {
    consentChecks: 0,
    consentGiven: 0,
    consentDenied: 0,
    cacheHits: 0,
    validationErrors: 0,
    authorizationFailures: 0
  };

  /**
   * Record a consent check operation
   */
  recordConsentCheck(hasConsent: boolean, fromCache: boolean = false): void {
    this.metrics.consentChecks++;
    
    if (fromCache) {
      this.metrics.cacheHits++;
    }
    
    if (hasConsent) {
      this.metrics.consentGiven++;
    } else {
      this.metrics.consentDenied++;
    }
  }

  /**
   * Record a validation error
   */
  recordValidationError(errorType: string): void {
    this.metrics.validationErrors++;
    logger.warn('Privacy validation error recorded', { errorType });
  }

  /**
   * Record an authorization failure
   */
  recordAuthorizationFailure(reason: string): void {
    this.metrics.authorizationFailures++;
    logger.warn('Authorization failure recorded', { reason });
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): PrivacyMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for periodic reporting)
   */
  resetMetrics(): PrivacyMetrics {
    const snapshot = this.getMetrics();
    this.metrics = {
      consentChecks: 0,
      consentGiven: 0,
      consentDenied: 0,
      cacheHits: 0,
      validationErrors: 0,
      authorizationFailures: 0
    };
    return snapshot;
  }

  /**
   * Log periodic privacy metrics report
   */
  logPeriodicReport(): void {
    const metrics = this.getMetrics();
    const consentRate = metrics.consentChecks > 0 
      ? (metrics.consentGiven / metrics.consentChecks * 100).toFixed(1)
      : '0';
    
    logger.info('Privacy metrics report', {
      ...metrics,
      consentRate: `${consentRate}%`,
      cacheHitRate: metrics.consentChecks > 0 
        ? `${(metrics.cacheHits / metrics.consentChecks * 100).toFixed(1)}%`
        : '0%'
    });
  }
}

export const privacyMonitor = new PrivacyMonitor();