import { parseResponse } from './response-parser';
import { extractJSON } from './json-extractors';
import { validateAgainstSchema } from './schema-validators';

// Mock dependencies
jest.mock('./json-extractors', () => ({
  extractJSON: jest.fn(),
  repairJSON: jest.fn((str) => str),
}));

jest.mock('./schema-validators', () => ({
  validateAgainstSchema: jest.fn(),
  extractValidFields: jest.fn((data) => data),
}));

describe('Response Parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully parses valid JSON response', () => {
    // Setup mocks
    const mockData = {
      company: 'Test Corp',
      filingDate: '2023-01-15',
      summary: 'This is a test summary'
    };
    
    (extractJSON as jest.Mock).mockReturnValue({
      raw: JSON.stringify(mockData),
      parsed: mockData,
      extractionMethod: 'codeBlock',
      success: true
    });
    
    (validateAgainstSchema as jest.Mock).mockReturnValue({
      valid: true,
      validatedData: mockData
    });
    
    // Execute
    const result = parseResponse('```json\n{"company":"Test Corp","filingDate":"2023-01-15","summary":"This is a test summary"}\n```', '10-K');
    
    // Verify
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(result.partial).toBeUndefined();
    expect(result.errors).toBeUndefined();
    expect(extractJSON).toHaveBeenCalledTimes(1);
    expect(validateAgainstSchema).toHaveBeenCalledTimes(1);
  });
  
  test('handles extraction failure gracefully', () => {
    // Setup mocks
    const errorMessage = 'Failed to extract JSON';
    
    (extractJSON as jest.Mock).mockReturnValue({
      raw: '',
      error: new Error(errorMessage),
      extractionMethod: 'none',
      success: false
    });
    
    // Execute
    const result = parseResponse('This is not JSON', '10-K');
    
    // Verify
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual([errorMessage]);
    expect(validateAgainstSchema).not.toHaveBeenCalled();
  });
  
  test('supports partial data extraction when validation fails', () => {
    // Setup mocks
    const mockData = {
      company: 'Test Corp',
      summary: 'This is a test summary'
    };
    
    (extractJSON as jest.Mock).mockReturnValue({
      raw: JSON.stringify(mockData),
      parsed: mockData,
      extractionMethod: 'codeBlock',
      success: true
    });
    
    (validateAgainstSchema as jest.Mock).mockReturnValue({
      valid: false,
      errors: ['Missing required fields'],
      partialData: mockData
    });
    
    // Execute
    const result = parseResponse('```json\n{"company":"Test Corp","summary":"This is a test summary"}\n```', '10-K', {
      allowPartial: true
    });
    
    // Verify
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(result.partial).toBe(true);
    expect(result.errors).toEqual(['Missing required fields']);
  });
  
  test('collects metrics when requested', () => {
    // Setup mocks
    const mockData = {
      company: 'Test Corp',
      filingDate: '2023-01-15',
      summary: 'This is a test summary'
    };
    
    (extractJSON as jest.Mock).mockReturnValue({
      raw: JSON.stringify(mockData),
      parsed: mockData,
      extractionMethod: 'codeBlock',
      success: true
    });
    
    (validateAgainstSchema as jest.Mock).mockReturnValue({
      valid: true,
      validatedData: mockData
    });
    
    // Execute
    const result = parseResponse('```json\n{"company":"Test Corp","filingDate":"2023-01-15","summary":"This is a test summary"}\n```', '10-K', {
      collectMetrics: true
    });
    
    // Verify
    expect(result.success).toBe(true);
    expect(result.metrics).toBeDefined();
    expect(result.metrics?.extractionSuccess).toBe(true);
    expect(result.metrics?.validationSuccess).toBe(true);
    expect(result.metrics?.extractionMethod).toBe('codeBlock');
    expect(result.metrics?.documentType).toBe('10-K');
    expect(typeof result.metrics?.extractionTimeMs).toBe('number');
    expect(typeof result.metrics?.validationTimeMs).toBe('number');
  });
}); 