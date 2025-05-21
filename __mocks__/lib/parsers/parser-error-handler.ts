// Mock parser error handler
export enum ParserErrorCategory {
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
  MISSING_DATA = 'MISSING_DATA',
  UNEXPECTED_FORMAT = 'UNEXPECTED_FORMAT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

export class ParserError extends Error {
  category: ParserErrorCategory;
  details?: Record<string, unknown>;
  
  constructor(message: string, category: ParserErrorCategory, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ParserError';
    this.category = category;
    this.details = details;
  }
}

export const handleParsingError = jest.fn((error: Error, context?: Record<string, unknown>) => {
  // Just log the error in tests
  console.error('Mock parser error handler:', error.message, context);
  throw error; // Re-throw to maintain the same behavior
});

export const createParserError = jest.fn((
  message: string, 
  category: ParserErrorCategory, 
  details?: Record<string, unknown>
): ParserError => {
  return new ParserError(message, category, details);
}); 