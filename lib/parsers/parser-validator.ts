/**
 * Parser Validator
 * 
 * This module provides utilities for validating parser results and handling
 * partial or incomplete parsing data.
 */

import { 
  ParserErrorCategory, 
  ParserErrorSeverity, 
  RecoveryStrategy,
  createParserError
} from './parser-error-handler';
import { Logger } from '@/lib/logging';

// Create a logger for parser validation
const logger = new Logger({}, 'parser-validator');

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  CRITICAL = 'critical',    // Validation failure is critical and should abort
  ERROR = 'error',          // Validation failure is an error but process can continue
  WARNING = 'warning',      // Validation failure is a warning only
  INFO = 'info'             // Informational validation result
}

/**
 * Structure for validation result
 */
export interface ValidationResult {
  isValid: boolean;
  severity: ValidationSeverity;
  message: string;
  details?: string;
  location?: string;
}

/**
 * Result of validation with potential fix
 */
export interface ValidationWithFixResult<T> {
  originalData: T;
  validationResults: ValidationResult[];
  fixedData?: T;
  isFixed: boolean;
  isValid: boolean;
}

/**
 * Options for validation
 */
export interface ValidationOptions {
  stopOnCritical?: boolean;
  autoFix?: boolean;
  throwOnError?: boolean;
  context?: Record<string, any>;
}

/**
 * Default validation options
 */
const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  stopOnCritical: true,
  autoFix: true,
  throwOnError: false
};

/**
 * Type for validation rule function
 */
export type ValidationRule<T> = (
  data: T,
  context?: Record<string, any>
) => ValidationResult;

/**
 * Type for fix function
 */
export type FixFunction<T> = (
  data: T,
  validationResult: ValidationResult,
  context?: Record<string, any>
) => T;

/**
 * Validator class for a specific data type
 */
export class Validator<T> {
  private rules: Array<{
    rule: ValidationRule<T>;
    fix?: FixFunction<T>;
  }> = [];
  
  /**
   * Add a validation rule
   */
  addRule(rule: ValidationRule<T>, fix?: FixFunction<T>): this {
    this.rules.push({ rule, fix });
    return this;
  }
  
  /**
   * Validate data against all rules
   */
  validate(
    data: T,
    options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS
  ): ValidationWithFixResult<T> {
    const mergedOptions = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
    const validationResults: ValidationResult[] = [];
    let currentData = structuredClone(data) as T;
    let isFixed = false;
    
    // Apply each rule in sequence
    for (const { rule, fix } of this.rules) {
      try {
        // Apply the validation rule
        const result = rule(currentData, mergedOptions.context);
        validationResults.push(result);
        
        // If validation failed and we should stop on critical, check severity
        if (!result.isValid && 
            mergedOptions.stopOnCritical && 
            result.severity === ValidationSeverity.CRITICAL) {
          // If we should throw, do so
          if (mergedOptions.throwOnError) {
            throw createParserError(
              ParserErrorCategory.PARSING,
              `Critical validation failure: ${result.message}`,
              {
                severity: ParserErrorSeverity.FATAL,
                recovery: RecoveryStrategy.ABORT,
                context: {
                  validation: result,
                  ...mergedOptions.context
                }
              }
            );
          }
          
          // Otherwise, return immediately with current state
          return {
            originalData: data,
            validationResults,
            isFixed,
            isValid: false
          };
        }
        
        // If validation failed but we have a fix and autoFix is enabled
        if (!result.isValid && fix && mergedOptions.autoFix) {
          try {
            // Apply the fix
            const fixedData = fix(currentData, result, mergedOptions.context);
            currentData = fixedData;
            isFixed = true;
            
            logger.debug(`Applied fix for validation failure: ${result.message}`);
          } catch (fixError) {
            logger.error(
              `Error applying fix for validation failure: ${result.message}`,
              fixError
            );
            
            // Don't throw here, continue with other validations
          }
        }
      } catch (validationError) {
        // Log validation error but continue
        logger.error(`Error during validation:`, validationError);
        
        // Add error as a validation result
        validationResults.push({
          isValid: false,
          severity: ValidationSeverity.ERROR,
          message: `Validation process error: ${validationError instanceof Error ? 
            validationError.message : String(validationError)}`,
          details: 'Exception during validation rule execution'
        });
      }
    }
    
    // Check if any validations failed
    const isValid = validationResults.every(result => result.isValid);
    
    // If we have failures, should throw, and haven't yet
    if (!isValid && mergedOptions.throwOnError) {
      // Find the most severe failure
      const mostSevereFailure = validationResults
        .filter(result => !result.isValid)
        .sort((a, b) => {
          const severityOrder = {
            [ValidationSeverity.CRITICAL]: 0,
            [ValidationSeverity.ERROR]: 1,
            [ValidationSeverity.WARNING]: 2,
            [ValidationSeverity.INFO]: 3
          };
          
          return severityOrder[a.severity] - severityOrder[b.severity];
        })[0];
      
      // Throw with the most severe failure
      throw createParserError(
        ParserErrorCategory.PARSING,
        `Validation failure: ${mostSevereFailure.message}`,
        {
          severity: 
            mostSevereFailure.severity === ValidationSeverity.CRITICAL ? 
              ParserErrorSeverity.FATAL : 
              mostSevereFailure.severity === ValidationSeverity.ERROR ?
                ParserErrorSeverity.ERROR :
                ParserErrorSeverity.WARNING,
          recovery: 
            mostSevereFailure.severity === ValidationSeverity.CRITICAL ? 
              RecoveryStrategy.ABORT : RecoveryStrategy.PARTIAL,
          context: {
            validation: mostSevereFailure,
            allResults: validationResults,
            ...mergedOptions.context
          }
        }
      );
    }
    
    // Return final result
    return {
      originalData: data,
      validationResults,
      fixedData: isFixed ? currentData : undefined,
      isFixed,
      isValid
    };
  }
}

/**
 * Helper to check if a field exists and is non-empty
 */
export function validateRequiredField<T>(
  data: T,
  fieldName: keyof T,
  options: {
    severity?: ValidationSeverity,
    message?: string,
    location?: string
  } = {}
): ValidationResult {
  const fieldValue = data[fieldName];
  const isValid = fieldValue !== undefined && 
                  fieldValue !== null && 
                  (typeof fieldValue !== 'string' || fieldValue.trim() !== '');
  
  return {
    isValid,
    severity: options.severity || ValidationSeverity.ERROR,
    message: options.message || `Required field '${String(fieldName)}' is missing or empty`,
    location: options.location
  };
}

/**
 * Helper to check if content is a reasonable size
 */
export function validateContentSize<T>(
  data: T,
  fieldName: keyof T,
  options: {
    minLength?: number,
    maxLength?: number,
    severity?: ValidationSeverity,
    message?: string,
    location?: string
  } = {}
): ValidationResult {
  const fieldValue = String(data[fieldName] || '');
  const { minLength = 0, maxLength = Number.MAX_SAFE_INTEGER } = options;
  
  const isValid = fieldValue.length >= minLength && fieldValue.length <= maxLength;
  
  let message = options.message || '';
  if (!message) {
    if (fieldValue.length < minLength) {
      message = `Field '${String(fieldName)}' is too short (${fieldValue.length} < ${minLength})`;
    } else if (fieldValue.length > maxLength) {
      message = `Field '${String(fieldName)}' is too long (${fieldValue.length} > ${maxLength})`;
    }
  }
  
  return {
    isValid,
    severity: options.severity || ValidationSeverity.WARNING,
    message,
    location: options.location
  };
}

/**
 * Create a partial result when full parsing fails
 */
export function createPartialResult<T>(
  partialData: Partial<T>,
  template: T,
  options: {
    validationResults?: ValidationResult[],
    context?: Record<string, any>
  } = {}
): T {
  // Start with a clone of the template
  const result = structuredClone(template) as T;
  
  // Copy all non-undefined properties from partial data
  for (const key in partialData) {
    if (partialData[key] !== undefined) {
      (result as any)[key] = partialData[key];
    }
  }
  
  // Log the partial result creation
  logger.debug(
    `Created partial result with ${Object.keys(partialData).length} fields`,
    { validationResults: options.validationResults }
  );
  
  return result;
} 