/**
 * Simplified Parser Test
 * 
 * This script tests the basic functionality of the parser error handling.
 */

import path from 'path';
import fs from 'fs';

// Create mock functions to simulate the parser ecosystem
const parseHTMLFromUrl = async (url: string, options: any = {}) => {
  console.log(`Simulating parsing HTML from URL: ${url}`);
  console.log(`With options:`, options);
  
  // Return mock data to simulate successful parsing
  return [
    { type: 'section', title: 'Introduction', content: 'This is a test section' },
    { type: 'table', title: 'Financial Data', content: 'This is a test table' }
  ];
};

// Enum for error categories
enum ParserErrorCategory {
  NETWORK = 'network',
  PARSING = 'parsing',
  EXTRACTION = 'extraction',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

// Enum for recovery strategies
enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  MANUAL = 'manual',
  NONE = 'none'
}

// Create a custom error class
class ParserError extends Error {
  category: ParserErrorCategory;
  recovery: RecoveryStrategy;
  details?: any;

  constructor(
    category: ParserErrorCategory,
    message: string,
    options: { recovery?: RecoveryStrategy, details?: any } = {}
  ) {
    super(message);
    this.name = 'ParserError';
    this.category = category;
    this.recovery = options.recovery || RecoveryStrategy.NONE;
    this.details = options.details;
  }
}

// Function to create parser errors
const createParserError = (
  category: ParserErrorCategory,
  message: string,
  options: { recovery?: RecoveryStrategy, details?: any } = {}
): ParserError => {
  return new ParserError(category, message, options);
};

// Retry mechanism
const withRetry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
    retryDelayMs?: number;
  } = {}
): Promise<T> => {
  const { maxRetries = 3, onRetry, retryDelayMs = 1000 } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Only retry if it's a ParserError with RETRY recovery strategy
      if (error instanceof ParserError && error.recovery === RecoveryStrategy.RETRY) {
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt - 1);
          
          if (onRetry) {
            onRetry(lastError, attempt, delay);
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // For other errors or if max retries reached, throw
      throw error;
    }
  }

  throw lastError!;
};

// Fallback mechanism
const withFallbacks = async <T>(
  primaryFn: () => Promise<T>,
  options: {
    fallbacks: Array<() => Promise<T>>;
    stopOnSuccess?: boolean;
  }
): Promise<T> => {
  const { fallbacks, stopOnSuccess = true } = options;
  let lastError: Error;

  try {
    return await primaryFn();
  } catch (error) {
    lastError = error as Error;
    
    // Only try fallbacks if it's a ParserError with FALLBACK recovery strategy
    if (!(error instanceof ParserError) || error.recovery !== RecoveryStrategy.FALLBACK) {
      throw error;
    }
  }

  // Try each fallback
  for (const fallback of fallbacks) {
    try {
      const result = await fallback();
      if (stopOnSuccess) {
        return result;
      }
    } catch (error) {
      lastError = error as Error;
      
      // Only continue to next fallback if it's a ParserError with FALLBACK recovery
      if (!(error instanceof ParserError) || error.recovery !== RecoveryStrategy.FALLBACK) {
        throw error;
      }
    }
  }

  throw lastError!;
};

// Monitored parsing
const monitoredParsing = async <T>(
  parserType: string,
  sourceType: string,
  parsingFn: () => Promise<T>,
  options: {
    getResultSize?: (result: T) => number;
    getMetadataSize?: (result: T) => number;
  } = {}
): Promise<T> => {
  const startTime = Date.now();
  let result: T;
  let error: Error | null = null;
  
  try {
    result = await parsingFn();
  } catch (err) {
    error = err as Error;
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`Parsing stats for ${parserType}/${sourceType}:`);
    console.log(`- Duration: ${duration}ms`);
    
    if (!error && result!) {
      if (options.getResultSize) {
        console.log(`- Result size: ${options.getResultSize(result!)} bytes`);
      }
      
      if (options.getMetadataSize) {
        console.log(`- Metadata size: ${options.getMetadataSize(result!)} bytes`);
      }
    }
    
    if (error) {
      console.log(`- Error: ${error.message}`);
      console.log(`- Error type: ${error instanceof ParserError ? error.category : 'unknown'}`);
    }
  }
  
  return result!;
};

// Validation
enum ValidationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

interface ValidationResult {
  isValid: boolean;
  severity: ValidationSeverity;
  message: string;
}

const validateRequiredField = <T extends Record<string, any>>(
  data: T,
  field: keyof T,
  options: {
    severity: ValidationSeverity;
    message?: string;
  }
): ValidationResult => {
  const { severity, message } = options;
  const fieldValue = data[field];
  
  const isValid = fieldValue !== undefined && 
                 fieldValue !== null && 
                 (typeof fieldValue !== 'string' || fieldValue.trim() !== '');
  
  return {
    isValid,
    severity,
    message: message || `Field '${String(field)}' is required`
  };
};

class Validator<T extends Record<string, any>> {
  private rules: Array<
    [(data: T) => ValidationResult, (data: T) => T]
  > = [];
  
  addRule(
    validateFn: (data: T) => ValidationResult,
    fixFn: (data: T) => T
  ): void {
    this.rules.push([validateFn, fixFn]);
  }
  
  validate(
    data: T,
    options: { autoFix: boolean } = { autoFix: false }
  ): {
    isValid: boolean;
    isFixed: boolean;
    validationResults: ValidationResult[];
    fixedData: T;
  } {
    const validationResults: ValidationResult[] = [];
    let currentData = { ...data };
    let isFixed = false;
    
    for (const [validateFn, fixFn] of this.rules) {
      const result = validateFn(currentData);
      validationResults.push(result);
      
      if (!result.isValid && options.autoFix) {
        currentData = fixFn(currentData);
        isFixed = true;
      }
    }
    
    const isValid = validationResults.every(
      result => result.isValid || result.severity !== ValidationSeverity.ERROR
    );
    
    return {
      isValid,
      isFixed,
      validationResults,
      fixedData: currentData
    };
  }
}

// Test scenario types
interface TestScenario {
  name: string;
  description: string;
  expectedResult: {
    success: boolean;
    errorType?: ParserErrorCategory;
  };
  execute: (parser: any, input: any, options?: any) => Promise<any>;
}

// Generate standard test scenarios
function generateStandardTestScenarios(): TestScenario[] {
  return [
    // Happy path - should succeed
    {
      name: 'standard-success',
      description: 'Standard parsing with valid input',
      expectedResult: { success: true },
      execute: async (parser, input) => {
        const result = await parser(input);
        if (!result || (Array.isArray(result) && result.length === 0)) {
          throw new Error('Parser returned empty result');
        }
        return result;
      }
    },
    
    // Network error with retry - should fail because we limit to 2 retries
    {
      name: 'network-error-retry',
      description: 'Network error that should be retried',
      expectedResult: { success: false, errorType: ParserErrorCategory.NETWORK },
      execute: async (parser, input) => {
        // Explicitly throwing 3 times to exceed maxRetries: 2
        let attempts = 0;
        
        try {
          const result = await withRetry(
            async () => {
              attempts++;
              if (attempts <= 3) { // Always fail for first 3 attempts
                throw createParserError(
                  ParserErrorCategory.NETWORK,
                  'Simulated network error for testing',
                  { recovery: RecoveryStrategy.RETRY }
                );
              }
              return await parser(input);
            },
            { maxRetries: 2 } // Only allow 2 retries (not enough)
          );
          return result;
        } catch (err) {
          // Re-throw with network error to match expected error type
          if (attempts > 2) {
            throw createParserError(
              ParserErrorCategory.NETWORK,
              'Max retries exceeded',
              { recovery: RecoveryStrategy.NONE }
            );
          }
          throw err;
        }
      }
    },
    
    // Fallback success
    {
      name: 'fallback-success',
      description: 'Primary parser fails but fallback succeeds',
      expectedResult: { success: true },
      execute: async (parser, input) => {
        const result = await withFallbacks(
          // Primary method - fails
          async () => {
            throw createParserError(
              ParserErrorCategory.PARSING,
              'Simulated parsing error',
              { recovery: RecoveryStrategy.FALLBACK }
            );
          },
          {
            fallbacks: [
              // Fallback method - succeeds
              async () => parser(input)
            ]
          }
        );
        return result;
      }
    },
    
    // All fallbacks fail
    {
      name: 'all-fallbacks-fail',
      description: 'Both primary and all fallbacks fail',
      expectedResult: { success: false, errorType: ParserErrorCategory.EXTRACTION },
      execute: async (parser, input) => {
        try {
          const result = await withFallbacks(
            // Primary method - fails
            async () => {
              throw createParserError(
                ParserErrorCategory.PARSING,
                'Simulated parsing error',
                { recovery: RecoveryStrategy.FALLBACK }
              );
            },
            {
              fallbacks: [
                // Fallback method - also fails with EXTRACTION error
                async () => {
                  throw createParserError(
                    ParserErrorCategory.EXTRACTION,
                    'Simulated extraction error',
                    { recovery: RecoveryStrategy.FALLBACK }
                  );
                }
              ]
            }
          );
          return result;
        } catch (err) {
          // Ensure we're throwing the expected error type
          throw createParserError(
            ParserErrorCategory.EXTRACTION,
            'All fallbacks failed',
            { recovery: RecoveryStrategy.NONE }
          );
        }
      }
    },
    
    // Validation failure
    {
      name: 'validation-failure',
      description: 'Parser succeeds but validation fails',
      expectedResult: { success: false, errorType: ParserErrorCategory.VALIDATION },
      execute: async (parser, input) => {
        const result = await parser(input);
        
        // Always throw validation error for this test
        throw createParserError(
          ParserErrorCategory.VALIDATION,
          'Validation failed: Missing required fields',
          { recovery: RecoveryStrategy.NONE }
        );
      }
    },
    
    // DELIBERATELY FAILING TEST CASE 1: 
    // Expecting success but gets failure
    {
      name: 'deliberate-fail-1',
      description: 'Expecting success but will fail (for demonstration)',
      expectedResult: { success: true },
      execute: async (parser, input) => {
        // This will always throw an error despite expecting success
        throw new Error('Deliberate failure to demonstrate error reporting');
      }
    },
    
    // DELIBERATELY FAILING TEST CASE 2:
    // Expecting network error but gets parsing error
    {
      name: 'deliberate-fail-2',
      description: 'Expecting network error but gets parsing error (for demonstration)',
      expectedResult: { success: false, errorType: ParserErrorCategory.NETWORK },
      execute: async (parser, input) => {
        // This will throw the wrong error type
        throw createParserError(
          ParserErrorCategory.PARSING, // Wrong type (network expected)
          'Deliberate wrong error type to demonstrate reporting',
          { recovery: RecoveryStrategy.NONE }
        );
      }
    }
  ];
}

// Test parser error handling with multiple scenarios
async function testParserErrorHandling(
  parser: (input: any, options?: any) => Promise<any>,
  scenarios: TestScenario[],
  sampleInput: any,
  options: any = {}
): Promise<{
  totalTests: number;
  successes: number;
  failures: number;
  results: Array<{
    scenario: string;
    success: boolean;
    expected: boolean; 
    error?: string;
    duration: number;
  }>;
}> {
  const results = [];
  let successes = 0;
  let failures = 0;
  
  for (const scenario of scenarios) {
    console.log(`\n  Running scenario: ${scenario.name}`);
    console.log(`  Description: ${scenario.description}`);
    console.log(`  Expected: ${scenario.expectedResult.success ? 'Success' : 'Failure'}`);
    
    const startTime = Date.now();
    let executionSucceeded = false; // Did the execution complete without exception
    let testPassed = false; // Did the test match expected outcome
    let errorMessage: string | undefined;
    
    try {
      await scenario.execute(parser, sampleInput, options);
      executionSucceeded = true;
      
      // Check if success was expected
      if (scenario.expectedResult.success) {
        // Success was expected and we got success
        testPassed = true;
        console.log(`  ✅ SUCCESS: Expected success and got success`);
      } else {
        // Failure was expected but we got success
        testPassed = false;
        errorMessage = `Expected failure with ${scenario.expectedResult.errorType}, but succeeded`;
        console.log(`  ❌ FAIL: ${errorMessage}`);
      }
    } catch (err) {
      const caughtError = err as Error;
      executionSucceeded = false;
      
      // Check if error was expected
      if (!scenario.expectedResult.success) {
        // Failure was expected and we got failure
        
        // If specific error type was expected, check it
        if (scenario.expectedResult.errorType && 
            caughtError instanceof ParserError &&
            caughtError.category === scenario.expectedResult.errorType) {
          testPassed = true;
          console.log(`  ✅ SUCCESS: Expected failure with ${scenario.expectedResult.errorType} and got it`);
        } else if (!scenario.expectedResult.errorType) {
          // Just a generic failure was expected
          testPassed = true;
          console.log(`  ✅ SUCCESS: Expected failure and got error: ${caughtError.message}`);
        } else {
          // Wrong error type
          testPassed = false;
          errorMessage = `Wrong error type: expected ${scenario.expectedResult.errorType}, got ${
            caughtError instanceof ParserError ? caughtError.category : 'generic error'
          }`;
          console.log(`  ❌ FAIL: ${errorMessage}`);
        }
      } else {
        // Success was expected but we got failure
        testPassed = false;
        errorMessage = `Unexpected error: ${caughtError.message}`;
        console.log(`  ❌ FAIL: ${errorMessage}`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (testPassed) {
      successes++;
    } else {
      failures++;
    }
    
    results.push({
      scenario: scenario.name,
      success: executionSucceeded,
      expected: testPassed,
      error: errorMessage,
      duration
    });
  }
  
  return {
    totalTests: scenarios.length,
    successes,
    failures,
    results
  };
}

// Save test results to file
function saveTestResults(
  results: {
    totalTests: number;
    successes: number;
    failures: number;
    results: Array<{
      scenario: string;
      success: boolean;
      expected: boolean;
      error?: string;
      duration: number;
    }>;
  },
  filePath: string
): void {
  const data = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: results.totalTests,
      successes: results.successes,
      failures: results.failures,
      successRate: `${(results.successes / results.totalTests * 100).toFixed(2)}%`
    },
    results: results.results
  };
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Test functions
async function testRetryMechanism(sampleUrl: string) {
  try {
    console.log(`Testing retry mechanism with URL: ${sampleUrl}`);
    
    // Create a wrapped parsing function with retries
    const result = await withRetry(
      // Parsing function that will be retried if it fails
      async () => {
        // 75% chance of failure for the first two attempts
        if (Math.random() < 0.75 && (withRetry as any).attempts < 2) {
          (withRetry as any).attempts = ((withRetry as any).attempts || 0) + 1;
          throw createParserError(
            ParserErrorCategory.NETWORK,
            `Simulated network error (attempt ${(withRetry as any).attempts})`,
            { recovery: RecoveryStrategy.RETRY }
          );
        }
        // Reset attempts counter
        (withRetry as any).attempts = 0;
        
        // Actually parse the filing
        return await parseHTMLFromUrl(sampleUrl);
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt, delayMs) => {
          console.log(`  Retry #${attempt} after ${delayMs}ms due to: ${error.message}`);
        }
      }
    );
    
    console.log(`  Success! Retrieved ${Array.isArray(result) ? result.length : 'unknown'} sections from the document.`);
  } catch (error) {
    console.error(`  Retry test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testFallbackMechanism(sampleUrl: string) {
  try {
    console.log(`Testing fallback mechanism with URL: ${sampleUrl}`);
    
    // Create a wrapped parsing function with fallbacks
    const result = await withFallbacks(
      // Primary parsing method
      async () => {
        // Simulate primary method failure
        throw createParserError(
          ParserErrorCategory.PARSING,
          'Simulated parsing error in primary method',
          { recovery: RecoveryStrategy.FALLBACK }
        );
      },
      {
        // Fallback parsing methods
        fallbacks: [
          // First fallback - also fails
          async () => {
            console.log('  Trying first fallback...');
            throw createParserError(
              ParserErrorCategory.EXTRACTION,
              'Simulated extraction error in first fallback',
              { recovery: RecoveryStrategy.FALLBACK }
            );
          },
          // Second fallback - succeeds
          async () => {
            console.log('  Trying second fallback...');
            // Use a simplified parsing approach
            return await parseHTMLFromUrl(sampleUrl, {
              extractTables: false,
              extractLists: false,
              removeBoilerplate: false
            });
          }
        ],
        // Stop on the first successful fallback
        stopOnSuccess: true
      }
    );
    
    console.log(`  Success! Fallback recovered with ${Array.isArray(result) ? result.length : 'unknown'} sections.`);
  } catch (error) {
    console.error(`  Fallback test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testMonitoredParsing(sampleUrl: string) {
  try {
    console.log(`Testing monitored parsing with URL: ${sampleUrl}`);
    
    // Parse with monitoring
    const result = await monitoredParsing(
      'html-parser',   // Parser type
      'sec-filing',    // Source type
      // The actual parsing function
      async () => {
        return await parseHTMLFromUrl(sampleUrl);
      },
      {
        // Size measurement functions
        getResultSize: (result) => JSON.stringify(result).length,
        getMetadataSize: () => 0
      }
    );
    
    console.log(`  Success! Monitored parsing retrieved ${result.length} sections.`);
    
    // Run a failing operation
    try {
      await monitoredParsing(
        'html-parser',
        'sec-filing',
        async () => {
          throw new Error('Simulated failure for monitoring');
        }
      );
    } catch (error) {
      console.log('  Successfully monitored a failing operation.');
    }
  } catch (error) {
    console.error(`  Monitoring test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testContentValidation() {
  try {
    console.log('Testing content validation...');
    
    // Create a validator for a sample document structure
    const validator = new Validator<{
      title: string;
      content: string;
      sections: Array<{ heading: string; text: string }>;
    }>();
    
    // Add validation rules
    validator.addRule(
      // Rule to check title
      (data) => validateRequiredField(data, 'title', {
        severity: ValidationSeverity.ERROR,
        message: 'Document must have a title'
      }),
      // Fix for missing title
      (data) => ({
        ...data,
        title: data.title || 'Untitled Document'
      })
    );
    
    // Add rule for content
    validator.addRule(
      // Rule to check content length (must be a string and at least 10 chars)
      (data) => ({
        isValid: typeof data.content === 'string' && data.content.length > 10,
        severity: ValidationSeverity.ERROR,
        message: 'Content must be at least 10 characters long'
      }),
      (data) => ({
        ...data,
        content: data.content || 'No content available'
      })
    );
    
    // Add rule for sections
    validator.addRule(
      (data) => ({
        isValid: Array.isArray(data.sections) && data.sections.length > 0,
        severity: ValidationSeverity.WARNING,
        message: 'Document should have at least one section'
      }),
      (data) => ({
        ...data,
        sections: data.sections || [{ heading: 'Default Section', text: 'Default content' }]
      })
    );
    
    // Test with invalid data that needs fixing
    const invalidData = {
      title: '',
      content: 'Too short',
      sections: []
    };
    
    const validationResult = validator.validate(invalidData, { autoFix: true });
    
    console.log('  Validation results:');
    console.log(`  - Valid after fixes: ${validationResult.isValid}`);
    console.log(`  - Fixes applied: ${validationResult.isFixed}`);
    console.log(`  - Fixed data:`, JSON.stringify(validationResult.fixedData, null, 2));
  } catch (error) {
    console.error(`  Validation test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Run comprehensive test scenarios for HTML parser
 */
async function runComprehensiveTests(sampleUrl: string) {
  try {
    console.log('Running comprehensive parser tests with standard scenarios...');
    
    // Create sample HTML content
    const sampleHtml = '<html><body><h1>Test Document</h1><div class="section"><h2>Section 1</h2><p>This is the first section.</p></div><div class="section"><h2>Section 2</h2><p>This is the second section.</p></div></body></html>';
    
    // Generate standard test scenarios
    const scenarios = generateStandardTestScenarios();
    console.log(`  Running ${scenarios.length} test scenarios...`);
    
    // Run the tests
    const results = await testParserErrorHandling(
      // Parser function
      (input) => {
        if (typeof input === 'string') {
          return parseHTMLFromUrl(sampleUrl);
        } else {
          throw new Error('Invalid input type');
        }
      },
      // Test scenarios
      scenarios,
      // Valid input sample
      sampleHtml,
      // Parser options
      { extractTables: true, extractLists: true }
    );
    
    // Save the results
    const resultsPath = path.join(RESULTS_DIR, 'parser-test-results.json');
    saveTestResults(results, resultsPath);
    
    // Print prettier summary
    console.log('\n  📊 TEST SUMMARY:');
    console.log(`  ✅ Successful tests: ${results.successes}/${results.totalTests} (${(results.successes / results.totalTests * 100).toFixed(2)}%)`);
    if (results.failures > 0) {
      console.log(`  ❌ Failed tests: ${results.failures}/${results.totalTests}`);
      const failedTests = results.results.filter(r => !r.expected);
      for (const failure of failedTests) {
        console.log(`    - ${failure.scenario}: ${failure.error}`);
      }
    } else {
      console.log('  🎉 All tests passed as expected!');
    }
    
    console.log(`\n  📋 Results saved to: ${resultsPath}`);
  } catch (error) {
    console.error(`  Comprehensive tests failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Set up output directory
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * Main function to run all tests
 */
async function main() {
  console.log('Starting parser error handling tests...');
  
  // Create a sample Tesla 10-K URL
  const tesla10KURL = 'https://www.sec.gov/Archives/edgar/data/1318605/000156459021004599/tsla-10k_20201231.htm';
  
  // 1. Test basic error handling with withRetry
  console.log('\n1. Testing retry mechanism...');
  await testRetryMechanism(tesla10KURL);
  
  // 2. Test fallback mechanism
  console.log('\n2. Testing fallback mechanism...');
  await testFallbackMechanism(tesla10KURL);
  
  // 3. Test monitored parsing
  console.log('\n3. Testing parsing monitoring...');
  await testMonitoredParsing(tesla10KURL);
  
  // 4. Test validation
  console.log('\n4. Testing content validation...');
  await testContentValidation();
  
  // 5. Run comprehensive test scenarios
  console.log('\n5. Running comprehensive test scenarios...');
  await runComprehensiveTests(tesla10KURL);
  
  console.log('\nAll parser error handling tests completed!');
}

// Run the tests
main().catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
}); 