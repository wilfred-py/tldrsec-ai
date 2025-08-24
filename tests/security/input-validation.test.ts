/**
 * Security Test Suite for Input Validation
 * Tests SQL injection prevention, XSS protection, and data sanitization
 */

import { validateAndSanitizeTicker, validateUserId } from '../../services/filing/sendEmailSummary';

describe('Input Validation Security Tests', () => {
  describe('Ticker Validation Security', () => {
    test('CRITICAL: Must reject SQL injection attempts', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; DELETE FROM tickers; --",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO tickers VALUES ('malicious'); --",
        "' OR 1=1 --",
        "admin'--",
        "' OR 'x'='x",
        "'; EXEC sp_addsrvrolemember 'sa' --"
      ];

      for (const maliciousInput of sqlInjectionAttempts) {
        const result = validateAndSanitizeTicker(maliciousInput);
        
        expect(result.valid).toBe(false);
        // Input validation catches these as length or character issues
        expect(result.error).toBeDefined();
      }
    });

    test('CRITICAL: Must reject XSS attempts', () => {
      const xssAttempts = [
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
        "<svg onload=alert('xss')>",
        "<%3Cscript%3Ealert('xss')%3C/script%3E"
      ];

      for (const xssInput of xssAttempts) {
        const result = validateAndSanitizeTicker(xssInput);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    test('SECURITY: Must reject tickers with dangerous SQL keywords', () => {
      const sqlKeywords = [
        "DROP", "DELETE", "INSERT", "UPDATE", 
        "CREATE", "ALTER", "EXEC", "EXECUTE",
        "UNION", "SELECT", "WHERE"
      ];

      for (const keyword of sqlKeywords) {
        const result = validateAndSanitizeTicker(keyword);
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('malicious content');
      }
    });

    test('SECURITY: Must reject tickers with SQL comments', () => {
      const commentAttempts = [
        "AAPL--",
        "MSFT/*comment*/",
        "GOOGL--comment",
        "AMZN/**/",
        "META-- DROP TABLE"
      ];

      for (const commentInput of commentAttempts) {
        const result = validateAndSanitizeTicker(commentInput);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    test('SECURITY: Must enforce length limits', () => {
      // Too short
      const emptyTicker = "";
      const resultEmpty = validateAndSanitizeTicker(emptyTicker);
      expect(resultEmpty.valid).toBe(false);
      expect(resultEmpty.error).toContain('length invalid');

      // Too long
      const longTicker = "A".repeat(15);
      const resultLong = validateAndSanitizeTicker(longTicker);
      expect(resultLong.valid).toBe(false);
      expect(resultLong.error).toContain('length invalid');
    });

    test('SECURITY: Must reject non-string inputs', () => {
      const nonStringInputs = [
        123,
        null,
        undefined,
        {},
        [],
        true,
        false
      ];

      for (const invalidInput of nonStringInputs) {
        const result = validateAndSanitizeTicker(invalidInput as any);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Ticker must be a string');
      }
    });

    test('SECURITY: Must accept valid tickers', () => {
      const validTickers = [
        "AAPL",
        "MSFT",
        "GOOGL",
        "AMZN",
        "META",
        "TSLA",
        "NVDA",
        "JPM",
        "V",
        "JNJ"
      ];

      for (const validTicker of validTickers) {
        const result = validateAndSanitizeTicker(validTicker);
        
        expect(result.valid).toBe(true);
        expect(result.sanitizedValue).toBe(validTicker.toUpperCase());
        expect(result.error).toBeUndefined();
      }
    });

    test('SECURITY: Must normalize case and trim whitespace', () => {
      const testCases = [
        { input: "  aapl  ", expected: "AAPL" },
        { input: "msft", expected: "MSFT" },
        { input: "GOOGL", expected: "GOOGL" },
        { input: "\tAMZN\t", expected: "AMZN" },
        { input: " meta ", expected: "META" }
      ];

      for (const testCase of testCases) {
        const result = validateAndSanitizeTicker(testCase.input);
        
        expect(result.valid).toBe(true);
        expect(result.sanitizedValue).toBe(testCase.expected);
      }
    });
  });

  describe('User ID Validation Security', () => {
    test('CRITICAL: Must reject SQL injection attempts in user IDs', () => {
      const sqlInjectionAttempts = [
        "user123'; DROP TABLE users; --",
        "' OR '1'='1",
        "user123'; DELETE FROM users; --",
        "' UNION SELECT * FROM secrets --",
        "user123' OR 1=1 --"
      ];

      for (const maliciousInput of sqlInjectionAttempts) {
        const result = validateUserId(maliciousInput);
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('invalid characters');
      }
    });

    test('SECURITY: Must reject user IDs with SQL keywords', () => {
      const sqlKeywords = [
        "DROP", "DELETE", "INSERT", "UPDATE", 
        "CREATE", "ALTER", "EXEC", "EXECUTE",
        "UNION", "SELECT"
      ];

      for (const keyword of sqlKeywords) {
        const result = validateUserId(keyword);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    test('SECURITY: Must enforce user ID length limits', () => {
      // Too short
      const shortUserId = "abc";
      const resultShort = validateUserId(shortUserId);
      expect(resultShort.valid).toBe(false);
      expect(resultShort.error).toContain('length invalid');

      // Too long
      const longUserId = "a".repeat(55);
      const resultLong = validateUserId(longUserId);
      expect(resultLong.valid).toBe(false);
      expect(resultLong.error).toContain('length invalid');
    });

    test('SECURITY: Must reject non-string user IDs', () => {
      const nonStringInputs = [
        123,
        null,
        undefined,
        {},
        [],
        true,
        false
      ];

      for (const invalidInput of nonStringInputs) {
        const result = validateUserId(invalidInput as any);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBe('User ID must be a string');
      }
    });

    test('SECURITY: Must accept valid user IDs', () => {
      const validUserIds = [
        "user_123456",
        "abc123def456",
        "user-with-dashes",
        "user_with_underscores",
        "123456789012345678901234567890", // 30 chars
        "clk_1234567890abcdef", // Clerk-style ID
        "usr_abcd1234efgh5678" // Custom format
      ];

      for (const validUserId of validUserIds) {
        const result = validateUserId(validUserId);
        
        expect(result.valid).toBe(true);
        expect(result.sanitizedValue).toBe(validUserId.trim());
        expect(result.error).toBeUndefined();
      }
    });

    test('SECURITY: Must trim whitespace from user IDs', () => {
      const testCases = [
        { input: "  user123  ", expected: "user123" },
        { input: "\tuser_456\t", expected: "user_456" },
        { input: " user-789 ", expected: "user-789" }
      ];

      for (const testCase of testCases) {
        const result = validateUserId(testCase.input);
        
        expect(result.valid).toBe(true);
        expect(result.sanitizedValue).toBe(testCase.expected);
      }
    });

    test('SECURITY: Must reject user IDs with special characters', () => {
      const specialChars = [
        "user@123",
        "user#456",
        "user$789",
        "user%abc",
        "user&def",
        "user*ghi",
        "user+jkl",
        "user=mno",
        "user[pqr]",
        "user{stu}",
        "user|vwx",
        "user\\yz",
        "user:123",
        "user;456",
        "user\"789",
        "user'abc",
        "user<def>",
        "user,ghi",
        "user.jkl",
        "user?mno",
        "user/pqr"
      ];

      for (const specialChar of specialChars) {
        const result = validateUserId(specialChar);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('Edge Cases and Attack Vectors', () => {
    test('SECURITY: Must handle Unicode normalization attacks', () => {
      const unicodeAttacks = [
        "MSFT\u200B", // Zero-width space - should fail
        "GOO\uFEFFGL", // Byte order mark - should fail  
        "\u202EAAPL" // Right-to-left override - should fail
      ];

      for (const unicodeInput of unicodeAttacks) {
        const result = validateAndSanitizeTicker(unicodeInput);
        
        // Unicode control characters should be rejected
        expect(result.valid).toBe(false);
      }
      
      // Some Unicode may pass basic character validation but that's acceptable
      // as they would be caught by other layers or normalized properly
      const ambiguousCase = "A\u0041PPL"; // A with normal A (effectively "AAAPL")
      const ambiguousResult = validateAndSanitizeTicker(ambiguousCase);
      // This might pass basic validation, which is acceptable as it normalizes to valid chars
    });

    test('SECURITY: Must handle null byte injection attempts', () => {
      const nullByteAttempts = [
        "AAPL\x00",
        "\x00MSFT",
        "GOO\x00GL",
        "user123\x00.txt"
      ];

      for (const nullByteInput of nullByteAttempts) {
        const tickerResult = validateAndSanitizeTicker(nullByteInput);
        const userIdResult = validateUserId(nullByteInput);
        
        expect(tickerResult.valid).toBe(false);
        expect(userIdResult.valid).toBe(false);
      }
    });

    test('SECURITY: Must handle very long input strings (DoS prevention)', () => {
      const veryLongString = "A".repeat(10000);
      
      const tickerResult = validateAndSanitizeTicker(veryLongString);
      const userIdResult = validateUserId(veryLongString);
      
      expect(tickerResult.valid).toBe(false);
      expect(userIdResult.valid).toBe(false);
      expect(tickerResult.error).toContain('length invalid');
      expect(userIdResult.error).toContain('length invalid');
    });

    test('SECURITY: Must handle regex DoS attempts', () => {
      const regexDosAttempts = [
        "A".repeat(1000) + "!",
        "(" + "A".repeat(100) + ")*",
        "[" + "A".repeat(100) + "]",
        "A" + "|".repeat(100) + "B"
      ];

      for (const dosInput of regexDosAttempts) {
        const start = Date.now();
        const result = validateAndSanitizeTicker(dosInput);
        const duration = Date.now() - start;
        
        // Should complete quickly (under 100ms) and reject the input
        expect(duration).toBeLessThan(100);
        expect(result.valid).toBe(false);
      }
    });
  });
});