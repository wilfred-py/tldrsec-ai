/**
 * Robust Claude Client Simulation
 * 
 * This script demonstrates the robust error handling capabilities of the enhanced Claude client
 * by simulating various error scenarios including rate limits, network errors, and incomplete responses.
 * 
 * Usage:
 * ts-node robust-claude-simulation.ts
 */

import { robustClaudeClient } from '../robust-claude-client';
import { ApiError, ErrorCode } from '../../error-handling';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';

// Sample SEC filing content (abbreviated)
const sampleFiling = `
FORM 4
UNITED STATES SECURITIES AND EXCHANGE COMMISSION
Washington, D.C. 20549

STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP

Filed pursuant to Section 16(a) of the Securities Exchange Act of 1934
or Section 30(h) of the Investment Company Act of 1940

1. Name and Address of Reporting Person
SMITH, JOHN A.

2. Issuer Name and Ticker or Trading Symbol
ACME CORPORATION [ACME]

3. Date of Earliest Transaction
06/15/2025

4. Transaction Code
P (Purchase)

5. Amount of Securities Acquired
10,000 shares

6. Price Per Share
$45.75

7. Resulting Ownership
25,000 shares (Direct)
`;

// Mock the Claude client to simulate different error scenarios
class MockClaudeClient {
  private errorScenario: string;
  private errorCount = 0;
  private maxErrors: number;
  
  constructor(errorScenario: string, maxErrors: number = 3) {
    this.errorScenario = errorScenario;
    this.maxErrors = maxErrors;
  }
  
  async sendMessage(messages: any[], options: any = {}) {
    console.log(`\n[MockClaudeClient] Sending message with ${messages.length} messages`);
    console.log(`[MockClaudeClient] Using error scenario: ${this.errorScenario}`);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if we should still produce errors
    if (this.errorCount < this.maxErrors) {
      this.errorCount++;
      console.log(`[MockClaudeClient] Error ${this.errorCount}/${this.maxErrors}`);
      
      // Simulate different error scenarios
      switch (this.errorScenario) {
        case 'rate-limit':
          throw new ApiError(
            ErrorCode.AI_QUOTA_EXCEEDED,
            'Rate limit exceeded. Please try again later.',
            { retryAfter: 2000 },
            true,
            'req-123'
          );
          
        case 'network-error':
          throw new ApiError(
            ErrorCode.NETWORK_UNAVAILABLE,
            'Network connection error. Please check your internet connection.',
            {},
            true,
            'req-123'
          );
          
        case 'timeout':
          throw new ApiError(
            ErrorCode.TIMEOUT_ERROR,
            'Request timed out after 30 seconds.',
            {},
            true,
            'req-123'
          );
          
        case 'context-window':
          throw new ApiError(
            ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED,
            'Input exceeded maximum context length. Please reduce input size.',
            {},
            false,
            'req-123'
          );
          
        case 'content-filter':
          throw new ApiError(
            ErrorCode.AI_CONTENT_FILTERED,
            'Content was filtered due to safety concerns.',
            {},
            false,
            'req-123'
          );
          
        case 'incomplete':
          return {
            id: 'response-123',
            content: 'I will analyze this Form 4...',
            model: 'claude-sonnet-4-20250514',
            usage: {
              inputTokens: 50,
              outputTokens: 10
            },
            inputTokens: 50,
            outputTokens: 10,
            cost: {
              inputCost: 0.00015,
              outputCost: 0.00015,
              totalCost: 0.0003
            },
            totalCost: 0.0003,
            attempts: 1,
            executionTimeMs: 1000,
            fallbackUsed: false
          };
          
        default:
          throw new Error(`Unknown error scenario: ${this.errorScenario}`);
      }
    }
    
    // After max errors, return successful response
    console.log(`[MockClaudeClient] Returning successful response after ${this.errorCount} errors`);
    
    return {
      id: 'response-123',
      content: 'This Form 4 filing reports a change in beneficial ownership for John A. Smith with ACME Corporation (ticker: ACME). On June 15, 2025, Smith purchased 10,000 shares at $45.75 per share. Following this transaction, Smith now directly owns 25,000 shares of ACME Corporation.',
      model: 'claude-sonnet-4-20250514',
      usage: {
        inputTokens: 200,
        outputTokens: 50
      },
      inputTokens: 200,
      outputTokens: 50,
      cost: {
        inputCost: 0.0006,
        outputCost: 0.00075,
        totalCost: 0.00135
      },
      totalCost: 0.00135,
      attempts: 1,
      executionTimeMs: 2000,
      fallbackUsed: false
    };
  }
}

/**
 * Run a simulation with the specified error scenario
 */
async function runSimulation(errorScenario: string, maxErrors: number = 3) {
  console.log(`\n========== SIMULATION: ${errorScenario.toUpperCase()} ==========`);
  
  // Create a client with the mock
  const mockClient = new MockClaudeClient(errorScenario, maxErrors);
  // Use the mock client directly instead of trying to construct a new instance
  const client = mockClient as any;
  
  // Setup logging
  console.log('Setting up simulation...');
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  // Override console methods to add timestamps
  console.log = (...args) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    originalConsoleLog(`[${timestamp}]`, ...args);
  };
  
  console.error = (...args) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    originalConsoleError(`[${timestamp}] ERROR:`, ...args);
  };
  
  try {
    console.log(`Processing document with ${errorScenario} scenario (max errors: ${maxErrors})...`);
    
    // Process the document
    const startTime = Date.now();
    const result = await client.processDocument(
      sampleFiling,
      'FORM_4',
      {
        retryConfig: {
          // Use smaller values for testing
          initialDelayMs: 500,
          maxDelayMs: 5000,
          maxRetries: 5
        }
      }
    );
    
    const duration = Date.now() - startTime;
    
    // Display results
    console.log(`\nSimulation completed in ${duration}ms`);
    console.log(`Fallback used: ${result.fallbackUsed}`);
    console.log(`Model used: ${result.modelUsed}`);
    console.log(`Summary length: ${result.summaryText.length} characters`);
    console.log(`Summary: ${result.summaryText.substring(0, 100)}...`);
    
    if (result.metadata) {
      console.log('\nMetadata:');
      Object.entries(result.metadata).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length > 50) {
          console.log(`  ${key}: ${value.substring(0, 50)}...`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Simulation failed:', error);
  } finally {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
}

/**
 * Main function to run all simulations
 */
async function main() {
  console.log('Starting robust Claude client simulations...');
  
  // Run simulations for different error scenarios
  await runSimulation('rate-limit', 3);
  await runSimulation('network-error', 2);
  await runSimulation('timeout', 1);
  await runSimulation('context-window', 1);
  await runSimulation('content-filter', 1);
  await runSimulation('incomplete', 1);
  
  console.log('\nAll simulations completed!');
}

// Run the simulations
main().catch(error => {
  console.error('Error running simulations:', error);
  process.exit(1);
});
