/**
 * Input Sanitization Module
 *
 * The interface is intentionally small: two functions that the JobQueue
 * uses to gate incoming job payloads. Everything else has been deleted.
 *
 * External interface:
 *   - `sanitizeJSON(input)` — recursively strips control characters and
 *     zero-width Unicode from every string in a JSON-shaped value.
 *   - `detectMaliciousPatterns(input)` — reports which threat categories
 *     (SQL / XSS / command / path / LDAP / NoSQL / template) match a
 *     given string.
 *
 * Sole production caller: `lib/job-queue/index.ts` (payload gate on
 * `enqueueJob`).
 */

const DANGEROUS_PATTERNS = {
  sqlInjection: [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|declare|cast|convert)\b)/gi,
    /'.*?(\sor\s|union|--|\/\*|\*\/)/gi,
    /\b(or|and)\s+[\d\w]+\s*[=<>!]+\s*[\d\w]+/gi,
    /\b(or|and)\s+\d+\s*=\s*\d+/gi,
    /[\'\"\`]\s*(or|and|union)\s+/gi,
    /\b(sleep|benchmark|waitfor)\s*\(/gi,
    /\b(information_schema|sys\.|mysql\.|pg_)/gi
  ],

  xss: [
    /<script[^>]*>.*?<\/script>/gis,
    /<iframe[^>]*>.*?<\/iframe>/gis,
    /<object[^>]*>.*?<\/object>/gis,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi,
    /url\s*\(/gi
  ],

  commandInjection: [
    /[;&|`$(){}[\]]/,
    /\b(rm|del|format|mkdir|rmdir|copy|move|cat|type|echo|ping|wget|curl|nc|netcat|bash|sh|cmd|powershell)\b/gi,
    /\|\s*(rm|del|cat|type|echo)/gi,
    /&&\s*(rm|del|cat|type|echo)/gi,
    /;\s*(rm|del|cat|type|echo)/gi
  ],

  pathTraversal: [
    /\.\.\//g,
    /\.\.\\\//g,
    /\.\./g,
    /%2e%2e%2f/gi,
    /%2e%2e%5c/gi,
    /%2e%2e/gi,
    /\.\.%2f/gi,
    /\.\.%5c/gi
  ],

  ldapInjection: [
    /[*()\\]/g,
    /\|[^|]/g,
    /&[^&]/g
  ],

  nosqlInjection: [
    /\$where/gi,
    /\$ne/gi,
    /\$gt/gi,
    /\$lt/gi,
    /\$regex/gi,
    /\$or/gi,
    /\$and/gi
  ],

  templateInjection: [
    /\{\{.*?\}\}/g,
    /\$\{.*?\}/g,
    /#\{.*?\}/g,
    /%\{.*?\}/g,
    /<%.*?%>/g
  ]
} as const;

export function detectMaliciousPatterns(input: string): {
  detected: boolean;
  threats: string[];
  patterns: string[];
} {
  const threats: string[] = [];
  const matchedPatterns: string[] = [];

  for (const [threatType, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        threats.push(threatType);
        matchedPatterns.push(pattern.toString());
        break;
      }
    }
  }

  return {
    detected: threats.length > 0,
    threats,
    patterns: matchedPatterns
  };
}

function sanitizeBasicString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeJSON(input: unknown): unknown {
  if (typeof input === 'string') {
    return sanitizeBasicString(input);
  }

  if (typeof input === 'number' || typeof input === 'boolean' || input === null) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeJSON);
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      const sanitizedKey = sanitizeBasicString(key);
      if (sanitizedKey && sanitizedKey.length > 0) {
        sanitized[sanitizedKey] = sanitizeJSON(value);
      }
    }

    return sanitized;
  }

  return null;
}
