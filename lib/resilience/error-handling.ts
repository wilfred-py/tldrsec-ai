/**
 * Enhanced error handling utilities with structured error classes and context
 * 
 * Features:
 * - Structured error classes with context
 * - Error classification and categorization
 * - Error serialization and logging helpers
 * - Correlation ID management
 * - Error aggregation and analysis
 * - Production-ready error reporting
 */

import { logger } from '../logging';

const errorLogger = logger.child('error-handling');

export interface ErrorContext {
  correlationId?: string;
  userId?: string;
  operation?: string;
  service?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
  stack?: string;
  causedBy?: Error;
}

export interface SerializableError {
  name: string;
  message: string;
  code?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: string;
  isRetryable: boolean;
  isTransient: boolean;
}

export enum ErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  DATABASE = 'DATABASE',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  CONFIGURATION = 'CONFIGURATION',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO'
}

/**
 * Base structured error class with context and categorization
 */
export abstract class BaseStructuredError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code?: string;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly isRetryable: boolean;
  public readonly isTransient: boolean;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    code?: string,
    isRetryable: boolean = false,
    isTransient: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;
    this.severity = severity;
    this.code = code;
    this.context = {
      ...context,
      timestamp: new Date(),
      correlationId: context.correlationId || generateCorrelationId()
    };
    this.timestamp = new Date();
    this.isRetryable = isRetryable;
    this.isTransient = isTransient;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging and transmission
   */
  serialize(): SerializableError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      isRetryable: this.isRetryable,
      isTransient: this.isTransient
    };
  }

  /**
   * Create child error with additional context
   */
  withContext(additionalContext: Partial<ErrorContext>): this {
    const ErrorClass = this.constructor as new (...args: unknown[]) => this;
    return new ErrorClass(
      this.message,
      this.category,
      this.severity,
      { ...this.context, ...additionalContext },
      this.code,
      this.isRetryable,
      this.isTransient
    );
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.HIGH, context, code, false, false);
  }
}

export class AuthorizationError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.AUTHORIZATION, ErrorSeverity.HIGH, context, code, false, false);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, context, code, false, false);
  }
}

/**
 * Business logic errors
 */
export class BusinessLogicError extends BaseStructuredError {
  constructor(
    message: string, 
    context: ErrorContext = {}, 
    code?: string, 
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ) {
    super(message, ErrorCategory.BUSINESS_LOGIC, severity, context, code, false, false);
  }
}

/**
 * External service errors (retryable/transient)
 */
export class ExternalServiceError extends BaseStructuredError {
  constructor(
    message: string, 
    context: ErrorContext = {}, 
    code?: string, 
    isRetryable: boolean = true,
    isTransient: boolean = true
  ) {
    super(
      message, 
      ErrorCategory.EXTERNAL_SERVICE, 
      ErrorSeverity.HIGH, 
      context, 
      code, 
      isRetryable, 
      isTransient
    );
  }
}

/**
 * Database errors
 */
export class DatabaseError extends BaseStructuredError {
  constructor(
    message: string, 
    context: ErrorContext = {}, 
    code?: string, 
    isRetryable: boolean = true
  ) {
    super(message, ErrorCategory.DATABASE, ErrorSeverity.CRITICAL, context, code, isRetryable, true);
  }
}

/**
 * Network errors (typically retryable)
 */
export class NetworkError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.NETWORK, ErrorSeverity.HIGH, context, code, true, true);
  }
}

/**
 * Timeout errors (retryable)
 */
export class TimeoutError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.TIMEOUT, ErrorSeverity.HIGH, context, code, true, true);
  }
}

/**
 * Rate limit errors (retryable with backoff)
 */
export class RateLimitError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.RATE_LIMIT, ErrorSeverity.MEDIUM, context, code, true, true);
  }
}

/**
 * Configuration errors (not retryable)
 */
export class ConfigurationError extends BaseStructuredError {
  constructor(message: string, context: ErrorContext = {}, code?: string) {
    super(message, ErrorCategory.CONFIGURATION, ErrorSeverity.CRITICAL, context, code, false, false);
  }
}

/**
 * Generate correlation ID for error tracking
 */
function generateCorrelationId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Error classifier for converting standard errors to structured errors
 */
export class ErrorClassifier {
  private static readonly ERROR_PATTERNS = {
    [ErrorCategory.AUTHENTICATION]: [
      /authentication failed|invalid credentials|unauthorized/i,
      /invalid token|token expired|token malformed/i,
      /login failed|signin failed/i
    ],
    [ErrorCategory.AUTHORIZATION]: [
      /access denied|permission denied|forbidden/i,
      /insufficient privileges|not authorized/i,
      /403|forbidden/i
    ],
    [ErrorCategory.VALIDATION]: [
      /validation failed|invalid input|invalid parameter/i,
      /bad request|malformed request/i,
      /400|bad request/i
    ],
    [ErrorCategory.EXTERNAL_SERVICE]: [
      /api error|service unavailable|external service/i,
      /502|503|504/,
      /upstream error|downstream error/i
    ],
    [ErrorCategory.DATABASE]: [
      /database error|connection failed|query failed/i,
      /deadlock|constraint violation|duplicate key/i,
      /postgresql|mysql|sqlite|prisma/i
    ],
    [ErrorCategory.NETWORK]: [
      /network error|connection reset|connection refused/i,
      /dns resolution failed|hostname not found/i,
      /socket error|socket timeout/i
    ],
    [ErrorCategory.TIMEOUT]: [
      /timeout|timed out|request timeout/i,
      /operation timeout|connection timeout/i
    ],
    [ErrorCategory.RATE_LIMIT]: [
      /rate limit|rate limited|too many requests/i,
      /throttle|throttled|quota exceeded/i,
      /429/
    ],
    [ErrorCategory.CONFIGURATION]: [
      /configuration error|config error|environment variable/i,
      /missing required|not configured/i
    ]
  };

  /**
   * Classify error into appropriate category
   */
  static classifyError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const errorString = error.toString().toLowerCase();
    
    for (const [category, patterns] of Object.entries(this.ERROR_PATTERNS)) {
      const categoryKey = category as ErrorCategory;
      if (patterns.some(pattern => pattern.test(message) || pattern.test(errorString))) {
        return categoryKey;
      }
    }
    
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Convert standard error to structured error
   */
  static toStructuredError(
    error: Error, 
    context: ErrorContext = {}
  ): BaseStructuredError {
    // If already structured, return as-is with additional context
    if (error instanceof BaseStructuredError) {
      return error.withContext(context);
    }

    const category = this.classifyError(error);
    const severity = this.getSeverityForCategory(category);
    const isRetryable = this.isRetryableCategory(category);
    const isTransient = this.isTransientCategory(category);

    // Create appropriate structured error type
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        return new AuthenticationError(error.message, context);
      case ErrorCategory.AUTHORIZATION:
        return new AuthorizationError(error.message, context);
      case ErrorCategory.VALIDATION:
        return new ValidationError(error.message, context);
      case ErrorCategory.EXTERNAL_SERVICE:
        return new ExternalServiceError(error.message, context, undefined, isRetryable, isTransient);
      case ErrorCategory.DATABASE:
        return new DatabaseError(error.message, context, undefined, isRetryable);
      case ErrorCategory.NETWORK:
        return new NetworkError(error.message, context);
      case ErrorCategory.TIMEOUT:
        return new TimeoutError(error.message, context);
      case ErrorCategory.RATE_LIMIT:
        return new RateLimitError(error.message, context);
      case ErrorCategory.CONFIGURATION:
        return new ConfigurationError(error.message, context);
      default:
        return new BusinessLogicError(error.message, context, undefined, severity);
    }
  }

  private static getSeverityForCategory(category: ErrorCategory): ErrorSeverity {
    const severityMap: Record<ErrorCategory, ErrorSeverity> = {
      [ErrorCategory.AUTHENTICATION]: ErrorSeverity.HIGH,
      [ErrorCategory.AUTHORIZATION]: ErrorSeverity.HIGH,
      [ErrorCategory.VALIDATION]: ErrorSeverity.MEDIUM,
      [ErrorCategory.BUSINESS_LOGIC]: ErrorSeverity.MEDIUM,
      [ErrorCategory.EXTERNAL_SERVICE]: ErrorSeverity.HIGH,
      [ErrorCategory.DATABASE]: ErrorSeverity.CRITICAL,
      [ErrorCategory.NETWORK]: ErrorSeverity.HIGH,
      [ErrorCategory.TIMEOUT]: ErrorSeverity.HIGH,
      [ErrorCategory.RATE_LIMIT]: ErrorSeverity.MEDIUM,
      [ErrorCategory.CONFIGURATION]: ErrorSeverity.CRITICAL,
      [ErrorCategory.UNKNOWN]: ErrorSeverity.MEDIUM
    };
    
    return severityMap[category] || ErrorSeverity.MEDIUM;
  }

  private static isRetryableCategory(category: ErrorCategory): boolean {
    return [
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorCategory.DATABASE,
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT,
      ErrorCategory.RATE_LIMIT
    ].includes(category);
  }

  private static isTransientCategory(category: ErrorCategory): boolean {
    return [
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorCategory.DATABASE,
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT,
      ErrorCategory.RATE_LIMIT
    ].includes(category);
  }
}

/**
 * Error aggregator for collecting and analyzing errors
 */
export class ErrorAggregator {
  private errors: BaseStructuredError[] = [];
  private maxErrors: number;

  constructor(maxErrors: number = 1000) {
    this.maxErrors = maxErrors;
  }

  /**
   * Add error to aggregator
   */
  addError(error: Error, context: ErrorContext = {}): void {
    const structuredError = ErrorClassifier.toStructuredError(error, context);
    this.errors.push(structuredError);
    
    // Trim to max size
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    retryableErrors: number;
    transientErrors: number;
    recentErrors: BaseStructuredError[];
  } {
    const errorsByCategory = {} as Record<ErrorCategory, number>;
    const errorsBySeverity = {} as Record<ErrorSeverity, number>;
    let retryableErrors = 0;
    let transientErrors = 0;

    for (const error of this.errors) {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
      
      if (error.isRetryable) retryableErrors++;
      if (error.isTransient) transientErrors++;
    }

    // Get recent errors (last 10)
    const recentErrors = this.errors.slice(-10);

    return {
      totalErrors: this.errors.length,
      errorsByCategory,
      errorsBySeverity,
      retryableErrors,
      transientErrors,
      recentErrors
    };
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors = [];
  }
}

/**
 * Global error handler with logging and reporting
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private aggregator = new ErrorAggregator();

  private constructor() {}

  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  /**
   * Handle error with comprehensive logging and context
   */
  handleError(error: Error, context: ErrorContext = {}): BaseStructuredError {
    const structuredError = ErrorClassifier.toStructuredError(error, context);
    
    // Add to aggregator
    this.aggregator.addError(structuredError);
    
    // Log based on severity
    const logMethod = this.getLogMethod(structuredError.severity);
    logMethod('Error handled by global error handler', {
      error: structuredError.serialize(),
      context: structuredError.context
    });
    
    return structuredError;
  }

  private getLogMethod(severity: ErrorSeverity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return errorLogger.error.bind(errorLogger);
      case ErrorSeverity.MEDIUM:
        return errorLogger.warn.bind(errorLogger);
      case ErrorSeverity.LOW:
      case ErrorSeverity.INFO:
      default:
        return errorLogger.info.bind(errorLogger);
    }
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return this.aggregator.getStatistics();
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.aggregator.clear();
  }
}