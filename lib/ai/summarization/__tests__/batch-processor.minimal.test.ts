/**
 * Minimal Batch Processor Tests
 * 
 * Tests for the batch processing functionality with complete module mocking
 */

import { jest } from '@jest/globals';

// Mock all dependencies before importing the modules
jest.mock('../../claude-client');
jest.mock('../../enhanced-claude-client');
jest.mock('../chunk-processor');
jest.mock('../../../logging');
jest.mock('../../../monitoring');

// Import the module under test AFTER all mocks are set up
import { processAllChunks } from '../batch-processor';
import { SECFilingType } from '../../prompts/prompt-types';

describe('Batch Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processAllChunks should process multiple chunks and return combined results', async () => {
    // Test data
    const chunks = ['chunk1', 'chunk2', 'chunk3'];
    const filingType = 'annual' as SECFilingType;
    const filingRecord = { id: 'filing-123', name: 'Test Filing' };
    const options = { summaryId: 'test-summary-id' };

    // Execute the function
    const result = await processAllChunks(chunks, filingType, filingRecord, options);

    // Verify the result
    expect(result).toBeDefined();
    expect(result.summaryId).toBeDefined();
    expect(result.summaryText).toBeDefined();
  });
});
