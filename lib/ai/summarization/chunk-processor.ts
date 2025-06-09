/**
 * Chunk Processor Module
 * 
 * Handles processing of individual document chunks for summarization
 */

import { enhancedClaudeClient, EnhancedClaudeOptions } from '../enhanced-claude-client';
import { EnhancedSummarizationResult } from './types';
import { SECFilingType } from '../prompts/prompt-types';
import { generateFilingPrompt } from '../prompts/filing-prompts';
import { parseResponse, ParseResult } from '../parsers';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';
import { ClaudeResponse } from '../claude-client';
import { PromptRequest } from '../prompts/prompt-types';

// Component logger
const componentLogger = logger.child('chunk-processor');

/**
 * Process a single document chunk
 * 
 * @param chunk Document chunk to process
 * @param filingType SEC filing type
 * @param filingRecord Filing record from database
 * @param options Processing options
 * @returns Summarization result
 */
export async function processSingleChunk(
  chunk: string,
  filingType: SECFilingType,
  filingRecord: {
    companyName?: string;
    filingDate?: string;
    ticker?: { symbol?: string };
  },
  options: {
    filingId: string;
    summaryId: string;
    maxRetries?: number;
    useStreaming?: boolean;
    useCache?: boolean;
    cacheKey?: any;
    streamHandler?: any;
    claudeOptions?: EnhancedClaudeOptions;
  }
): Promise<EnhancedSummarizationResult> {
  const { summaryId, filingId } = options;
  const startTime = Date.now();
  const maxRetries = options.maxRetries ?? 3; // Default to 3 retries if not specified
  let attempts = 0;
  let lastParsedResult: ParseResult | null = null;
  let lastSummaryText = '';
  let lastResponse: ClaudeResponse | null = null;
  let missingFields: string[] = [];
  
  while (attempts < maxRetries) {
    attempts++;
    
    // Create prompt request for this filing type with additional instructions on retry
    const promptRequest: PromptRequest = {
      filingType,
      content: chunk,
      companyName: filingRecord.companyName || 'Unknown Company',
      filingDate: filingRecord.filingDate || new Date().toISOString().split('T')[0],
      ticker: filingRecord.ticker?.symbol || '',
      section: 'Complete Document',
      customInstructions: attempts > 1 
        ? `IMPORTANT: Your previous response was missing the following required fields: ${missingFields.join(', ')}. ` +
          `Please ensure your JSON response includes ALL required fields with valid data. ` +
          `This is attempt ${attempts} of ${maxRetries}.`
        : undefined
    };
    
    // Generate prompt for Claude
    const { messages, options: promptOptions } = generateFilingPrompt(promptRequest);
    
    // Prepare Claude options
    const claudeOptions: EnhancedClaudeOptions = {
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
      temperature: 0.2,
      system: promptOptions.system,
      metadata: {
        filingId,
        summaryId,
        filingType: String(filingType),
        attempt: String(attempts)
      },
      useStreaming: options.useStreaming,
      useCache: attempts === 1 ? options.useCache : false, // Only use cache on first attempt
      cacheKey: options.cacheKey,
      streamHandler: options.streamHandler,
      ...(options.claudeOptions || {})
    };
    
    try {
      // Send request to Claude
      const response = await enhancedClaudeClient.sendMessage(messages, claudeOptions);
      lastResponse = response;
      
      // Extract response content
      const summaryText = response.content;
      lastSummaryText = summaryText;
      
      // Parse response
      const parsingStartTime = Date.now();
      const parsedResult = parseResponse(summaryText, filingType);
      lastParsedResult = parsedResult;
      const parsingDuration = Date.now() - parsingStartTime;
      
      // Check if parsing succeeded
      if (parsedResult.success) {
        monitoring.incrementCounter('ai.summarization_success', 1);
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        
        if (attempts > 1) {
          componentLogger.info(`Successfully parsed JSON after ${attempts} attempts for summaryId=${summaryId}`);
          monitoring.incrementCounter('ai.summarization_retry_success', 1);
        }
        
        return {
          summaryId,
          summaryText: parsedResult.data.summary,
          summaryJSON: parsedResult.data,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens: response.usage?.inputTokens || 0,
          outputTokens: response.usage?.outputTokens || 0,
          cost: response.cost?.totalCost || 0,
          attempts
        };
      }
      
      // If parsing failed but we've reached max retries, break the loop
      if (attempts >= maxRetries) {
        break;
      }
      
      // Determine what fields are missing for better retry instructions
      monitoring.recordTiming('ai.parsing_duration', parsingDuration);
      missingFields = identifyMissingFields(parsedResult, filingType);
      
      componentLogger.warn(
        `Retry ${attempts}/${maxRetries} - Failed to parse valid JSON for summaryId=${summaryId}, ` +
        `filingType=${filingType}, missing fields: ${missingFields.join(', ')}`
      );
      monitoring.incrementCounter('ai.summarization_retry', 1);
      
      // Exponential backoff before retry
      const backoffMs = Math.min(500 * Math.pow(2, attempts - 1), 10000); // Cap at 10 seconds
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      
    } catch (error) {
      componentLogger.error(`Error calling Claude API (attempt ${attempts}/${maxRetries}) for filing ${filingId}, summary ${summaryId}: ${error instanceof Error ? error.message : String(error)}`);
      monitoring.incrementCounter('ai.summarization_error', 1);
      
      // If we've reached max retries, throw the error
      if (attempts >= maxRetries) {
        throw error;
      }
      
      // Otherwise wait with exponential backoff and try again
      const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 15000); // Cap at 15 seconds
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  
  // If we get here, all attempts failed
  monitoring.incrementCounter('ai.summarization_max_retries_failed', 1);
  componentLogger.error(`All ${maxRetries} parsing attempts failed for summaryId=${summaryId}, filingType=${filingType}`);
  
  // Return result with partial data and error information
  return {
    summaryId,
    summaryText: lastSummaryText,
    parsingErrors: lastParsedResult?.errors || ['Maximum retry attempts exceeded'],
    isPartial: true,
    duration: Date.now() - startTime,
    modelUsed: lastResponse?.model || 'unknown',
    model: lastResponse?.model || 'unknown',
    inputTokens: lastResponse?.usage?.inputTokens || 0,
    outputTokens: lastResponse?.usage?.outputTokens || 0,
    cost: lastResponse?.cost?.totalCost || 0,
    attempts
  };
}

/**
 * Identify missing fields in a parsed response
 * 
 * @param parsedResult Result from parseResponse
 * @param filingType SEC filing type
 * @returns Array of missing field names
 */
export function identifyMissingFields(
  parsedResult: any,
  filingType: SECFilingType
): string[] {
  // If parsing failed entirely or data is missing, return generic fields
  if (!parsedResult || !parsedResult.data) {
    return ['companyName', 'summary', 'filingSummary', 'keyInsights'];
  }
  
  const missingFields: string[] = [];
  const data = parsedResult.data;
  
  // Check essential fields that should be in all filings
  if (!data.companyName) missingFields.push('companyName');
  if (!data.summary) missingFields.push('summary');
  if (!data.filingSummary) missingFields.push('filingSummary');
  
  // Check filing-type specific required fields
  switch (filingType) {
    case '10-K':
    case '10-Q':
      if (!data.financialMetricsAnalysis) missingFields.push('financialMetricsAnalysis');
      if (!data.keyInsights) missingFields.push('keyInsights');
      if (!data.riskFactors) missingFields.push('riskFactors');
      break;
      
    case 'S-1':
    case '424B':
      if (!data.businessDescription) missingFields.push('businessDescription');
      if (!data.useOfProceeds) missingFields.push('useOfProceeds');
      if (!data.keyInsights) missingFields.push('keyInsights');
      break;
      
    case '8-K':
      if (!data.eventDescription) missingFields.push('eventDescription');
      if (!data.eventDate) missingFields.push('eventDate');
      if (!data.keyInsights) missingFields.push('keyInsights');
      break;
    
    default:
      // For all other filing types, ensure at least keyInsights is present
      if (!data.keyInsights) missingFields.push('keyInsights');
      break;
  }
  
  return missingFields;
}
