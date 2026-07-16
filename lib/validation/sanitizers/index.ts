/**
 * Job-queue payload sanitization.
 *
 * Two live exports both used by lib/job-queue/index.ts:
 * - detectMaliciousPatterns: rejects payloads carrying SQL / XSS / command-
 *   injection / path-traversal / LDAP / NoSQL / template-injection signatures.
 * - sanitizeJSON: recursively strips control characters, zero-width Unicode,
 *   and collapses whitespace inside every string node of an arbitrary payload.
 *
 * All other sanitizers (sanitizeHTML / sanitizeForSQL / sanitizeEmail /
 * sanitizeURL / sanitizeFilePath / sanitizeContent / sanitizeFileName /
 * sanitizeSearchQuery / sanitizeAPIKey / sanitizeEnvVar / sanitizeForCommand /
 * sanitizeQueryParam / the Sanitizers grab-bag object) previously exported
 * from this module had zero production callers — email / SQL / HTML / URL
 * sanitization in production lives in lib/security/data-sanitizer.ts and
 * lib/security/email-validation.ts under different implementations.
 */

/**
 * Regex catalogues used by detectMaliciousPatterns to classify a payload
 * against the injection families the job queue rejects. Private to this
 * module — no external caller inspects the individual pattern lists.
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

/**
 * Classify a payload against the injection-family catalogues above. Returns
 * `{ detected, threats, patterns }` where `threats` names each injection
 * family that matched at least one pattern. Each family fires at most once
 * per invocation regardless of how many patterns within it matched.
 */
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
        break; // Only record one match per threat type
      }
    }
  }

  return {
    detected: threats.length > 0,
    threats,
    patterns: matchedPatterns
  };
}

/**
 * Strip control characters, zero-width Unicode, and collapse whitespace on a
 * single string. Private helper used by sanitizeJSON on every string node
 * (including object keys).
 */
function sanitizeBasicString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Remove Unicode zero-width characters
    .replace(/[​-‍﻿]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recursively sanitize every string node of an arbitrary JSON-shaped value.
 * Object keys are sanitized too; empty-after-sanitize keys are dropped.
 * Numbers, booleans, and null pass through unchanged. NaN / Infinity survive
 * since callers may want to preserve them — validate numerics separately.
 */
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
