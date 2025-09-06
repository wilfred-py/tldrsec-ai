import { parseResponse } from '../parsers/response-parser';
import { validateRequiredFields, ensureMinimumFields } from '../parsers/response-fixer';
import { SECFilingType } from '../prompts/prompt-types';

// Mock the modules we don't need to test
jest.mock('../../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn()
  }
}));

jest.mock('../../logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  getComponentLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

// Mock the Claude client
jest.mock('../claude-client', () => ({
  ClaudeClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      completion: '{"company": "Test Company", "summary": "Test summary"}'
    })
  }))
}));

// Mock parseResponse to simulate actual behavior
jest.mock('../parsers/response-parser', () => ({
  parseResponse: jest.fn().mockImplementation((text) => {
    // For testing different scenarios
    if (text.includes('```json')) {
      // Valid JSON in code block
      try {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/m);
        if (jsonMatch && jsonMatch[1]) {
          const parsed = JSON.parse(jsonMatch[1].trim());
          return {
            success: true,
            data: parsed,
            extractionMethod: 'codeBlock'
          };
        }
      } catch {
        // Fall through to fallback
      }
    }
    
    // For all other cases, simulate parse failure
    return {
      success: false,
      errors: ['Failed to parse JSON'],
      extractionMethod: 'failed'
    };
  })
}));

describe('SEC Filing JSON Parsing Fallback', () => {
  // This is the function we're testing, extracted from summarize.ts
  async function processClaudeResponse(responseText: string, filingType: SECFilingType, companyName: string = 'Unknown Company') {
    let parsingDuration = 0;
    const parsingStart = Date.now();
    
    try {
      // First attempt: Try to parse the response as JSON
      const parsedResult = parseResponse(responseText, filingType);
      parsingDuration = Date.now() - parsingStart;
      
      if (parsedResult.success && parsedResult.data) {
        // Validate the parsed JSON against required fields for this filing type
        const validation = validateRequiredFields(parsedResult.data, filingType);
        
        if (validation.valid) {
          return {
            success: true,
            data: parsedResult.data,
            parsingDuration,
            method: 'direct_parse'
          };
        } else {
          // JSON was parsed but missing required fields, use fallback
          const fallbackData = ensureMinimumFields(responseText, filingType, companyName);
          return {
            success: true,
            data: fallbackData,
            parsingDuration,
            method: 'fallback_with_validation_failure',
            missingFields: validation.missingFields
          };
        }
      } else {
        // Parsing failed, use fallback
        const fallbackData = ensureMinimumFields(responseText, filingType, companyName);
        return {
          success: true,
          data: fallbackData,
          parsingDuration,
          method: 'fallback_with_parse_failure',
          error: parsedResult.errors ? parsedResult.errors.join(', ') : 'Unknown parsing error'
        };
      }
    } catch (error) {
      // Something went wrong during parsing or validation, use fallback
      parsingDuration = Date.now() - parsingStart;
      const fallbackData = ensureMinimumFields(responseText, filingType, companyName);
      return {
        success: true,
        data: fallbackData,
        parsingDuration,
        method: 'fallback_with_exception',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  it('should successfully parse valid JSON response', async () => {
    const validResponse = `
      Here's the summary of the Form 4 filing:
      
      \`\`\`json
      {
        "company": "Acme Corp",
        "filerName": "John Smith",
        "relationship": "Director",
        "transactions": [
          {
            "type": "Purchase",
            "shares": 1000,
            "price": 10.50
          }
        ],
        "summary": "John Smith, Director of Acme Corp, purchased 1000 shares at $10.50 per share."
      }
      \`\`\`
    `;
    
    const result = await processClaudeResponse(validResponse, '4' as SECFilingType);
    
    expect(result.success).toBe(true);
    expect(result.method).toBe('direct_parse');
    expect(result.data).toHaveProperty('company', 'Acme Corp');
    expect(result.data).toHaveProperty('filerName', 'John Smith');
    expect(result.data.transactions).toHaveLength(1);
  });
  
  it('should use fallback for malformed JSON', async () => {
    const malformedResponse = `
      Here's a summary of the Form 4 filing:
      
      {
        "company": "Acme Corp",
        "filerName": "John Smith",
        "relationship": "Director",
        "summary": "John Smith, Director, reported no transactions in this filing."
      
      The filing indicates no transactions were reported.
    `;
    
    const result = await processClaudeResponse(malformedResponse, '4' as SECFilingType);
    
    expect(result.success).toBe(true);
    expect(result.method).toBe('fallback_with_parse_failure');
    expect(result.data).toBeDefined();
    expect(result.data).toHaveProperty('company');
    expect(result.data).toHaveProperty('transactions');
    expect(Array.isArray(result.data.transactions)).toBe(true);
  });
  
  it('should use fallback for valid JSON missing required fields', async () => {
    const incompleteResponse = `
      Here's the summary of the Form 4 filing:
      
      \`\`\`json
      {
        "company": "Acme Corp",
        "filerName": "John Smith",
        "relationship": "Director"
      }
      \`\`\`
      
      The filing indicates no transactions were reported.
    `;
    
    const result = await processClaudeResponse(incompleteResponse, '4' as SECFilingType);
    
    expect(result.success).toBe(true);
    expect(result.method).toBe('fallback_with_validation_failure');
    expect(result.data).toBeDefined();
    expect(result.data).toHaveProperty('company');
    expect(result.data).toHaveProperty('transactions');
    expect(Array.isArray(result.data.transactions)).toBe(true);
    expect(result.missingFields).toBeDefined();
  });
  
  it('should use fallback for exceptions during processing', async () => {
    // Mock parseResponse to throw an exception
    const mockParseResponse = jest.spyOn({ parseResponse }, 'parseResponse')
      .mockImplementation(() => {
        throw new Error('Unexpected error during parsing');
      });
    
    const response = `Some text that will cause an error`;
    
    const result = await processClaudeResponse(response, '4' as SECFilingType);
    
    expect(result.success).toBe(true);
    expect(result.method).toBe('fallback_with_exception');
    expect(result.data).toBeDefined();
    expect(result.data).toHaveProperty('company');
    expect(result.data).toHaveProperty('transactions');
    expect(Array.isArray(result.data.transactions)).toBe(true);
    expect(result.error).toBeDefined();
    
    // Restore the original mock
    mockParseResponse.mockRestore();
  });
  
  it('should handle Form 8-K filings', async () => {
    const response = `
      Here's the summary of the Form 8-K filing:
      
      \`\`\`json
      {
        "company": "Acme Corp",
        "eventType": "Change in Directors or Principal Officers",
        "summary": "Acme Corp announced the appointment of Jane Doe as CFO effective immediately."
      }
      \`\`\`
    `;
    
    const result = await processClaudeResponse(response, '8-K' as SECFilingType);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('company', 'Acme Corp');
    expect(result.data).toHaveProperty('eventType', 'Change in Directors or Principal Officers');
  });
  
  it('should handle Schedule 13G filings', async () => {
    const response = `
      Here's the summary of the Schedule 13G filing:
      
      \`\`\`json
      {
        "company": "XYZ Corporation",
        "investor": "BlackRock Inc.",
        "ownershipPercent": "7.5%",
        "summary": "BlackRock Inc. has reported a 7.5% ownership stake in XYZ Corporation."
      }
      \`\`\`
    `;
    
    const result = await processClaudeResponse(response, 'SC 13G' as SECFilingType);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('company', 'XYZ Corporation');
    expect(result.data).toHaveProperty('investor', 'BlackRock Inc.');
    expect(result.data).toHaveProperty('ownershipPercent', '7.5%');
  });
});
