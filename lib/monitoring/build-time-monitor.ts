/**
 * Build-time monitoring and validation utilities
 * Ensures proper handling of build vs runtime environments
 */

import { generateSecureHexString } from '../security/secure-random';

export interface BuildTimeContext {
  isBuildTime: boolean;
  environment: string;
  missingVars?: string[];
  placeholderKeys?: string[];
}

export class BuildTimeMonitor {
  private static instance: BuildTimeMonitor;
  
  private constructor() {}
  
  static getInstance(): BuildTimeMonitor {
    if (!BuildTimeMonitor.instance) {
      BuildTimeMonitor.instance = new BuildTimeMonitor();
    }
    return BuildTimeMonitor.instance;
  }

  /**
   * Detect if we're in a build environment
   */
  isBuildTime(): boolean {
    const buildIndicators = [
      process.env.NODE_ENV === 'production' && !process.env.VERCEL,
      process.env.CF_PAGES === '1' && !process.env.ANTHROPIC_API_KEY,
      process.env.GITHUB_ACTIONS === 'true',
      process.env.CI === 'true' && !process.env.ANTHROPIC_API_KEY,
      process.env.BUILD_PHASE === 'true'
    ];
    
    return buildIndicators.some(indicator => indicator);
  }

  /**
   * Validate build environment and log detection
   */
  validateBuildEnvironment(): BuildTimeContext {
    const context: BuildTimeContext = {
      isBuildTime: this.isBuildTime(),
      environment: this.detectEnvironment(),
      missingVars: [],
      placeholderKeys: []
    };

    if (context.isBuildTime) {
      this.logBuildTimeDetection(context);
    } else {
      context.missingVars = this.findMissingProductionSecrets();
      if (context.missingVars.length > 0) {
        this.logMissingSecrets(context.missingVars);
      }
    }

    return context;
  }

  /**
   * Detect current deployment environment
   */
  private detectEnvironment(): string {
    if (process.env.VERCEL) return 'vercel';
    if (process.env.CF_PAGES) return 'cloudflare-pages';
    if (process.env.RAILWAY_ENVIRONMENT) return 'railway';
    if (process.env.GITHUB_ACTIONS) return 'github-actions';
    if (process.env.CI) return 'ci';
    return 'local';
  }

  /**
   * Find missing production secrets
   */
  private findMissingProductionSecrets(): string[] {
    const requiredSecrets = ['CRON_SECRET', 'ANTHROPIC_API_KEY', 'RESEND_API_KEY'];
    return requiredSecrets.filter(key => {
      const value = process.env[key];
      return !value || this.isPlaceholderValue(value);
    });
  }

  /**
   * Check if a value is a placeholder
   */
  private isPlaceholderValue(value: string): boolean {
    const placeholderPatterns = [
      /build-time-placeholder/,
      /test-api-key/,
      /development-key/,
      /^placeholder/,
      /^build_/
    ];
    
    return placeholderPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Log build-time detection
   */
  private logBuildTimeDetection(context: BuildTimeContext): void {
    console.log('[BUILD-TIME-MONITOR] Build environment detected:', {
      environment: context.environment,
      nodeEnv: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL,
      githubActions: !!process.env.GITHUB_ACTIONS,
      buildPhase: !!process.env.BUILD_PHASE,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log missing secrets in production
   */
  private logMissingSecrets(missingSecrets: string[]): void {
    if (process.env.NODE_ENV === 'production') {
      console.error('[BUILD-TIME-MONITOR] CRITICAL: Missing production secrets:', {
        missingSecrets,
        environment: this.detectEnvironment(),
        timestamp: new Date().toISOString()
      });
    } else {
      console.warn('[BUILD-TIME-MONITOR] Missing secrets in development:', {
        missingSecrets,
        environment: this.detectEnvironment()
      });
    }
  }

  /**
   * Generate secure placeholder for API keys
   */
  generateSecurePlaceholder(type: 'api' | 'db' | 'secret'): string {
    const timestamp = Date.now();
    const entropy = generateSecureHexString(6).substring(0, 9);
    return `build_${type}_${timestamp}_${entropy}`;
  }

  /**
   * Validate production deployment readiness
   */
  validateProductionReadiness(): { ready: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (this.isBuildTime()) {
      issues.push('Detected build-time environment in production');
    }
    
    const missingSecrets = this.findMissingProductionSecrets();
    if (missingSecrets.length > 0) {
      issues.push(`Missing secrets: ${missingSecrets.join(', ')}`);
    }
    
    return {
      ready: issues.length === 0,
      issues
    };
  }
}

// Export singleton instance
export const buildTimeMonitor = BuildTimeMonitor.getInstance();

// Export error class for build-time specific errors
export class BuildTimeError extends Error {
  constructor(
    message: string,
    public readonly context: BuildTimeContext
  ) {
    super(`[BUILD-TIME] ${message}`);
    this.name = 'BuildTimeError';
  }
}