/**
 * Parser Testing Utilities
 * 
 * This module provides tools for testing parsers with various error scenarios
 * to validate error handling and recovery strategies.
 */

import fs from 'fs';
import path from 'path';
import { 
  ParserErrorCategory,
  ParserError,
  createParserError,
  RecoveryStrategy
} from './parser-error-handler';
import { Logger } from '@/lib/logging';

// Create a logger for parser testing
const logger = new Logger({}, 'parser-tester');

/**
 * Test scenario configuration
 */
export interface TestScenario {
  name: string;
  description: string;
  errorType?: ParserErrorCategory;
  errorTrigger?: string;
  mockResponse?: any;
  expectedRecovery?: RecoveryStrategy;
  shouldSucceed?: boolean;
  injectionPoint?: 'before' | 'during' | 'after';
  delayMs?: number;
  metadata?: Record<string, any>;
}

/**
 * Test result
 */
export interface TestResult {
  scenario: TestScenario;
  success: boolean;
  error?: Error;
  recoveryStrategy?: RecoveryStrategy;
  recoverySucceeded?: boolean;
  duration: number;
  output?: any;
  metadata?: Record<string, any>;
}

/**
 * Collection of test results
 */
export interface TestResults {
  totalTests: number;
  successes: number;
  failures: number;
  results: TestResult[];
  duration: number;
}

/**
 * Test parser error handling with various scenarios
 */
export async function testParserErrorHandling<T>(
  parser: (input: any, options?: any) => Promise<T>,
  scenarios: TestScenario[],
  validInput: any,
  options: any = {}
): Promise<TestResults> {
  const startTime = Date.now();
  const results: TestResult[] = [];
  let successes = 0;
  let failures = 0;
  
  // Run each scenario
  for (const scenario of scenarios) {
    logger.info(`Running test scenario: ${scenario.name}`);
    
    const scenarioStartTime = Date.now();
    let success = false;
    let error: Error | undefined;
    let output: any;
    let recoveryStrategy: RecoveryStrategy | undefined;
    let recoverySucceeded = false;
    
    try {
      // Prepare input based on scenario
      const input = prepareInput(validInput, scenario);
      
      // Run the parser with the prepared input
      output = await parser(input, options);
      
      // If we get here, the test succeeded (no error)
      success = true;
      successes++;
      
      logger.info(`Scenario '${scenario.name}' completed successfully`);
    } catch (e) {
      // Capture the error
      error = e instanceof Error ? e : new Error(String(e));
      
      // Check if this was an expected failure
      if (!scenario.shouldSucceed) {
        // This was an expected failure, so it's actually a success for the test
        success = true;
        successes++;
        
        // Extract recovery strategy if it's a ParserError
        if (error instanceof ParserError) {
          recoveryStrategy = error.info.recovery;
          
          // Check if the recovery strategy matches expectations
          if (scenario.expectedRecovery && recoveryStrategy === scenario.expectedRecovery) {
            recoverySucceeded = true;
          }
        }
        
        logger.info(`Scenario '${scenario.name}' failed as expected with error: ${error.message}`);
      } else {
        // This was an unexpected failure
        success = false;
        failures++;
        
        logger.error(`Scenario '${scenario.name}' failed unexpectedly:`, error);
      }
    }
    
    const duration = Date.now() - scenarioStartTime;
    
    // Record the result
    results.push({
      scenario,
      success,
      error,
      recoveryStrategy,
      recoverySucceeded,
      duration,
      output,
      metadata: scenario.metadata
    });
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Return all results
  return {
    totalTests: scenarios.length,
    successes,
    failures,
    results,
    duration: totalDuration
  };
}

/**
 * Prepare input based on the test scenario
 */
function prepareInput(validInput: any, scenario: TestScenario): any {
  // If no error trigger is specified, return the valid input
  if (!scenario.errorTrigger) {
    return scenario.mockResponse || validInput;
  }
  
  // Handle different types of input
  if (typeof validInput === 'string') {
    // For string input, inject errors based on the scenario
    return injectErrorIntoString(validInput, scenario);
  } else if (Buffer.isBuffer(validInput)) {
    // For buffer input, convert to string, inject error, convert back
    const stringInput = validInput.toString('utf8');
    const modifiedString = injectErrorIntoString(stringInput, scenario);
    return Buffer.from(modifiedString, 'utf8');
  } else if (typeof validInput === 'object') {
    // For object input, create a modified clone
    return injectErrorIntoObject(validInput, scenario);
  }
  
  // Default: return the mock response or valid input
  return scenario.mockResponse || validInput;
}

/**
 * Inject an error into a string input
 */
function injectErrorIntoString(input: string, scenario: TestScenario): string {
  const { errorTrigger, errorType } = scenario;
  
  if (!errorTrigger) return input;
  
  switch (errorType) {
    case ParserErrorCategory.INVALID_INPUT:
      // Make the input invalid by corrupting it
      if (errorTrigger === 'malformed_html') {
        return input.replace(/<\/[a-z]+>/g, '</div>'); // Replace random closing tags
      } else if (errorTrigger === 'truncated') {
        return input.substring(0, Math.floor(input.length / 2)); // Truncate
      } else if (errorTrigger === 'corrupted') {
        return input.replace(/[a-zA-Z]/g, (c) => 
          String.fromCharCode(c.charCodeAt(0) + 1)); // Shift characters
      }
      break;
      
    case ParserErrorCategory.PARSING:
      // Inject syntax errors
      if (errorTrigger === 'invalid_tags') {
        return input.replace(/<([a-z]+)>/g, '<$1<>'); // Create invalid tags
      } else if (errorTrigger === 'unbalanced_tags') {
        return input.replace(/<\/([a-z]+)>/g, ''); // Remove closing tags
      }
      break;
      
    case ParserErrorCategory.STRUCTURE:
      // Modify document structure
      if (errorTrigger === 'missing_sections') {
        // Using a regex replacement function instead of the 's' flag
        // to handle multi-line matches
        return removeSectionElements(input);
      } else if (errorTrigger === 'empty_document') {
        return '<html><body></body></html>';
      }
      break;
      
    // Add additional cases based on error categories
  }
  
  return input;
}

/**
 * Remove section, div, and article elements from HTML
 * This is a replacement for the regex with 's' flag that was causing linting errors
 */
function removeSectionElements(input: string): string {
  // Split by opening tags
  const parts = input.split(/<(section|div|article)[^>]*>/i);
  let result = parts[0]; // Start with content before first match
  
  // Process each part (which starts after an opening tag)
  for (let i = 1; i < parts.length; i += 2) {
    const tagName = parts[i].toLowerCase(); // The captured tag name
    const content = parts[i + 1] || '';
    
    // Find the matching closing tag
    const closingTagIndex = findClosingTagIndex(content, tagName);
    
    if (closingTagIndex !== -1) {
      // Keep content after the closing tag
      result += content.substring(closingTagIndex + tagName.length + 3); // +3 for "</>"
    } else {
      // No closing tag found, keep original content
      result += content;
    }
  }
  
  return result;
}

/**
 * Find the index of a matching closing tag
 * Handles nested tags of the same type
 */
function findClosingTagIndex(content: string, tagName: string): number {
  let depth = 1; // Start with depth 1 (we've already found an opening tag)
  let pos = 0;
  
  while (pos < content.length && depth > 0) {
    // Find next opening tag
    const openingIndex = content.indexOf(`<${tagName}`, pos);
    
    // Find next closing tag
    const closingIndex = content.indexOf(`</${tagName}>`, pos);
    
    // If no more tags, break
    if (closingIndex === -1) {
      return -1;
    }
    
    // If we find an opening tag before a closing tag, increase depth
    if (openingIndex !== -1 && openingIndex < closingIndex) {
      depth++;
      pos = openingIndex + 1;
    } 
    // Otherwise decrease depth
    else {
      depth--;
      if (depth === 0) {
        return closingIndex;
      }
      pos = closingIndex + 1;
    }
  }
  
  return -1;
}

/**
 * Inject an error into an object input
 */
function injectErrorIntoObject(input: any, scenario: TestScenario): any {
  const { errorTrigger, errorType } = scenario;
  
  if (!errorTrigger) return input;
  
  // Create a deep copy
  const output = JSON.parse(JSON.stringify(input));
  
  switch (errorType) {
    case ParserErrorCategory.INVALID_INPUT:
      // Corrupt the object
      if (errorTrigger === 'missing_fields') {
        // Remove random fields
        for (const key of Object.keys(output)) {
          if (Math.random() > 0.7) delete output[key];
        }
      } else if (errorTrigger === 'wrong_types') {
        // Change types of fields
        for (const key of Object.keys(output)) {
          if (typeof output[key] === 'string') output[key] = 123;
          else if (typeof output[key] === 'number') output[key] = 'string';
        }
      }
      break;
      
    case ParserErrorCategory.STRUCTURE:
      // Modify object structure
      if (errorTrigger === 'empty_object') {
        return {};
      } else if (errorTrigger === 'nested_corruption') {
        // Corrupt nested objects
        corruptNestedObjects(output);
      }
      break;
      
    // Add additional cases based on error categories
  }
  
  return output;
}

/**
 * Recursively corrupt nested objects
 */
function corruptNestedObjects(obj: any): void {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (Math.random() > 0.7) {
        // Sometimes replace the object
        obj[key] = Math.random() > 0.5 ? 'corrupted' : [1, 2, 3];
      } else {
        // Otherwise corrupt its children
        corruptNestedObjects(obj[key]);
      }
    }
  }
}

/**
 * Generate standard test scenarios for parser testing
 */
export function generateStandardTestScenarios(): TestScenario[] {
  return [
    // Valid input scenario
    {
      name: 'valid_input',
      description: 'Processing valid, well-formed input',
      shouldSucceed: true
    },
    
    // Invalid input scenarios
    {
      name: 'malformed_html',
      description: 'Malformed HTML with incorrect tags',
      errorType: ParserErrorCategory.INVALID_INPUT,
      errorTrigger: 'malformed_html',
      expectedRecovery: RecoveryStrategy.PARTIAL,
      shouldSucceed: false
    },
    {
      name: 'truncated_content',
      description: 'Content that is truncated mid-document',
      errorType: ParserErrorCategory.INVALID_INPUT,
      errorTrigger: 'truncated',
      expectedRecovery: RecoveryStrategy.PARTIAL,
      shouldSucceed: false
    },
    
    // Parsing error scenarios
    {
      name: 'invalid_tags',
      description: 'HTML with invalid tag syntax',
      errorType: ParserErrorCategory.PARSING,
      errorTrigger: 'invalid_tags',
      expectedRecovery: RecoveryStrategy.FALLBACK,
      shouldSucceed: false
    },
    {
      name: 'unbalanced_tags',
      description: 'HTML with unbalanced tags',
      errorType: ParserErrorCategory.PARSING,
      errorTrigger: 'unbalanced_tags',
      expectedRecovery: RecoveryStrategy.FALLBACK,
      shouldSucceed: false
    },
    
    // Structure error scenarios
    {
      name: 'missing_sections',
      description: 'Document with important sections missing',
      errorType: ParserErrorCategory.STRUCTURE,
      errorTrigger: 'missing_sections',
      expectedRecovery: RecoveryStrategy.PARTIAL,
      shouldSucceed: false
    },
    {
      name: 'empty_document',
      description: 'Empty document with minimal structure',
      errorType: ParserErrorCategory.STRUCTURE,
      errorTrigger: 'empty_document',
      expectedRecovery: RecoveryStrategy.FALLBACK,
      shouldSucceed: false
    },
    
    // Network error simulation
    {
      name: 'network_timeout',
      description: 'Simulated network timeout',
      errorType: ParserErrorCategory.NETWORK,
      mockResponse: createParserError(
        ParserErrorCategory.NETWORK,
        'Network request timed out after 30000ms',
        { recovery: RecoveryStrategy.RETRY }
      ),
      expectedRecovery: RecoveryStrategy.RETRY,
      shouldSucceed: false
    },
    
    // Resource error simulation
    {
      name: 'memory_limit',
      description: 'Simulated memory limit exceeded',
      errorType: ParserErrorCategory.RESOURCE,
      mockResponse: createParserError(
        ParserErrorCategory.RESOURCE,
        'JavaScript heap out of memory',
        { recovery: RecoveryStrategy.SIMPLIFIED }
      ),
      expectedRecovery: RecoveryStrategy.SIMPLIFIED,
      shouldSucceed: false
    }
  ];
}

/**
 * Load test data from files
 */
export function loadTestData(
  directory: string,
  filePattern: string = '*.html'
): { [key: string]: string } {
  const testData: { [key: string]: string } = {};
  
  try {
    // Get a list of files matching the pattern
    const files = fs.readdirSync(directory)
      .filter(file => file.match(new RegExp(filePattern.replace('*', '.*'))));
    
    // Load each file
    for (const file of files) {
      const fullPath = path.join(directory, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      testData[file] = content;
    }
    
    logger.info(`Loaded ${Object.keys(testData).length} test files from ${directory}`);
    return testData;
  } catch (error) {
    logger.error(`Error loading test data from ${directory}:`, error);
    return {};
  }
}

/**
 * Save test results to a file
 */
export function saveTestResults(
  results: TestResults,
  outputPath: string
): void {
  try {
    // Create a simplified version for saving
    const simplifiedResults = {
      summary: {
        totalTests: results.totalTests,
        successes: results.successes,
        failures: results.failures,
        duration: results.duration,
        date: new Date().toISOString()
      },
      scenarios: results.results.map(result => ({
        name: result.scenario.name,
        success: result.success,
        errorMessage: result.error?.message,
        recoveryStrategy: result.recoveryStrategy,
        recoverySucceeded: result.recoverySucceeded,
        duration: result.duration
      }))
    };
    
    // Write to file
    fs.writeFileSync(
      outputPath,
      JSON.stringify(simplifiedResults, null, 2),
      'utf8'
    );
    
    logger.info(`Test results saved to ${outputPath}`);
  } catch (error) {
    logger.error(`Error saving test results to ${outputPath}:`, error);
  }
} 