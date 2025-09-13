/**
 * Validation types and error handling
 * Provides type safety for CIK validation, data validation, and error handling
 */

// CIK validation types
export interface CIKValidationResult {
  isValid: boolean;
  formattedCIK?: string;
  error?: CIKValidationError;
  metadata?: CIKValidationMetadata;
}

// CIK validation error types
export interface CIKValidationError {
  code: CIKErrorCode;
  message: string;
  details?: string;
  field?: string;
}

// CIK error codes enum
export enum CIKErrorCode {
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_LENGTH = 'INVALID_LENGTH',
  NON_NUMERIC = 'NON_NUMERIC',
  EMPTY_VALUE = 'EMPTY_VALUE',
  INVALID_CHECKSUM = 'INVALID_CHECKSUM',
  NOT_FOUND = 'NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

// CIK validation metadata
export interface CIKValidationMetadata {
  originalValue: string;
  validationTimestamp: Date;
  validationMethod: 'FORMAT_CHECK' | 'SEC_LOOKUP' | 'CACHE_LOOKUP';
  processingTimeMs: number;
  cached?: boolean;
}

// Generic validation result interface
export interface ValidationResult<T = unknown> {
  isValid: boolean;
  value?: T;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
  metadata?: ValidationMetadata;
}

// Generic validation error
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// Validation warning
export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

// Validation metadata
export interface ValidationMetadata {
  validatedAt: Date;
  validatorVersion: string;
  rules: string[];
  processingTimeMs: number;
  source: string;
}

// Data sanitization result
export interface SanitizationResult {
  sanitized: boolean;
  originalValue: unknown;
  sanitizedValue: unknown;
  operations: SanitizationOperation[];
  warnings?: string[];
}

// Sanitization operation record
export interface SanitizationOperation {
  type: 'TRIM' | 'ESCAPE' | 'REMOVE' | 'REPLACE' | 'VALIDATE' | 'NORMALIZE';
  field: string;
  pattern?: string;
  replacement?: string;
  description: string;
}

// Input validation schema
export interface ValidationSchema {
  required: string[];
  optional: string[];
  rules: Record<string, ValidationRule[]>;
  customValidators?: Record<string, CustomValidator>;
}

// Validation rule definition
export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url' | 'regex' | 'custom';
  pattern?: string | RegExp;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  allowedValues?: unknown[];
  customValidator?: string;
  errorMessage?: string;
}

// Custom validator function type
export type CustomValidator = (value: unknown, context?: unknown) => ValidationResult;

// Form validation result for UI components
export interface FormValidationResult {
  isValid: boolean;
  fieldErrors: Record<string, string[]>;
  generalErrors: string[];
  warnings: Record<string, string[]>;
  validatedData?: Record<string, unknown>;
}

// File validation result
export interface FileValidationResult {
  isValid: boolean;
  fileType?: string;
  mimeType?: string;
  sizeBytes?: number;
  errors: ValidationError[];
  securityChecks: {
    malwareScanned: boolean;
    contentTypeVerified: boolean;
    sizeWithinLimits: boolean;
    extensionAllowed: boolean;
  };
}