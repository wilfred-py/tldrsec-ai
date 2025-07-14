/**
 * Claude AI Summarization Service
 * 
 * Handles the summarization of SEC filings using Anthropic's Claude API
 * with specialized prompts for different filing types.
 */

import { claudeClient, ClaudeRequestOptions } from './claude-client';
import { modelConfig } from './config';
import { parseResponse } from './parsers';
import { SECFilingType } from './prompts/prompt-types';
import { generateFilingPrompt } from './prompts/filing-prompts';
import { estimateTokenCount, splitDocumentIntoChunks, getContextConfig } from './prompts/context-manager';
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { extractFilingContent } from '../parsers/filing-extractor';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ApiError, ErrorCode } from '../error-handling';
import { prisma } from '../db/prisma';
import { ensureMinimumFields } from './parsers/response-fixer';

/**
 * Process document content for summarization
 * - Checks if document needs chunking based on token count
 * - Either returns full document or processes it into chunks
 * 
 * @param content - The document content to process
 * @param filingType - The type of SEC filing
 * @param maxTokens - Maximum tokens allowed
 * @returns Processed document content and chunking info
 */
function processDocumentContent(content: string, filingType: SECFilingType, maxTokens: number = 150000): {
  processedContent: string;
  isChunked: boolean;
  chunkCount?: number;
  estimatedTokens: number;
} {
  // Estimate current token count
  const estimatedTokens = estimateTokenCount(content);
  
  // If we're already under the limit, return the full content
  if (estimatedTokens <= maxTokens * 0.85) { // Using 85% of max as safety margin
    return {
      processedContent: content,
      isChunked: false,
      estimatedTokens
    };
  }
  
  // Document needs chunking - use the chunking strategy from context-manager
  const config = getContextConfig(filingType);
  
  // Adjust config to respect our maxTokens parameter
  const adjustedConfig = {
    ...config,
    maxChunkSize: Math.min(config.maxChunkSize, maxTokens * 0.85) // 85% of max tokens
  };
  
  // Get chunks using the appropriate strategy
  const chunks = splitDocumentIntoChunks(content, adjustedConfig);
  
  // For now, we'll just use the first chunk which contains the most important content
  // In a more advanced implementation, we would process each chunk separately
  // and then combine the results
  
  // Return the first chunk (most important content) and chunking info
  return {
    processedContent: chunks[0],
    isChunked: true,
    chunkCount: chunks.length,
    estimatedTokens: estimateTokenCount(chunks[0])
  };
}

/**
 * Truncate document content to fit within token limits
 * Uses a smart approach to preserve important sections
 * 
 * @param content - The document content to truncate
 * @param maxTokens - Maximum tokens to allow
 * @returns Truncated document content
 */
function truncateDocumentContent(content: string, maxTokens: number): string {
  // Estimate current token count
  const currentTokens = estimateTokenCount(content);
  
  // If already under limit, return as is
  if (currentTokens <= maxTokens) {
    return content;
  }
  
  // Split document into sections/paragraphs
  const sections = content.split(/\n\n+/);
  
  // Calculate approximate ratio to keep
  const keepRatio = maxTokens / currentTokens;
  
  // Prioritize important sections based on keywords
  const prioritizedSections = sections.map((section, index) => {
    let priority = 0;
    
    // Prioritize sections with important keywords
    if (/risk factors|item 1a|item 7|financial statements|management discussion/i.test(section)) {
      priority += 3;
    }
    
    // Prioritize sections with numbers (often important in financial docs)
    if (/\$|\d+\.\d+|\d+%|million|billion/i.test(section)) {
      priority += 2;
    }
    
    // Prioritize beginning and end of document
    if (index < sections.length * 0.2) { // First 20%
      priority += 2;
    } else if (index > sections.length * 0.8) { // Last 20%
      priority += 1;
    }
    
    return { section, priority, index };
  });
  
  // Sort by priority (highest first)
  prioritizedSections.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // If same priority, maintain original order
    return a.index - b.index;
  });
  
  // Keep sections until we hit the token limit
  const keptSections: string[] = [];
  let tokenCount = 0;
  
  for (const { section } of prioritizedSections) {
    const sectionTokens = estimateTokenCount(section);
    
    if (tokenCount + sectionTokens <= maxTokens * 0.95) { // Leave 5% buffer
      keptSections.push(section);
      tokenCount += sectionTokens;
    }
  }
  
  // Sort back to original order
  keptSections.sort((a, b) => {
    const indexA = sections.indexOf(a);
    const indexB = sections.indexOf(b);
    return indexA - indexB;
  });
  
  // Join sections back together
  return keptSections.join('\n\n');
}

/**
 * Calculate the cost of an AI operation based on model and token usage
 * Updated with actual pricing for Claude models as of May 2025
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Claude pricing per million tokens (as of May 2025)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-20250514': {
      input: 3,      // $3 per million input tokens
      output: 15     // $15 per million output tokens
    },
    'claude-3-opus-20240229': {
      input: 15,     // $15 per million input tokens
      output: 75     // $75 per million output tokens
    },
    'claude-3-sonnet-20240229': {
      input: 3,      // $3 per million input tokens
      output: 15     // $15 per million output tokens
    },
    'claude-3-haiku-20240307': {
      input: 0.25,   // $0.25 per million input tokens
      output: 1.25   // $1.25 per million output tokens
    }
  };
  
  // Default to Claude Sonnet 4 pricing if model not found
  const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];
  
  // Calculate cost in dollars
  const inputCost = (inputTokens / 1000000) * modelPricing.input;
  const outputCost = (outputTokens / 1000000) * modelPricing.output;
  const totalCost = inputCost + outputCost;
  
  componentLogger.debug(`Cost calculation for model '${model}', input tokens: ${inputTokens} ($${inputCost.toFixed(6)}), output tokens: ${outputTokens} ($${outputCost.toFixed(6)}), total: $${totalCost.toFixed(6)}`);
  
  return totalCost;
}

// Component logger
const componentLogger = logger.child('claude-summarizer');

/**
 * Get the appropriate prompt for a filing type with context
 */
function getPromptForFilingType(filingType: SECFilingType, context: { ticker?: string; companyName?: string }) {
  // Use the filing-prompts module to generate an appropriate prompt
  return {
    getFullPrompt: (content: string) => {
      const { messages } = generateFilingPrompt({
        filingType,
        content,
        companyName: context.companyName || 'Unknown Company',
        ticker: context.ticker || 'Unknown',
        filingDate: new Date().toISOString().split('T')[0]
      });
      
      // Return the user message content as the full prompt
      return messages[0].content;
    }
  };
}

/**
 * Error class for summarization failures
 */
export class SummarizationError extends Error {
  filingType: string;
  summaryId: string;
  code: string;
  reason?: string;
  isRetriable: boolean;
  
  constructor(
    message: string, 
    summaryId: string, 
    filingType: string, 
    code: string = 'SUMMARIZATION_FAILED',
    isRetriable: boolean = false,
    reason?: string
  ) {
    super(message);
    this.name = 'SummarizationError';
    this.summaryId = summaryId;
    this.filingType = filingType;
    this.code = code;
    this.isRetriable = isRetriable;
    this.reason = reason;
  }
}

/**
 * Interface for summarization options
 */
export interface SummarizationOptions {
  filingId: string;
  summaryId: string;
  requestId?: string;
  claudeOptions?: ClaudeRequestOptions;
  documentContent?: string;
}

/**
 * Interface for summarization result
 */
export interface SummarizationResult {
  summaryId: string;
  summaryText: string | Record<string, unknown>;
  summaryJSON?: Record<string, unknown>;
  isPartial?: boolean;
  duration: number;
  parsingErrors?: string[];
  // AI metrics
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  attempts?: number;
}

/**
 * Summarize an SEC filing using Claude AI with robust error handling and fallback
 */
export async function summarizeFiling(options: SummarizationOptions): Promise<SummarizationResult> {
  // Define a type that matches the Prisma return structure
  type SECFilingRecord = {
    id: string;
    formType: string;
    rawContent?: string;
    companyName: string;
    ticker?: { symbol?: string };
    accessionNumber?: string;
  };
  
  let filingRecordFromDB: SECFilingRecord | null = null;
  const { filingId, summaryId, requestId, claudeOptions, documentContent } = options; 
  // filingRecordFromDB is declared above so it's in scope for the catch blocks 
  const startTime = Date.now();
  
  const aiClient = claudeClient;
  const operationId = requestId || `summarize-${summaryId}-${Date.now()}`;
  
  componentLogger.info(`Starting summarization for summaryId=${summaryId}, filingId=${filingId}, operationId=${operationId}`);
  monitoring.incrementCounter('ai.summarization_started', 1);
  
  try {
        filingRecordFromDB = await prisma.secFiling.findUnique({
      where: { id: filingId },
      include: { ticker: true }
    });
    
    const summary = await prisma.summary.findUnique({
      where: { id: summaryId }
    });
    
    if (!filingRecordFromDB) {
      componentLogger.error(`Filing not found for summaryId=${summaryId}, filingId=${filingId}`);
      monitoring.incrementCounter('ai.summarization_error');
      throw new SummarizationError(
        `Filing not found: ${filingId}`,
        summaryId,
        'unknown',
        'FILING_NOT_FOUND',
        false,
        'filing_not_found'
      );
    }
    
    if (!summary) {
      componentLogger.error(`Summary record not found for summaryId=${summaryId}`);
      monitoring.incrementCounter('ai.summarization_error');
      throw new SummarizationError(
        `Summary record not found: ${summaryId}`,
        summaryId,
        filingRecordFromDB.formType,
        'SUMMARY_NOT_FOUND',
        false,
        'summary_not_found'
      );
    }
    
    // Extract content from the filing
    let content = documentContent;
    if (!content) {
      try {
        componentLogger.debug(`Extracting content for filing ${filingId}`);
        // Ensure rawContent is defined before passing to extractFilingContent
        if (!filingRecordFromDB.rawContent) {
          throw new Error('Filing content is missing');
        }
        content = await extractFilingContent(filingRecordFromDB.rawContent, filingRecordFromDB.formType as SECFilingType);
        componentLogger.debug(`Content extracted successfully, length=${content.length}`);
      } catch (extractError) {
        componentLogger.error(`Failed to extract content from filing ${filingId}: ${extractError instanceof Error ? extractError.message : String(extractError)}`);
        monitoring.incrementCounter('ai.content_extraction_error', 1);
        throw new SummarizationError(
          `Failed to extract content: ${extractError instanceof Error ? extractError.message : String(extractError)}`,
          summaryId,
          filingRecordFromDB.formType,
          'CONTENT_EXTRACTION_FAILED',
          true,
          'content_extraction_failed'
        );
      }
    }
    
    // Process document content - handle large documents appropriately
    const processedDoc = processDocumentContent(content, filingRecordFromDB.formType as SECFilingType);
    if (processedDoc.isChunked) {
      componentLogger.info(`Document was chunked for processing. Using first chunk of ${processedDoc.chunkCount} chunks. Token estimate: ${processedDoc.estimatedTokens}`);
      monitoring.incrementCounter('ai.document_chunked', 1);
      monitoring.recordMetric('ai.document_chunks', processedDoc.chunkCount ? processedDoc.chunkCount : 1);
    }
    
    // Use the processed content for the prompt
    content = processedDoc.processedContent;
    
    // Get the appropriate prompt for this filing type
    const promptGenerator = getPromptForFilingType(
      filingRecordFromDB.formType as SECFilingType, 
      { 
        ticker: filingRecordFromDB.ticker?.symbol, 
        companyName: filingRecordFromDB.companyName 
      }
    );
    
    // Check if we need to chunk the document due to token limits
    const estimatedTokens = estimateTokenCount(content);
    const maxTokenLimit = 150000; // Claude's max token limit is 200k, but leave buffer for prompt
    
    let prompt: string;
    let isChunked = false;
    
    if (estimatedTokens > maxTokenLimit) {
      // Document is too large, we need to truncate or chunk it
      componentLogger.warn(`Document for filing ${filingId} exceeds token limit (${estimatedTokens} tokens). Truncating to ${maxTokenLimit} tokens.`);
      monitoring.incrementCounter('ai.document_truncated', 1);
      
      // For now, we'll use a simple truncation approach
      // A more sophisticated approach would use the chunking mechanism
      const truncatedContent = truncateDocumentContent(content, maxTokenLimit);
      prompt = promptGenerator.getFullPrompt(truncatedContent);
      isChunked = true;
    } else {
      // Document is within token limits
      prompt = promptGenerator.getFullPrompt(content);
    }
    
    // Update the summary record to show we're processing
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        processingStatus: 'PROCESSING'
        // Let Prisma handle the updatedAt timestamp automatically
      }
    });
    
    // Configure the Claude request
    const model = modelConfig.defaultModel;
    const requestOptions = {
      // Use model config parameters directly since defaultOptions doesn't exist
      maxInputTokens: modelConfig.maxInputTokens,
      maxOutputTokens: modelConfig.maxOutputTokens,
      temperature: modelConfig.temperature,
      topP: modelConfig.topP,
      topK: modelConfig.topK,
      ...claudeOptions
    };
    
    componentLogger.debug(`Using model ${model} for summaryId=${summaryId}`);
    
    try {
      // Call Claude API to generate the summary
      const response = await aiClient.completeChat({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        ...requestOptions
      }, {
        metadata: {
          operationId,
          summaryId,
          filingId,
          filingType: filingRecordFromDB.formType
        }
      });
      
      // Extract text content from the Claude API response
      const summaryText = response.content
        .filter((block: ContentBlock) => block.type === 'text')
        .map((block: ContentBlock) => {
          // Handle text blocks safely
          if ('text' in block) {
            return block.text;
          }
          return '';
        })
        .filter(text => text.length > 0)
        .join('\n');
      
      // Access token usage with correct property names from the Anthropic API
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost = calculateCost(model, inputTokens, outputTokens);
      
      componentLogger.info(`Received response for summaryId=${summaryId}, length=${summaryText.length}, inputTokens=${inputTokens}, outputTokens=${outputTokens}`);
      monitoring.recordTiming('ai.response_time', Date.now() - startTime);
      monitoring.incrementCounter('ai.summarization_completed', 1);
      
      // Parse the response
      const parsingStartTime = Date.now();
      const parsedResult = parseResponse(summaryText);
      const parsingDuration = Date.now() - parsingStartTime;
      
      if (parsedResult.success && parsedResult.data) {
        componentLogger.info(`Successfully parsed response for summaryId=${summaryId}, filingType=${filingRecordFromDB.formType}`);
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        monitoring.incrementCounter('ai.summarization_parsing_success', 1);
        
        // Update the summary record
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            summaryText: parsedResult.data.summary,
            processingStatus: 'COMPLETED',
            processingCompletedAt: new Date(),
            isPartialResult: false,
            processingTimeMs: Date.now() - startTime,
            tokensUsed: inputTokens + outputTokens,
            model: response.model,
            cost,
            attempts: response.executionMetadata?.attempts || 1
          }
        });
        return {
          summaryId,
          summaryText: parsedResult.data.summary,
          summaryJSON: parsedResult.data,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens,
          outputTokens,
          cost,
          attempts: response.executionMetadata?.attempts || 1
        };
      } else {
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        componentLogger.warn(`Failed to parse valid JSON from response for summaryId=${summaryId}, filingType=${filingRecordFromDB!.formType}, errors=${parsedResult.errors?.join('; ')}, operationId=${operationId}`);
        monitoring.incrementCounter('ai.summarization_parsing_error', 1);
        
        // Use response-fixer to ensure minimum fields are present
        const companyName = filingRecordFromDB?.companyName || 
                           (filingRecordFromDB?.ticker?.symbol ? `${filingRecordFromDB.ticker.symbol} Company` : 'Unknown Company');
        const fixedData = ensureMinimumFields(summaryText, filingRecordFromDB!.formType as SECFilingType, companyName);
        
        // Update the summary record with the fixed data
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            summaryText: fixedData.summary,
            processingStatus: 'COMPLETED_WITH_WARNINGS',
            processingCompletedAt: new Date(),
            isPartialResult: true,
            processingTimeMs: Date.now() - startTime,
            processingError: 'Fixed JSON response: ' + parsedResult.errors?.join('; '),
            tokensUsed: inputTokens + outputTokens,
            model: response.model,
            cost,
            attempts: response.executionMetadata?.attempts || 1
          }
        });
        return {
          summaryId,
          summaryText: fixedData.summary,
          summaryJSON: fixedData,
          isPartial: true,
          parsingErrors: parsedResult.errors,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens,
          outputTokens,
          cost,
          attempts: response.executionMetadata?.attempts || 1
        };
      }
    } catch (error) {
      componentLogger.error(`Error calling Claude API for filing ${filingId}, summary ${summaryId}: ${error instanceof Error ? error.message : String(error)} (filingType: ${filingRecordFromDB!.formType}, operationId: ${operationId})`);
      monitoring.incrementCounter('ai.summarization_error', 1);
      const isRetriable = error instanceof ApiError && error.isRetriable;
      const isRateLimit = error instanceof ApiError && error.code === ErrorCode.RATE_LIMITED;
      if (!isRetriable || (error instanceof ApiError && error.code === ErrorCode.RETRY_EXHAUSTED)) {
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            processingStatus: 'FAILED',
            processingError: `API call failed: ${error instanceof Error ? error.message : String(error)}`,
            processingErrorCode: error instanceof ApiError ? error.code : 'UNKNOWN_ERROR',
            processingTimeMs: Date.now() - startTime
          }
        });
      }
      throw new SummarizationError(
        `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
        summaryId,
        filingRecordFromDB!.formType,
        error instanceof ApiError ? error.code : 'AI_ERROR',
        isRetriable || isRateLimit,
        error instanceof ApiError ? error.code : 'ai_error'
      );
    }
  } catch (error) {
    if (error instanceof SummarizationError) {
      throw error;
    }
    throw new SummarizationError(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
      summaryId,
      filingRecordFromDB?.formType || 'unknown',
      'SUMMARIZATION_FAILED',
      error instanceof ApiError && error.isRetriable,
      'unexpected_error'
    );
  }
}
