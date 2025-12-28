/**
 * Simple JSON Parser - Single Pass, No Fallbacks
 *
 * Design philosophy: If the prompt is correct, the response is correct.
 * We don't repair broken JSON - we report it for prompt improvement.
 *
 * This parser replaces the complex 5-strategy extraction pipeline with
 * a simple, fast, deterministic parser that validates against schema.
 *
 * Performance target: < 5ms average parse time (vs ~70ms with old system)
 *
 * @module simple-parser
 */

import { FORM_SCHEMAS, JSONSchema } from '../prompts/unified-prompts';

/**
 * Result of parsing a JSON response
 */
export interface ParseResult {
  /** Whether parsing and validation succeeded */
  success: boolean;
  /** The parsed JSON data (if successful or partially successful) */
  data?: Record<string, unknown>;
  /** The extraction method used */
  method: 'direct' | 'codeblock-stripped';
  /** Number of parse attempts (always 1 - we don't retry) */
  attempts: number;
  /** Error message if parsing failed */
  error?: string;
  /** Detailed diagnostics for debugging failures */
  diagnostics?: ParseDiagnostics;
  /** List of missing required fields if validation failed */
  validationErrors?: string[];
  /** The original raw response for debugging */
  rawResponse: string;
  /** Time taken to parse in milliseconds */
  parseTimeMs: number;
}

/**
 * Detailed diagnostics for debugging parse failures
 */
export interface ParseDiagnostics {
  /** Length of the raw response */
  responseLength: number;
  /** First 100 characters of response (for quick visual check) */
  responsePreview: string;
  /** Whether response started with expected { */
  startsWithBrace: boolean;
  /** Whether response ended with expected } */
  endsWithBrace: boolean;
  /** Whether markdown code blocks were detected */
  hadCodeBlock: boolean;
  /** The form type used for validation */
  formType: string;
  /** Whether a known schema was used (vs Generic fallback) */
  usedKnownSchema: boolean;
  /** Position of error in response (if available) */
  errorPosition?: number;
}

/**
 * Parse a JSON response from an AI model
 *
 * This function performs a single-pass parse with schema validation.
 * It does NOT attempt to repair malformed JSON - if the JSON is invalid,
 * it returns an error for debugging the prompt.
 *
 * @param response - The raw response string from the AI model
 * @param formType - The SEC form type for schema validation
 * @returns ParseResult with success status and parsed data or error details
 *
 * @example
 * ```typescript
 * const result = parseJSONResponse('{"company":"Tesla","summary":"..."}', '10-K');
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error || result.validationErrors);
 * }
 * ```
 */
export function parseJSONResponse(response: string, formType: string): ParseResult {
  const startTime = performance.now();
  const usedKnownSchema = formType in FORM_SCHEMAS && formType !== 'Generic';
  const schema = FORM_SCHEMAS[formType] || FORM_SCHEMAS['Generic'];

  // Handle empty/whitespace responses
  if (!response || !response.trim()) {
    return {
      success: false,
      method: 'direct',
      attempts: 1,
      error: 'Empty response received from AI model',
      diagnostics: buildDiagnostics(response, formType, usedKnownSchema, false),
      rawResponse: response,
      parseTimeMs: performance.now() - startTime
    };
  }

  let jsonText = response.trim();
  let method: ParseResult['method'] = 'direct';
  let hadCodeBlock = false;

  // Single pre-processing step: strip markdown code blocks if present
  // Matches: ```json\n{...}\n``` or ```\n{...}\n```
  const codeBlockMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
    method = 'codeblock-stripped';
    hadCodeBlock = true;
  }

  // Attempt parse
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;

    // Validate against schema
    const validationErrors = validateAgainstSchema(data, schema);

    if (validationErrors.length > 0) {
      return {
        success: false,
        data,
        method,
        attempts: 1,
        validationErrors,
        diagnostics: buildDiagnostics(response, formType, usedKnownSchema, hadCodeBlock),
        rawResponse: response,
        parseTimeMs: performance.now() - startTime
      };
    }

    return {
      success: true,
      data,
      method,
      attempts: 1,
      rawResponse: response,
      parseTimeMs: performance.now() - startTime
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    // Extract position from error message if available (e.g., "at position 45")
    const positionMatch = errorMessage.match(/position\s*(\d+)/i);
    const errorPosition = positionMatch ? parseInt(positionMatch[1], 10) : undefined;

    return {
      success: false,
      method,
      attempts: 1,
      error: errorMessage,
      diagnostics: buildDiagnostics(response, formType, usedKnownSchema, hadCodeBlock, errorPosition),
      rawResponse: response,
      parseTimeMs: performance.now() - startTime
    };
  }
}

/**
 * Build diagnostics object for debugging parse failures
 */
function buildDiagnostics(
  response: string,
  formType: string,
  usedKnownSchema: boolean,
  hadCodeBlock: boolean,
  errorPosition?: number
): ParseDiagnostics {
  const trimmed = (response || '').trim();
  return {
    responseLength: response?.length || 0,
    responsePreview: trimmed.slice(0, 100) + (trimmed.length > 100 ? '...' : ''),
    startsWithBrace: trimmed.startsWith('{'),
    endsWithBrace: trimmed.endsWith('}'),
    hadCodeBlock,
    formType,
    usedKnownSchema,
    errorPosition
  };
}

/**
 * Validate parsed data against a JSON schema
 *
 * Checks that all required fields are present and non-empty.
 *
 * @param data - The parsed JSON data
 * @param schema - The JSON schema to validate against
 * @returns Array of field names that are missing or invalid
 */
function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: JSONSchema
): string[] {
  const errors: string[] = [];

  for (const field of schema.required) {
    const value = data[field];

    // Check for missing, null, undefined
    if (value === undefined || value === null) {
      errors.push(field);
      continue;
    }

    // Check for empty strings
    if (typeof value === 'string' && value.trim() === '') {
      errors.push(field);
      continue;
    }

    // Check for empty arrays (required arrays should have at least one item)
    if (Array.isArray(value) && value.length === 0) {
      errors.push(field);
      continue;
    }
  }

  return errors;
}
