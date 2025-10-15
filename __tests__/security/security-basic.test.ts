/**
 * Basic Security Test Suite
 * 
 * Simple security tests to validate core security functions
 * are working properly.
 */

import { describe, test, expect } from '@jest/globals';
import { ValidationSchemas } from '../../lib/validation/schemas';

describe('Basic Security Tests', () => {
  
  describe('Validation Schemas', () => {
    test('should validate ticker symbols correctly', () => {
      expect(ValidationSchemas.ticker.parse('AAPL')).toBe('AAPL');
      expect(ValidationSchemas.ticker.parse('TSLA')).toBe('TSLA');
      expect(() => ValidationSchemas.ticker.parse('')).toThrow();
      expect(() => ValidationSchemas.ticker.parse('invalid ticker')).toThrow();
      expect(() => ValidationSchemas.ticker.parse('tsla')).toThrow(); // Should reject lowercase
    });
    
    test('should validate filing types', () => {
      expect(ValidationSchemas.filingType.parse('10-K')).toBe('10-K');
      expect(ValidationSchemas.filingType.parse('8-K')).toBe('8-K');
      expect(() => ValidationSchemas.filingType.parse('INVALID')).toThrow();
    });
    
    test('should validate UUIDs', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      expect(ValidationSchemas.uuid.parse(validUUID)).toBe(validUUID);
      expect(() => ValidationSchemas.uuid.parse('invalid-uuid')).toThrow();
    });
    
    test('should validate positive integers', () => {
      expect(ValidationSchemas.positiveInteger.parse(5)).toBe(5);
      expect(() => ValidationSchemas.positiveInteger.parse(0)).toThrow();
      expect(() => ValidationSchemas.positiveInteger.parse(-1)).toThrow();
    });
    
    test('should validate email addresses', () => {
      expect(ValidationSchemas.email.parse('test@example.com')).toBe('test@example.com');
      expect(ValidationSchemas.email.parse('USER@EXAMPLE.COM')).toBe('user@example.com');
      expect(() => ValidationSchemas.email.parse('invalid-email')).toThrow();
    });
  });
  
  describe('Security Limits', () => {
    test('should enforce string length limits', () => {
      const longString = 'a'.repeat(20000);
      expect(() => ValidationSchemas.secureString.parse(longString)).toThrow();
    });
    
    test('should enforce array size limits', () => {
      const largeArray = new Array(2000).fill('item');
      expect(() => ValidationSchemas.safeArray(ValidationSchemas.secureString).parse(largeArray)).toThrow();
    });
  });
  
  describe('Malicious Pattern Detection', () => {
    test('should reject obvious SQL injection attempts', () => {
      expect(() => ValidationSchemas.secureString.parse("'; DROP TABLE users; --")).toThrow();
      expect(() => ValidationSchemas.secureString.parse("' OR 1=1 --")).toThrow();
    });
    
    test('should reject XSS attempts', () => {
      expect(() => ValidationSchemas.secureString.parse('<script>alert("XSS")</script>')).toThrow();
      expect(() => ValidationSchemas.secureString.parse('javascript:alert(1)')).toThrow();
    });
    
    test('should allow safe content', () => {
      expect(ValidationSchemas.secureString.parse('normal text')).toBe('normal text');
      expect(ValidationSchemas.secureString.parse('user@example.com')).toBe('user@example.com');
      expect(ValidationSchemas.secureString.parse('AAPL')).toBe('AAPL');
    });
  });
});