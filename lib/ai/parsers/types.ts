/**
 * Type definitions for the response parsing module
 */

import { SECFilingType } from '../prompts/prompt-types';

/**
 * Represents the structure of the JSON that we expect to extract
 * from Claude's response
 */
export interface ExtractedJSON {
  raw: string;           // The raw JSON string as extracted
  parsed?: unknown;      // The parsed JSON object if successful
  error?: Error;         // Any error that occurred during parsing
  extractionMethod: string; // Which method was used to extract the JSON
  success: boolean;      // Whether the extraction was successful
}

/**
 * Options for JSON extraction
 */
export interface ExtractionOptions {
  allowPartial?: boolean;      // Whether to allow partial JSON extraction
  strictValidation?: boolean;  // Whether to strictly validate against schema
  maxRetries?: number;         // Max number of retries for malformed JSON
  filingType?: SECFilingType;  // The filing type, for schema validation
}

/**
 * Result of schema validation
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  validatedData?: unknown;
  partialData?: unknown;
}

/**
 * Metrics for parser performance
 */
export interface ParserMetrics {
  extractionSuccess: boolean;
  validationSuccess: boolean;
  extractionTimeMs: number;
  validationTimeMs: number;
  extractionMethod: string;
  errorType?: string;
  documentType?: SECFilingType;
}

/**
 * Streaming parser state
 */
export interface StreamingParserState {
  buffer: string;
  jsonStarted: boolean;
  jsonDepth: number;
  inString: boolean;
  escape: boolean;
  currentKey: string;
  collectedChunks: string[];
  partialResult?: unknown;
}

/**
 * Options for streaming responses
 */
export interface StreamingOptions extends ExtractionOptions {
  onChunk?: (chunk: string) => void;
  onPartialJson?: (json: unknown) => void;
  onComplete?: (result: ExtractedJSON) => void;
  onError?: (error: Error) => void;
  bufferSize?: number;
}

/**
 * Streaming parser progress event
 */
export interface StreamingProgressEvent {
  type: 'chunk' | 'partial' | 'complete' | 'error';
  data: unknown;
  timestamp: number;
  progress?: number; // 0-100 estimate
}

/**
 * Type for event listeners used in streaming parser
 */
export type StreamingEventListener = (event: StreamingProgressEvent) => void; 