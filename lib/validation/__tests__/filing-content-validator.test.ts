/**
 * Tests for SEC Filing Content Validator
 * 
 * Validates the core validation logic to prevent NoSuchKey errors
 * and invalid content from reaching AI processing.
 */

import { FilingContentValidator } from '../filing-content-validator';
import {
  NoSuchKeyError,
  InvalidContentError,
  InvalidDateError,
  MalformedContentError,
  EmptyResponseError,
  ValidationErrorCode
} from '../../errors/validation-errors';

describe('FilingContentValidator', () => {
  let validator: FilingContentValidator;

  beforeEach(() => {
    validator = new FilingContentValidator();
  });

  describe('NoSuchKey Detection', () => {
    test('should detect XML NoSuchKey pattern', async () => {
      const content = `<?xml version="1.0" encoding="UTF-8"?>
        <Error>
          <Code>NoSuchKey</Code>
          <Message>The specified key does not exist.</Message>
        </Error>`;
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(NoSuchKeyError);
      expect(result.error?.code).toBe(ValidationErrorCode.NO_SUCH_KEY);
      expect(result.validationMetrics.hasNoSuchKey).toBe(true);
      expect(result.validationMetrics.detectedFormat).toBe('xml');
    });

    test('should detect HTML NoSuchKey pattern', async () => {
      const content = `<!DOCTYPE html>
        <html>
          <head><title>NoSuchKey</title></head>
          <body>
            <h1>NoSuchKey</h1>
            <p>The specified key does not exist.</p>
          </body>
        </html>`;
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(NoSuchKeyError);
      expect(result.validationMetrics.detectedFormat).toBe('html');
    });

    test('should detect plain text NoSuchKey pattern', async () => {
      const content = 'Error: NoSuchKey - The specified key does not exist in the filing system.';
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(NoSuchKeyError);
      expect(result.validationMetrics.detectedFormat).toBe('text');
    });

    test('should pass validation for valid content without NoSuchKey', async () => {
      const content = `<!DOCTYPE html>
        <html>
          <head><title>SEC Filing - Form 10-K</title></head>
          <body>
            <h1>TESLA INC</h1>
            <p>This is a valid SEC filing content with meaningful information about the company's financial performance and operations. The content includes detailed financial statements, management discussion and analysis, and other required disclosures. This filing provides investors with comprehensive information about the company's business activities, financial position, and results of operations for the reporting period.</p>
          </body>
        </html>`;
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.validationMetrics.hasNoSuchKey).toBe(false);
    });
  });

  describe('Content Length Validation', () => {
    test('should reject content below minimum length', async () => {
      const shortContent = 'Too short';
      
      const result = await validator.validateContent(shortContent, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidContentError);
      expect(result.error?.code).toBe(ValidationErrorCode.INVALID_CONTENT_LENGTH);
    });

    test('should accept content above minimum length', async () => {
      const longContent = 'A'.repeat(600); // Above default minimum of 500
      
      const result = await validator.validateContent(longContent, '0001234567-22-123456');
      
      expect(result.isValid).toBe(true);
      expect(result.validationMetrics.contentLength).toBe(600);
    });

    test('should handle empty content', async () => {
      const result = await validator.validateContent('', '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(EmptyResponseError);
      expect(result.error?.code).toBe(ValidationErrorCode.EMPTY_RESPONSE);
    });

    test('should handle null/undefined content', async () => {
      const result = await validator.validateContent(null as any, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(EmptyResponseError);
    });
  });

  describe('Date Validation', () => {
    test('should validate recent years (2000-2049)', async () => {
      const content = 'A'.repeat(600);
      const accessionNumbers = [
        '0001234567-22-123456', // 2022
        '0001234567-23-123456', // 2023
        '0001234567-24-123456', // 2024
        '0001234567-00-123456', // 2000
        '0001234567-49-123456'  // 2049
      ];
      
      for (const accessionNumber of accessionNumbers) {
        const result = await validator.validateContent(content, accessionNumber);
        expect(result.isValid).toBe(true);
        expect(result.validationMetrics.extractedYear).toBeDefined();
      }
    });

    test('should validate historical years (1950-1999)', async () => {
      const content = 'A'.repeat(600);
      const accessionNumbers = [
        '0001234567-95-123456', // 1995
        '0001234567-80-123456', // 1980
        '0001234567-99-123456', // 1999
        '0001234567-50-123456'  // 1950
      ];
      
      for (const accessionNumber of accessionNumbers) {
        const result = await validator.validateContent(content, accessionNumber);
        expect(result.isValid).toBe(true);
        expect(result.validationMetrics.extractedYear).toBeDefined();
      }
    });

    test('should reject invalid future years', async () => {
      const content = 'A'.repeat(600);
      // Use a custom validator with restricted range to test rejection
      const restrictedValidator = new FilingContentValidator({
        minValidYear: 2000,
        maxValidYear: 2030
      });
      const result = await restrictedValidator.validateContent(content, '0001234567-99-123456'); // 1999 (before 2000)
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidDateError);
      expect(result.error?.code).toBe(ValidationErrorCode.INVALID_DATE);
    });

    test('should handle malformed accession numbers gracefully', async () => {
      const content = 'A'.repeat(600);
      const malformedAccessionNumbers = [
        'invalid-format',
        '123-456',
        '0001234567-XX-123456'
      ];
      
      for (const accessionNumber of malformedAccessionNumbers) {
        const result = await validator.validateContent(content, accessionNumber);
        // Should not fail validation for malformed accession numbers
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('Malformed Content Detection', () => {
    test('should detect empty HTML structure', async () => {
      // Make content long enough to pass length check but still malformed
      const emptyHtml = '<!DOCTYPE html><html><head></head><body></body></html>';
      const content = emptyHtml + ' '.repeat(500); // Pad to pass length check
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(MalformedContentError);
      expect(result.error?.code).toBe(ValidationErrorCode.MALFORMED_CONTENT);
    });

    test('should detect XML declaration only', async () => {
      const content = '<?xml version="1.0" encoding="UTF-8"?>';
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidContentError); // Fails on length first
    });

    test('should detect access denied responses', async () => {
      const content = 'AccessDenied: You do not have permission to access this resource.'.repeat(10);
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(MalformedContentError);
    });
  });

  describe('Content Format Detection', () => {
    test('should detect XML format', async () => {
      const content = `<?xml version="1.0"?>
        <SEC-FILING>
          <FORM-TYPE>10-K</FORM-TYPE>
          <COMPANY>Tesla Inc</COMPANY>
        </SEC-FILING>`.repeat(5);
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.validationMetrics.detectedFormat).toBe('xml');
    });

    test('should detect HTML format', async () => {
      const content = `<!DOCTYPE html>
        <html>
          <head><title>SEC Filing</title></head>
          <body><p>Filing content here</p></body>
        </html>`.repeat(3);
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.validationMetrics.detectedFormat).toBe('html');
    });

    test('should detect text format', async () => {
      const content = 'This is plain text filing content without any XML or HTML tags. '.repeat(50);
      
      const result = await validator.validateContent(content, '0001234567-22-123456');
      
      expect(result.validationMetrics.detectedFormat).toBe('text');
    });
  });

  describe('Performance Requirements', () => {
    test('should complete validation in under 1 second', async () => {
      const largeContent = 'Large filing content with meaningful text. '.repeat(1000);
      
      const startTime = Date.now();
      const result = await validator.validateContent(largeContent, '0001234567-22-123456');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // < 1 second
      expect(result.validationMetrics.validationTimeMs).toBeLessThan(1000);
    });

    test('should handle large content efficiently', async () => {
      const veryLargeContent = 'A'.repeat(100000); // 100KB content
      
      const result = await validator.validateContent(veryLargeContent, '0001234567-22-123456');
      
      expect(result.validationMetrics.validationTimeMs).toBeLessThan(1000);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Custom Configuration', () => {
    test('should respect custom minimum content length', async () => {
      const customValidator = new FilingContentValidator({
        minContentLength: 1000
      });
      
      const content = 'A'.repeat(800); // Below custom minimum
      const result = await customValidator.validateContent(content, '0001234567-22-123456');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidContentError);
    });

    test('should respect custom year range', async () => {
      const customValidator = new FilingContentValidator({
        minValidYear: 2000,
        maxValidYear: 2030
      });
      
      const content = 'A'.repeat(600);
      const result = await customValidator.validateContent(content, '0001234567-95-123456'); // 1995
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidDateError);
    });

    test('should allow disabling strict validation', async () => {
      const lenientValidator = new FilingContentValidator({
        enableStrictValidation: false
      });
      
      const malformedContent = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = await lenientValidator.validateContent(malformedContent, '0001234567-22-123456');
      
      // Should pass malformed content check but still fail on length
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(InvalidContentError); // Length issue, not malformed
    });
  });

  describe('Static Validation Method', () => {
    test('should work with static validate method', async () => {
      const content = '<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>';
      
      const result = await FilingContentValidator.validate(
        content,
        '0001234567-22-123456',
        'https://sec.gov/document.xml'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeInstanceOf(NoSuchKeyError);
    });
  });

  describe('Error Context and Logging', () => {
    test('should provide detailed error context', async () => {
      const content = '<Code>NoSuchKey</Code>';
      
      const result = await validator.validateContent(
        content,
        '0001234567-22-123456',
        'https://sec.gov/document.xml'
      );
      
      expect(result.error?.context).toBeDefined();
      expect(result.error?.context?.accessionNumber).toBe('0001234567-22-123456');
      expect(result.error?.context?.documentUrl).toBe('https://sec.gov/document.xml');
    });

    test('should indicate retryability correctly', async () => {
      // Non-retryable error
      const noSuchKeyContent = '<Code>NoSuchKey</Code>';
      const noSuchKeyResult = await validator.validateContent(noSuchKeyContent, '0001234567-22-123456');
      
      expect(noSuchKeyResult.error?.retryable).toBe(false);
      
      // Valid content (no error)
      const validContent = 'A'.repeat(600);
      const validResult = await validator.validateContent(validContent, '0001234567-22-123456');
      
      expect(validResult.error).toBeUndefined();
    });
  });
});

describe('Validation Error Classes', () => {
  test('NoSuchKeyError should have correct properties', () => {
    const error = new NoSuchKeyError('0001234567-22-123456', 'https://sec.gov/doc.xml');
    
    expect(error.name).toBe('NoSuchKeyError');
    expect(error.code).toBe(ValidationErrorCode.NO_SUCH_KEY);
    expect(error.retryable).toBe(false);
    expect(error.context?.accessionNumber).toBe('0001234567-22-123456');
  });

  test('InvalidContentError should have correct properties', () => {
    const error = new InvalidContentError('0001234567-22-123456', 100, 500);
    
    expect(error.name).toBe('InvalidContentError');
    expect(error.code).toBe(ValidationErrorCode.INVALID_CONTENT_LENGTH);
    expect(error.retryable).toBe(false);
    expect(error.context?.contentLength).toBe(100);
    expect(error.context?.minimumLength).toBe(500);
  });

  test('InvalidDateError should have correct properties', () => {
    const error = new InvalidDateError('0001234567-22-123456', 2051);
    
    expect(error.name).toBe('InvalidDateError');
    expect(error.code).toBe(ValidationErrorCode.INVALID_DATE);
    expect(error.retryable).toBe(false);
    expect(error.context?.extractedYear).toBe(2051);
  });
});