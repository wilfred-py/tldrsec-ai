/**
 * Simple JSON Parser - Single Pass with Minimal Repair
 *
 * Design philosophy: If the prompt is correct, the response is correct.
 * However, AI models sometimes produce predictable, fixable errors
 * (like forgetting to close an array before closing the object).
 *
 * This parser performs:
 * 1. Direct JSON.parse attempt
 * 2. If that fails, minimal bracket repair for known AI failure modes
 * 3. Schema validation
 *
 * Performance target: < 5ms average parse time
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
  method: 'direct' | 'codeblock-stripped' | 'bracket-repaired';
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
  /** Whether bracket repair was attempted */
  bracketRepairAttempted?: boolean;
  /** Whether bracket repair was successful */
  bracketRepairSucceeded?: boolean;
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

    // Attempt bracket repair for known AI failure modes
    const repairResult = attemptBracketRepair(jsonText);

    if (repairResult.repaired) {
      try {
        const data = JSON.parse(repairResult.text) as Record<string, unknown>;

        // Validate against schema
        const validationErrors = validateAgainstSchema(data, schema);

        if (validationErrors.length > 0) {
          return {
            success: false,
            data,
            method: 'bracket-repaired',
            attempts: 1,
            validationErrors,
            diagnostics: buildDiagnostics(response, formType, usedKnownSchema, hadCodeBlock, errorPosition, true, true),
            rawResponse: response,
            parseTimeMs: performance.now() - startTime
          };
        }

        return {
          success: true,
          data,
          method: 'bracket-repaired',
          attempts: 1,
          rawResponse: response,
          diagnostics: buildDiagnostics(response, formType, usedKnownSchema, hadCodeBlock, errorPosition, true, true),
          parseTimeMs: performance.now() - startTime
        };
      } catch {
        // Bracket repair didn't help - fall through to error return
      }
    }

    return {
      success: false,
      method,
      attempts: 1,
      error: errorMessage,
      diagnostics: buildDiagnostics(response, formType, usedKnownSchema, hadCodeBlock, errorPosition, repairResult.repaired, false),
      rawResponse: response,
      parseTimeMs: performance.now() - startTime
    };
  }
}

/**
 * Attempt to repair common bracket/brace imbalance issues
 *
 * AI models sometimes forget to close arrays before closing objects.
 * This function detects and fixes that specific failure mode.
 *
 * @param text - The JSON text to attempt to repair
 * @returns Object with repaired flag and potentially fixed text
 */
function attemptBracketRepair(text: string): { repaired: boolean; text: string } {
  // Count brackets and braces
  let braceCount = 0;  // { }
  let bracketCount = 0; // [ ]

  for (const char of text) {
    if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }

  // If balanced, no repair needed
  if (braceCount === 0 && bracketCount === 0) {
    return { repaired: false, text };
  }

  // Common AI failure mode: forgot to close array(s) before closing object
  // Response ends with "}" but should end with "]}}" or similar
  if (bracketCount > 0 && braceCount === 0 && text.endsWith('}')) {
    // Insert missing ] before the final }
    // Handle multiple unclosed brackets
    const closingBrackets = ']'.repeat(bracketCount);
    const repairedText = text.slice(0, -1) + closingBrackets + '}';
    return { repaired: true, text: repairedText };
  }

  // Another failure mode: multiple unclosed braces/brackets at end
  if (bracketCount > 0 && braceCount > 0) {
    // Try to close in the right order: ] first, then }
    const closingBrackets = ']'.repeat(bracketCount);
    const closingBraces = '}'.repeat(braceCount);
    const repairedText = text + closingBrackets + closingBraces;
    return { repaired: true, text: repairedText };
  }

  // Can't repair other cases
  return { repaired: false, text };
}

/**
 * Build diagnostics object for debugging parse failures
 */
function buildDiagnostics(
  response: string,
  formType: string,
  usedKnownSchema: boolean,
  hadCodeBlock: boolean,
  errorPosition?: number,
  bracketRepairAttempted?: boolean,
  bracketRepairSucceeded?: boolean
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
    errorPosition,
    bracketRepairAttempted,
    bracketRepairSucceeded
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
