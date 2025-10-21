/**
 * Parameter Validation Monitor Integration
 * 
 * Integrates with the pipeline health monitoring system to track parameter validation
 * operations across the entire application. Provides monitoring hooks for validation
 * operations with automatic health threshold checking.
 */

import { logger } from '../logging';
import { recordParameterValidation } from './pipeline-health-monitoring-system';

const validationLogger = logger.child('parameter-validation-monitor');

// Validation result types
export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  metadata?: Record<string, any>;
}

export interface ValidationContext {
  operation: string;
  parameters: Record<string, any>;
  expectedSchema?: Record<string, any>;
  source?: string;
}

/**
 * Enhanced parameter validation wrapper that integrates with health monitoring
 * 
 * This function wraps validation operations and automatically reports results
 * to the health monitoring system for threshold analysis and alerting.
 */
export async function validateWithMonitoring<T extends Record<string, any>>(
  context: ValidationContext,
  validator: (params: T) => Promise<ValidationResult> | ValidationResult,
  parameters: T
): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    validationLogger.debug('Starting parameter validation', {
      operation: context.operation,
      parameterCount: Object.keys(parameters).length,
      source: context.source
    });

    // Execute the validation
    const result = await validator(parameters);
    
    const validationTime = Date.now() - startTime;
    
    // Sanitize parameters for logging (remove sensitive data)
    const sanitizedParams = sanitizeParametersForLogging(parameters);
    
    // Record validation result in health monitoring system
    recordParameterValidation(
      context.operation,
      sanitizedParams,
      result.isValid,
      result.issues
    );

    // Log validation result
    if (result.isValid) {
      validationLogger.debug('Parameter validation successful', {
        operation: context.operation,
        validationTime,
        source: context.source
      });
    } else {
      validationLogger.warn('Parameter validation failed', {
        operation: context.operation,
        issues: result.issues,
        validationTime,
        source: context.source,
        parameters: sanitizedParams
      });
    }

    return result;

  } catch (error) {
    const validationTime = Date.now() - startTime;
    
    validationLogger.error('Parameter validation error', error, {
      operation: context.operation,
      validationTime,
      source: context.source
    });

    // Record as failed validation
    recordParameterValidation(
      context.operation,
      sanitizeParametersForLogging(parameters),
      false,
      [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
    );

    // Return error result instead of throwing
    return {
      isValid: false,
      issues: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      metadata: { error: true, validationTime }
    };
  }
}

/**
 * Validation wrapper for synchronous validators
 */
export function validateSyncWithMonitoring<T extends Record<string, any>>(
  context: ValidationContext,
  validator: (params: T) => ValidationResult,
  parameters: T
): ValidationResult {
  return validateWithMonitoring(context, validator, parameters) as ValidationResult;
}

/**
 * Common validation patterns with health monitoring integration
 */
export class ParameterValidators {
  
  /**
   * Validate user ID parameters
   */
  static async validateUserId(userId: string, operation: string = 'user_id_validation'): Promise<ValidationResult> {
    return validateWithMonitoring(
      { operation, parameters: { userId } },
      (params) => {
        const issues: string[] = [];
        
        if (!params.userId || typeof params.userId !== 'string') {
          issues.push('User ID must be a non-empty string');
        } else {
          // Clerk user ID format validation
          const clerkUserIdPattern = /^user_[a-zA-Z0-9]{20,40}$/;
          if (!clerkUserIdPattern.test(params.userId)) {
            issues.push('User ID must follow Clerk format');
          }
          
          if (params.userId.length < 10 || params.userId.length > 50) {
            issues.push('User ID length out of valid range');
          }
          
          if (params.userId.includes('..') || params.userId.includes('/') || params.userId.includes('\\')) {
            issues.push('User ID contains invalid characters');
          }
        }
        
        return {
          isValid: issues.length === 0,
          issues
        };
      },
      { userId }
    );
  }

  /**
   * Validate SEC filing parameters
   */
  static async validateSecFilingParams(
    params: {
      accessionNumber?: string;
      cik?: string;
      formType?: string;
      filingDate?: string;
    },
    operation: string = 'sec_filing_validation'
  ): Promise<ValidationResult> {
    return validateWithMonitoring(
      { operation, parameters: params },
      (filingParams) => {
        const issues: string[] = [];
        
        // Accession number validation
        if (filingParams.accessionNumber) {
          const accessionPattern = /^\d{10}-\d{2}-\d{6}$/;
          if (!accessionPattern.test(filingParams.accessionNumber)) {
            issues.push('Invalid accession number format');
          }
        }
        
        // CIK validation
        if (filingParams.cik) {
          const cikPattern = /^\d{1,10}$/;
          if (!cikPattern.test(filingParams.cik)) {
            issues.push('Invalid CIK format');
          }
        }
        
        // Form type validation
        if (filingParams.formType) {
          const validFormTypes = ['10-K', '10-Q', '8-K', 'DEF 14A', 'Form 4', 'Form 3', 'Form 5'];
          if (!validFormTypes.includes(filingParams.formType)) {
            issues.push(`Invalid form type: ${filingParams.formType}`);
          }
        }
        
        // Filing date validation
        if (filingParams.filingDate) {
          const date = new Date(filingParams.filingDate);
          if (isNaN(date.getTime())) {
            issues.push('Invalid filing date format');
          } else {
            const now = new Date();
            const oneYearAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
            if (date < oneYearAgo || date > now) {
              issues.push('Filing date out of valid range');
            }
          }
        }
        
        return {
          isValid: issues.length === 0,
          issues,
          metadata: {
            parameterCount: Object.keys(filingParams).length,
            hasAccessionNumber: !!filingParams.accessionNumber,
            hasCik: !!filingParams.cik,
            hasFormType: !!filingParams.formType,
            hasFilingDate: !!filingParams.filingDate
          }
        };
      },
      params
    );
  }

  /**
   * Validate API request parameters
   */
  static async validateApiRequestParams(
    params: Record<string, any>,
    requiredFields: string[],
    operation: string = 'api_request_validation'
  ): Promise<ValidationResult> {
    return validateWithMonitoring(
      { 
        operation, 
        parameters: params,
        expectedSchema: { requiredFields }
      },
      (requestParams) => {
        const issues: string[] = [];
        
        // Check required fields
        for (const field of requiredFields) {
          if (!(field in requestParams) || requestParams[field] === undefined || requestParams[field] === null) {
            issues.push(`Missing required field: ${field}`);
          }
        }
        
        // Check for SQL injection patterns
        const sqlInjectionPatterns = [
          /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
          /(;|\||&|<|>|'|"|`)/,
          /(\-\-|\/\*|\*\/)/
        ];
        
        for (const [key, value] of Object.entries(requestParams)) {
          if (typeof value === 'string') {
            for (const pattern of sqlInjectionPatterns) {
              if (pattern.test(value)) {
                issues.push(`Potential SQL injection in field: ${key}`);
                break;
              }
            }
          }
        }
        
        // Check for XSS patterns
        const xssPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi
        ];
        
        for (const [key, value] of Object.entries(requestParams)) {
          if (typeof value === 'string') {
            for (const pattern of xssPatterns) {
              if (pattern.test(value)) {
                issues.push(`Potential XSS in field: ${key}`);
                break;
              }
            }
          }
        }
        
        return {
          isValid: issues.length === 0,
          issues,
          metadata: {
            parameterCount: Object.keys(requestParams).length,
            requiredFieldCount: requiredFields.length
          }
        };
      },
      params
    );
  }

  /**
   * Validate cron job parameters
   */
  static async validateCronJobParams(
    params: {
      jobName?: string;
      schedule?: string;
      maxRuntime?: number;
      priority?: string;
    },
    operation: string = 'cron_job_validation'
  ): Promise<ValidationResult> {
    return validateWithMonitoring(
      { operation, parameters: params },
      (cronParams) => {
        const issues: string[] = [];
        
        // Job name validation
        if (cronParams.jobName) {
          if (typeof cronParams.jobName !== 'string' || cronParams.jobName.length < 3 || cronParams.jobName.length > 50) {
            issues.push('Job name must be 3-50 characters');
          }
          
          if (!/^[a-zA-Z0-9_-]+$/.test(cronParams.jobName)) {
            issues.push('Job name contains invalid characters');
          }
        }
        
        // Schedule validation (cron expression)
        if (cronParams.schedule) {
          const cronPattern = /^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)$/;
          if (!cronPattern.test(cronParams.schedule)) {
            issues.push('Invalid cron schedule format');
          }
        }
        
        // Max runtime validation
        if (cronParams.maxRuntime !== undefined) {
          if (typeof cronParams.maxRuntime !== 'number' || cronParams.maxRuntime < 1 || cronParams.maxRuntime > 3600) {
            issues.push('Max runtime must be between 1 and 3600 seconds');
          }
        }
        
        // Priority validation
        if (cronParams.priority) {
          const validPriorities = ['low', 'normal', 'high', 'critical'];
          if (!validPriorities.includes(cronParams.priority.toLowerCase())) {
            issues.push(`Invalid priority: ${cronParams.priority}`);
          }
        }
        
        return {
          isValid: issues.length === 0,
          issues,
          metadata: {
            hasJobName: !!cronParams.jobName,
            hasSchedule: !!cronParams.schedule,
            hasMaxRuntime: cronParams.maxRuntime !== undefined,
            hasPriority: !!cronParams.priority
          }
        };
      },
      params
    );
  }

  /**
   * Validate email parameters
   */
  static async validateEmailParams(
    params: {
      to?: string;
      subject?: string;
      template?: string;
      data?: Record<string, any>;
    },
    operation: string = 'email_validation'
  ): Promise<ValidationResult> {
    return validateWithMonitoring(
      { operation, parameters: params },
      (emailParams) => {
        const issues: string[] = [];
        
        // Email address validation
        if (emailParams.to) {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailPattern.test(emailParams.to)) {
            issues.push('Invalid email address format');
          }
          
          // Check for suspicious email patterns
          const suspiciousPatterns = [
            /test@/,
            /admin@/,
            /root@/,
            /noreply@/,
            /abuse@/
          ];
          
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(emailParams.to)) {
              issues.push('Suspicious email address pattern');
              break;
            }
          }
        }
        
        // Subject validation
        if (emailParams.subject) {
          if (typeof emailParams.subject !== 'string' || emailParams.subject.length > 200) {
            issues.push('Email subject too long');
          }
          
          // Check for spam indicators
          const spamPatterns = [
            /urgent/i,
            /act now/i,
            /limited time/i,
            /free money/i,
            /click here/i
          ];
          
          for (const pattern of spamPatterns) {
            if (pattern.test(emailParams.subject)) {
              issues.push('Subject contains spam indicators');
              break;
            }
          }
        }
        
        // Template validation
        if (emailParams.template) {
          const validTemplates = [
            'welcome',
            'filing-summary',
            'alert',
            'digest',
            'verification'
          ];
          
          if (!validTemplates.includes(emailParams.template)) {
            issues.push(`Invalid email template: ${emailParams.template}`);
          }
        }
        
        // Data validation
        if (emailParams.data) {
          if (typeof emailParams.data !== 'object' || Array.isArray(emailParams.data)) {
            issues.push('Email data must be an object');
          } else {
            const dataKeys = Object.keys(emailParams.data);
            if (dataKeys.length > 20) {
              issues.push('Too many data fields in email');
            }
          }
        }
        
        return {
          isValid: issues.length === 0,
          issues,
          metadata: {
            hasTo: !!emailParams.to,
            hasSubject: !!emailParams.subject,
            hasTemplate: !!emailParams.template,
            hasData: !!emailParams.data,
            dataFieldCount: emailParams.data ? Object.keys(emailParams.data).length : 0
          }
        };
      },
      params
    );
  }
}

/**
 * Sanitize parameters for logging by removing or masking sensitive information
 */
function sanitizeParametersForLogging(parameters: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(parameters)) {
    const lowerKey = key.toLowerCase();
    
    // Mask sensitive fields
    if (lowerKey.includes('password') || 
        lowerKey.includes('secret') || 
        lowerKey.includes('token') || 
        lowerKey.includes('key') ||
        lowerKey.includes('auth')) {
      sanitized[key] = '***MASKED***';
    }
    // Truncate long strings
    else if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = value.substring(0, 100) + '...';
    }
    // Mask email domains
    else if (typeof value === 'string' && value.includes('@')) {
      const parts = value.split('@');
      if (parts.length === 2) {
        sanitized[key] = `${parts[0]}@***`;
      } else {
        sanitized[key] = value;
      }
    }
    // Keep other values as-is
    else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Create validation monitoring wrapper for existing validation functions
 */
export function createValidationWrapper<T extends Record<string, any>, R>(
  operation: string,
  validationFunction: (params: T) => Promise<R> | R
): (params: T) => Promise<R> {
  return async (params: T): Promise<R> => {
    const startTime = Date.now();
    
    try {
      const result = await validationFunction(params);
      
      // Record successful validation
      recordParameterValidation(
        operation,
        sanitizeParametersForLogging(params),
        true,
        []
      );
      
      return result;
      
    } catch (error) {
      // Record failed validation
      recordParameterValidation(
        operation,
        sanitizeParametersForLogging(params),
        false,
        [error instanceof Error ? error.message : String(error)]
      );
      
      throw error;
    }
  };
}

// Export convenience functions
export {
  recordParameterValidation
};