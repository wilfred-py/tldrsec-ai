import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

export interface NewsletterErrorEvent {
  type: 'ai_personalization' | 'component_crash' | 'network_failure' | 'timeout' | 'parsing_error' | 'validation_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  errorName?: string;
  componentName?: string;
  userContext?: {
    userAgent?: string;
    url?: string;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
  technical?: {
    stack?: string;
    retryCount?: number;
    timeoutDuration?: number;
    requestDuration?: number;
    circuitBreakerOpen?: boolean;
  };
  impact?: {
    userExperienceRating: 1 | 2 | 3 | 4 | 5; // 1 = no impact, 5 = severe impact
    personalizationDisabled?: boolean;
    fallbackContentUsed?: boolean;
  };
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  averageRecoveryTime: number;
  circuitBreakerActivations: number;
  fallbackUsageRate: number;
  userImpactScore: number;
}

export class NewsletterErrorTracker {
  private static instance: NewsletterErrorTracker;
  private errorBuffer: NewsletterErrorEvent[] = [];
  private readonly maxBufferSize = 100;
  private readonly flushIntervalMs = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startPeriodicFlush();
  }

  static getInstance(): NewsletterErrorTracker {
    if (!NewsletterErrorTracker.instance) {
      NewsletterErrorTracker.instance = new NewsletterErrorTracker();
    }
    return NewsletterErrorTracker.instance;
  }

  /**
   * Track a newsletter-related error event
   */
  async trackError(event: NewsletterErrorEvent): Promise<void> {
    try {
      // Add timestamp to the event
      const timestampedEvent = {
        ...event,
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
      };

      // Add to buffer for batching
      this.errorBuffer.push(timestampedEvent);

      // Log critical errors immediately
      if (event.severity === 'critical') {
        await this.flushImmediately();
        console.error('Critical newsletter error:', timestampedEvent);
      }

      // Flush buffer if it's getting full
      if (this.errorBuffer.length >= this.maxBufferSize) {
        await this.flushBuffer();
      }
    } catch (error) {
      console.error('Failed to track newsletter error:', error);
    }
  }

  /**
   * Track AI personalization failure
   */
  async trackAIPersonalizationFailure(error: Error, context: {
    retryCount: number;
    circuitBreakerOpen: boolean;
    userContext?: any;
  }): Promise<void> {
    const isTimeout = error.name === 'TimeoutError';
    const isNetworkError = error.message.includes('fetch') || error.message.includes('network');
    
    let errorType: NewsletterErrorEvent['type'] = 'ai_personalization';
    if (isTimeout) errorType = 'timeout';
    else if (isNetworkError) errorType = 'network_failure';
    else if (error.message.includes('parse') || error.message.includes('JSON')) {
      errorType = 'parsing_error';
    } else if (error.message.includes('validation') || error.message.includes('Invalid')) {
      errorType = 'validation_error';
    }

    const severity: NewsletterErrorEvent['severity'] = 
      context.circuitBreakerOpen ? 'high' : 
      context.retryCount >= 2 ? 'medium' : 'low';

    await this.trackError({
      type: errorType,
      severity,
      message: error.message,
      errorName: error.name,
      componentName: 'PersonalizedHero',
      userContext: context.userContext ? {
        userAgent: context.userContext.userAgent,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        referrer: context.userContext.referrer,
        utm_source: context.userContext.utm_source,
        utm_medium: context.userContext.utm_medium,
        utm_campaign: context.userContext.utm_campaign,
      } : undefined,
      technical: {
        stack: error.stack?.slice(0, 500),
        retryCount: context.retryCount,
        circuitBreakerOpen: context.circuitBreakerOpen,
        timeoutDuration: isTimeout ? 15000 : undefined,
      },
      impact: {
        userExperienceRating: context.circuitBreakerOpen ? 4 : 2,
        personalizationDisabled: context.circuitBreakerOpen,
        fallbackContentUsed: true,
      }
    });
  }

  /**
   * Track component crash from error boundary
   */
  async trackComponentCrash(error: Error, errorInfo: any, componentName: string): Promise<void> {
    await this.trackError({
      type: 'component_crash',
      severity: 'high',
      message: error.message,
      errorName: error.name,
      componentName,
      userContext: {
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      },
      technical: {
        stack: error.stack,
        // Include component stack for React errors
        ...(errorInfo && { componentStack: errorInfo.componentStack?.slice(0, 500) })
      },
      impact: {
        userExperienceRating: 4, // High impact as entire component failed
        personalizationDisabled: true,
        fallbackContentUsed: true,
      }
    });
  }

  /**
   * Track recovery success
   */
  async trackRecoverySuccess(recoveryTimeMs: number, retryCount: number): Promise<void> {
    // Track recovery as a positive event
    try {
      await trackPageAnalytics('newsletter', 'error_recovery_success', {
        recovery_time_ms: recoveryTimeMs,
        retry_count: retryCount,
      });
    } catch (error) {
      console.error('Failed to track recovery success:', error);
    }
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    const now = Date.now();
    const last24Hours = this.errorBuffer.filter(
      event => now - new Date(event.timestamp as string).getTime() < 24 * 60 * 60 * 1000
    );

    const errorsByType = last24Hours.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorsBySeverity = last24Hours.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const circuitBreakerActivations = last24Hours.filter(
      event => event.technical?.circuitBreakerOpen
    ).length;

    const fallbackUsageRate = last24Hours.filter(
      event => event.impact?.fallbackContentUsed
    ).length / Math.max(last24Hours.length, 1);

    const userImpactScore = last24Hours.reduce(
      (sum, event) => sum + (event.impact?.userExperienceRating || 1), 0
    ) / Math.max(last24Hours.length, 1);

    return {
      totalErrors: last24Hours.length,
      errorsByType,
      errorsBySeverity,
      averageRecoveryTime: 0, // TODO: Calculate from recovery events
      circuitBreakerActivations,
      fallbackUsageRate,
      userImpactScore,
    };
  }

  /**
   * Check if error rate is within acceptable thresholds
   */
  isHealthy(): boolean {
    const metrics = this.getMetrics();
    const criticalErrors = metrics.errorsBySeverity.critical || 0;
    const highErrors = metrics.errorsBySeverity.high || 0;
    
    // Healthy if: no critical errors and fewer than 5 high-severity errors in 24h
    return criticalErrors === 0 && highErrors < 5;
  }

  private async flushBuffer(): Promise<void> {
    if (this.errorBuffer.length === 0) return;

    try {
      const eventsToFlush = [...this.errorBuffer];
      this.errorBuffer = [];

      // Send to analytics in batches
      for (const event of eventsToFlush) {
        await trackPageAnalytics('newsletter', 'error_tracked', {
          error_type: event.type,
          severity: event.severity,
          error_name: event.errorName,
          component_name: event.componentName,
          user_experience_rating: event.impact?.userExperienceRating,
          retry_count: event.technical?.retryCount,
          circuit_breaker_open: event.technical?.circuitBreakerOpen,
          fallback_content_used: event.impact?.fallbackContentUsed,
        });
      }
    } catch (error) {
      console.error('Failed to flush error buffer:', error);
    }
  }

  private async flushImmediately(): Promise<void> {
    await this.flushBuffer();
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch(console.error);
    }, this.flushIntervalMs);
  }

  private getSessionId(): string {
    // Simple session ID generation
    if (typeof window !== 'undefined') {
      let sessionId = sessionStorage.getItem('newsletter_session_id');
      if (!sessionId) {
        sessionId = Math.random().toString(36).substring(7) + Date.now().toString(36);
        sessionStorage.setItem('newsletter_session_id', sessionId);
      }
      return sessionId;
    }
    return 'server-' + Math.random().toString(36).substring(7);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBuffer().catch(console.error);
  }
}

// Export singleton instance
export const newsletterErrorTracker = NewsletterErrorTracker.getInstance();