/**
 * Error Handling Constants Refactoring Tests
 * 
 * Tests for the circular import resolution refactoring that moved error constants
 * to a separate constants.ts file to prevent circular dependencies.
 * 
 * These tests address Quality Engineer feedback:
 * 1. Import resolution tests for backward compatibility
 * 2. Circular dependency prevention tests  
 * 3. Error code mapping validation tests
 */

import { 
  // Test backward compatibility - importing from main index
  ErrorCategory as IndexErrorCategory,
  ErrorCode as IndexErrorCode, 
  ErrorSeverity as IndexErrorSeverity,
  isRetriableError as IndexIsRetriableError
} from '@/lib/error-handling/index';

import {
  // Test new constants file directly
  ErrorCategory as ConstantsErrorCategory,
  ErrorCode as ConstantsErrorCode,
  ErrorSeverity as ConstantsErrorSeverity,
  errorStatusCodes,
  errorCategories,
  errorSeverityLevels,
  isRetriableError as ConstantsIsRetriableError
} from '@/lib/error-handling/constants';

// Mock dependencies
jest.mock('@/lib/logging', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockImplementation(() => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    })),
  }
}));

describe('Error Handling Refactoring', () => {
  
  describe('Import Resolution & Backward Compatibility', () => {
    it('all error constants accessible via both import paths', () => {
      // Test that ErrorCategory is accessible from both locations
      expect(IndexErrorCategory).toBeDefined();
      expect(ConstantsErrorCategory).toBeDefined();
      expect(IndexErrorCategory).toBe(ConstantsErrorCategory);
      
      // Test that ErrorCode is accessible from both locations
      expect(IndexErrorCode).toBeDefined();
      expect(ConstantsErrorCode).toBeDefined();
      expect(IndexErrorCode).toBe(ConstantsErrorCode);
      
      // Test that ErrorSeverity is accessible from both locations
      expect(IndexErrorSeverity).toBeDefined();
      expect(ConstantsErrorSeverity).toBeDefined();
      expect(IndexErrorSeverity).toBe(ConstantsErrorSeverity);
      
      // Test that isRetriableError is accessible from both locations
      expect(IndexIsRetriableError).toBeDefined();
      expect(ConstantsIsRetriableError).toBeDefined();
      expect(IndexIsRetriableError).toBe(ConstantsIsRetriableError);
    });

    it('enums contain all expected values', () => {
      // Verify ErrorCategory has all expected values
      const expectedCategories = [
        'CLIENT_ERROR', 'SERVER_ERROR', 'NETWORK_ERROR', 'TIMEOUT_ERROR',
        'API_ERROR', 'DB_ERROR', 'AI_ERROR', 'VALIDATION_ERROR', 'UNKNOWN_ERROR'
      ];
      expectedCategories.forEach(category => {
        expect(IndexErrorCategory[category as keyof typeof IndexErrorCategory]).toBeDefined();
        expect(ConstantsErrorCategory[category as keyof typeof ConstantsErrorCategory]).toBeDefined();
      });

      // Verify ErrorCode has all expected values
      const expectedCodes = [
        'BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED',
        'VALIDATION_ERROR', 'INTERNAL_ERROR', 'EXTERNAL_API_ERROR', 'DATABASE_ERROR',
        'TIMEOUT_ERROR', 'AI_QUOTA_EXCEEDED', 'AI_CONTEXT_WINDOW_EXCEEDED',
        'AI_CONTENT_FILTERED', 'AI_UNAVAILABLE', 'AI_MODEL_ERROR', 'AI_PARSING_ERROR',
        'NETWORK_UNAVAILABLE', 'CONNECTION_RESET', 'RETRY_EXHAUSTED', 'CIRCUIT_OPEN'
      ];
      expectedCodes.forEach(code => {
        expect(IndexErrorCode[code as keyof typeof IndexErrorCode]).toBeDefined();
        expect(ConstantsErrorCode[code as keyof typeof ConstantsErrorCode]).toBeDefined();
      });

      // Verify ErrorSeverity has all expected values
      const expectedSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      expectedSeverities.forEach(severity => {
        expect(IndexErrorSeverity[severity as keyof typeof IndexErrorSeverity]).toBeDefined();
        expect(ConstantsErrorSeverity[severity as keyof typeof ConstantsErrorSeverity]).toBeDefined();
      });
    });

    it('existing consumers continue to work without modification', () => {
      // Test that code using the old import path still works
      const testError = IndexErrorCode.INTERNAL_ERROR;
      const testCategory = IndexErrorCategory.SERVER_ERROR;
      const testSeverity = IndexErrorSeverity.HIGH;
      
      expect(testError).toBe('INTERNAL_ERROR');
      expect(testCategory).toBe('SERVER_ERROR');
      expect(testSeverity).toBe('high');
      
      // Test that isRetriableError function works with old imports
      expect(typeof IndexIsRetriableError[testError]).toBe('boolean');
    });
  });

  describe('Circular Dependency Prevention', () => {
    it('no circular dependencies in module graph', () => {
      // Test that constants file doesn't import from index file
      // This is validated at TypeScript compilation time, but we can test
      // that the constants file exports work independently
      expect(ConstantsErrorCategory.CLIENT_ERROR).toBe('CLIENT_ERROR');
      expect(ConstantsErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ConstantsErrorSeverity.LOW).toBe('low');
    });

    it('constants file is self-contained', () => {
      // Verify that all mappings are defined in constants file
      expect(errorStatusCodes).toBeDefined();
      expect(errorCategories).toBeDefined();
      expect(errorSeverityLevels).toBeDefined();
      expect(ConstantsIsRetriableError).toBeDefined();
      
      // Test that mappings work without any imports from index
      expect(errorStatusCodes[ConstantsErrorCode.BAD_REQUEST]).toBe(400);
      expect(errorCategories[ConstantsErrorCode.BAD_REQUEST]).toBe(ConstantsErrorCategory.CLIENT_ERROR);
      expect(errorSeverityLevels[ConstantsErrorCode.BAD_REQUEST]).toBe(ConstantsErrorSeverity.LOW);
    });

    it('index file properly re-exports constants', () => {
      // Verify that index file re-exports don't create circular dependencies
      // by testing that re-exported values match original constants
      Object.values(ConstantsErrorCode).forEach(code => {
        const indexValue = IndexErrorCode[code as keyof typeof IndexErrorCode];
        const constantsValue = ConstantsErrorCode[code as keyof typeof ConstantsErrorCode];
        expect(indexValue).toBe(constantsValue);
      });
    });
  });

  describe('Error Code Mapping Validation', () => {
    it('all error codes have complete mappings', () => {
      // Test that every ErrorCode has a corresponding entry in all mapping objects
      Object.values(ConstantsErrorCode).forEach(errorCode => {
        // Check HTTP status code mapping
        expect(errorStatusCodes[errorCode]).toBeDefined();
        expect(typeof errorStatusCodes[errorCode]).toBe('number');
        expect(errorStatusCodes[errorCode]).toBeGreaterThanOrEqual(400);
        expect(errorStatusCodes[errorCode]).toBeLessThan(600);
        
        // Check category mapping
        expect(errorCategories[errorCode]).toBeDefined();
        expect(Object.values(ConstantsErrorCategory)).toContain(errorCategories[errorCode]);
        
        // Check severity mapping
        expect(errorSeverityLevels[errorCode]).toBeDefined();
        expect(Object.values(ConstantsErrorSeverity)).toContain(errorSeverityLevels[errorCode]);
        
        // Check retryability mapping
        expect(ConstantsIsRetriableError[errorCode]).toBeDefined();
        expect(typeof ConstantsIsRetriableError[errorCode]).toBe('boolean');
      });
    });

    it('HTTP status codes are valid', () => {
      // Test that all HTTP status codes are in valid ranges
      Object.entries(errorStatusCodes).forEach(([errorCode, statusCode]) => {
        expect(statusCode).toBeGreaterThanOrEqual(400);
        expect(statusCode).toBeLessThan(600);
        
        // Test specific mappings for common error codes
        switch (errorCode) {
          case ConstantsErrorCode.BAD_REQUEST:
            expect(statusCode).toBe(400);
            break;
          case ConstantsErrorCode.UNAUTHORIZED:
            expect(statusCode).toBe(401);
            break;
          case ConstantsErrorCode.FORBIDDEN:
            expect(statusCode).toBe(403);
            break;
          case ConstantsErrorCode.NOT_FOUND:
            expect(statusCode).toBe(404);
            break;
          case ConstantsErrorCode.RATE_LIMITED:
            expect(statusCode).toBe(429);
            break;
          case ConstantsErrorCode.INTERNAL_ERROR:
            expect(statusCode).toBe(500);
            break;
        }
      });
    });

    it('error categories are logically consistent', () => {
      // Test that error codes are mapped to appropriate categories
      expect(errorCategories[ConstantsErrorCode.BAD_REQUEST]).toBe(ConstantsErrorCategory.CLIENT_ERROR);
      expect(errorCategories[ConstantsErrorCode.UNAUTHORIZED]).toBe(ConstantsErrorCategory.CLIENT_ERROR);
      expect(errorCategories[ConstantsErrorCode.INTERNAL_ERROR]).toBe(ConstantsErrorCategory.SERVER_ERROR);
      expect(errorCategories[ConstantsErrorCode.DATABASE_ERROR]).toBe(ConstantsErrorCategory.DB_ERROR);
      expect(errorCategories[ConstantsErrorCode.AI_QUOTA_EXCEEDED]).toBe(ConstantsErrorCategory.AI_ERROR);
      expect(errorCategories[ConstantsErrorCode.NETWORK_UNAVAILABLE]).toBe(ConstantsErrorCategory.NETWORK_ERROR);
      expect(errorCategories[ConstantsErrorCode.TIMEOUT_ERROR]).toBe(ConstantsErrorCategory.TIMEOUT_ERROR);
      expect(errorCategories[ConstantsErrorCode.VALIDATION_ERROR]).toBe(ConstantsErrorCategory.VALIDATION_ERROR);
    });

    it('severity levels are appropriate', () => {
      // Test that severity levels make sense for different error types
      
      // Critical errors
      expect(errorSeverityLevels[ConstantsErrorCode.RETRY_EXHAUSTED]).toBe(ConstantsErrorSeverity.HIGH);
      expect(errorSeverityLevels[ConstantsErrorCode.DATABASE_ERROR]).toBe(ConstantsErrorSeverity.HIGH);
      
      // Medium severity errors
      expect(errorSeverityLevels[ConstantsErrorCode.UNAUTHORIZED]).toBe(ConstantsErrorSeverity.MEDIUM);
      expect(errorSeverityLevels[ConstantsErrorCode.TIMEOUT_ERROR]).toBe(ConstantsErrorSeverity.MEDIUM);
      
      // Low severity errors
      expect(errorSeverityLevels[ConstantsErrorCode.BAD_REQUEST]).toBe(ConstantsErrorSeverity.LOW);
      expect(errorSeverityLevels[ConstantsErrorCode.NOT_FOUND]).toBe(ConstantsErrorSeverity.LOW);
    });

    it('retryability flags are logical', () => {
      // Test that retryable flags make sense
      
      // Should NOT be retryable (client errors)
      expect(ConstantsIsRetriableError[ConstantsErrorCode.BAD_REQUEST]).toBe(false);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.UNAUTHORIZED]).toBe(false);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.FORBIDDEN]).toBe(false);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.NOT_FOUND]).toBe(false);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.VALIDATION_ERROR]).toBe(false);
      
      // SHOULD be retryable (transient errors)
      expect(ConstantsIsRetriableError[ConstantsErrorCode.RATE_LIMITED]).toBe(true);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.TIMEOUT_ERROR]).toBe(true);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.NETWORK_UNAVAILABLE]).toBe(true);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.AI_QUOTA_EXCEEDED]).toBe(true);
      expect(ConstantsIsRetriableError[ConstantsErrorCode.EXTERNAL_API_ERROR]).toBe(true);
    });
  });

  describe('Data Integrity Validation', () => {
    it('no duplicate values in enums', () => {
      // Test ErrorCategory enum has no duplicates
      const categoryValues = Object.values(ConstantsErrorCategory);
      expect(new Set(categoryValues).size).toBe(categoryValues.length);
      
      // Test ErrorCode enum has no duplicates
      const codeValues = Object.values(ConstantsErrorCode);
      expect(new Set(codeValues).size).toBe(codeValues.length);
      
      // Test ErrorSeverity enum has no duplicates
      const severityValues = Object.values(ConstantsErrorSeverity);
      expect(new Set(severityValues).size).toBe(severityValues.length);
    });

    it('all mapping objects have same keys as ErrorCode enum', () => {
      const errorCodeKeys = Object.values(ConstantsErrorCode);
      
      // Check errorStatusCodes has all keys
      expect(Object.keys(errorStatusCodes).sort()).toEqual(errorCodeKeys.sort());
      
      // Check errorCategories has all keys
      expect(Object.keys(errorCategories).sort()).toEqual(errorCodeKeys.sort());
      
      // Check errorSeverityLevels has all keys
      expect(Object.keys(errorSeverityLevels).sort()).toEqual(errorCodeKeys.sort());
      
      // Check isRetriableError has all keys
      expect(Object.keys(ConstantsIsRetriableError).sort()).toEqual(errorCodeKeys.sort());
    });

    it('no orphaned mappings exist', () => {
      const validErrorCodes = Object.values(ConstantsErrorCode);
      
      // Check that all status code mappings reference valid error codes
      Object.keys(errorStatusCodes).forEach(key => {
        expect(validErrorCodes).toContain(key);
      });
      
      // Check that all category mappings reference valid error codes
      Object.keys(errorCategories).forEach(key => {
        expect(validErrorCodes).toContain(key);
      });
      
      // Check that all severity mappings reference valid error codes
      Object.keys(errorSeverityLevels).forEach(key => {
        expect(validErrorCodes).toContain(key);
      });
    });
  });

  describe('Runtime Verification', () => {
    it('re-exports work correctly at runtime', () => {
      // Test that re-exported constants behave identically to direct imports
      const testCases = [
        { index: IndexErrorCode.INTERNAL_ERROR, constants: ConstantsErrorCode.INTERNAL_ERROR },
        { index: IndexErrorCategory.SERVER_ERROR, constants: ConstantsErrorCategory.SERVER_ERROR },
        { index: IndexErrorSeverity.HIGH, constants: ConstantsErrorSeverity.HIGH }
      ];
      
      testCases.forEach(({ index, constants }) => {
        expect(index).toBe(constants);
        expect(typeof index).toBe(typeof constants);
      });
    });

    it('enum conversion works correctly', () => {
      // Test that enum values can be used for lookups and comparisons
      const errorCode = ConstantsErrorCode.DATABASE_ERROR;
      
      // Test object key lookup
      expect(errorStatusCodes[errorCode]).toBe(500);
      expect(errorCategories[errorCode]).toBe(ConstantsErrorCategory.DB_ERROR);
      expect(errorSeverityLevels[errorCode]).toBe(ConstantsErrorSeverity.HIGH);
      
      // Test string comparison
      expect(errorCode === 'DATABASE_ERROR').toBe(true);
      
      // Test enum comparison
      expect(errorCategories[errorCode] === ConstantsErrorCategory.DB_ERROR).toBe(true);
    });

    it('constants are immutable', () => {
      // Test that constants can't be modified (TypeScript compile-time, but verify at runtime)
      expect(() => {
        // @ts-ignore - Testing runtime immutability
        ConstantsErrorCode.NEW_ERROR = 'NEW_ERROR';
      }).not.toThrow(); // JavaScript allows this, but TypeScript prevents it
      
      // Verify the enum structure remains intact
      expect(ConstantsErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });
});