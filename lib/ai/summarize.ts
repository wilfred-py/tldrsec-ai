/**
 * Claude AI Summarization Service
 * 
 * Handles the summarization of SEC filings using Anthropic's Claude API
 * with specialized prompts for different filing types.
 */

import { PrismaClient } from '@prisma/client';
import { ClaudeClient, ClaudeRequestOptions } from './claude-client';
import { modelConfig } from './config';
import { parseResponse } from './parsers';
import { SECFilingType } from './prompts/prompt-types';
import { generateFilingPrompt } from './prompts/filing-prompts';
import { extractFilingContent } from '@/lib/parsers/filing-extractor';
import { logger } from '@/lib/logging';
import { monitoring } from '@/lib/monitoring';
import { ApiError, ErrorCode } from '@/lib/error-handling';

// Initialize Prisma client
const prisma = new PrismaClient();

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
  claudeClient?: ClaudeClient;
  claudeOptions?: ClaudeRequestOptions;
}

/**
 * Interface for summarization result
 */
export interface SummarizationResult {
  summaryId: string;
  summaryText: any;
  summaryJSON?: any;
  isPartial?: boolean;
  duration: number;
  parsingErrors?: string[];
  // AI metrics
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  attempts?: number;
}

/**
 * Summarize an SEC filing using Claude AI with robust error handling and fallback
 */
export async function summarizeFiling(options: SummarizationOptions): Promise<SummarizationResult> {
  const { filingId, summaryId, requestId, claudeOptions } = options;
  const startTime = Date.now();
  
  // Use provided Claude client or create a new one
  const aiClient = options.claudeClient || new ClaudeClient();
  
  // Create a unique operation ID for tracking
  const operationId = requestId || `summarize-${summaryId}-${Date.now()}`;
  
  // Log the start of summarization
  componentLogger.info(`Starting summarization`, {
    summaryId,
    filingId,
    operationId
  });
  
  // Record the summarization attempt
  monitoring.incrementCounter('ai.summarization_started', 1);
  
  try {
    // Get the filing and summary records
    const filing = await prisma.secFiling.findUnique({
      where: { id: filingId },
      include: { ticker: true }
    });
    
    const summary = await prisma.summary.findUnique({
      where: { id: summaryId }
    });
    
    if (!filing) {
      throw new SummarizationError(
        `Filing with ID ${filingId} not found`,
        summaryId,
        'unknown',
        'FILING_NOT_FOUND',
        false,
        'missing_filing'
      );
    }
    
    if (!summary) {
      throw new SummarizationError(
        `Summary with ID ${summaryId} not found`,
        summaryId,
        filing?.formType || 'unknown',
        'SUMMARY_NOT_FOUND',
        false,
        'missing_summary'
      );
    }
    
    // Update status to processing
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        processingStatus: 'PROCESSING',
        processingStartedAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    componentLogger.info(`Extracting content for filing`, {
      summaryId,
      filingType: filing.formType,
      filingUrl: filing.secUrl,
      operationId
    });
    
    // Track specific filing type
    monitoring.incrementCounter('ai.summarization_by_type', 1, {
      filingType: filing.formType
    });
    
    // Extract the filing content
    let content;
    try {
      // The extractFilingContent function gets the document from the SEC EDGAR system
      // and parses it to extract the relevant text content
      content = await extractFilingContent(filing.secUrl, filing.formType as SECFilingType);
      
      if (!content) {
        throw new Error('Content extraction returned empty result');
      }
    } catch (error) {
      // Log and track the extraction failure
      componentLogger.error(`Error extracting filing content`, {
        summaryId,
        filingType: filing.formType,
        filingUrl: filing.secUrl,
        error,
        operationId
      });
      
      monitoring.incrementCounter('ai.extraction_failed', 1, {
        filingType: filing.formType
      });
      
      // Update the summary record with the error
      await prisma.summary.update({
        where: { id: summaryId },
        data: {
          processingStatus: 'FAILED',
          processingError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date()
        }
      });
      
      throw new SummarizationError(
        `Failed to extract content: ${error instanceof Error ? error.message : String(error)}`,
        summaryId,
        filing.formType,
        'CONTENT_EXTRACTION_FAILED',
        true, // Extraction failures may be retriable
        'extraction_failed'
      );
    }
    
    componentLogger.info(`Content extracted successfully, preparing prompt`, {
      summaryId,
      filingType: filing.formType,
      contentLength: content.length,
      operationId
    });
    
    // Get the appropriate prompt for this filing type
    const prompt = getPromptForFilingType(filing.formType as SECFilingType, {
      // Include additional context like ticker, company name if available
      ticker: filing.ticker?.symbol,
      companyName: filing.ticker?.name || filing.companyName
    });
    
    // Log the prompt preparation
    componentLogger.debug(`Prompt prepared`, {
      summaryId,
      promptType: filing.formType,
      promptLength: prompt.getFullPrompt(content).length,
      operationId
    });
    
    // Call Claude API with the prompt and content
    componentLogger.info(`Calling Claude API`, {
      summaryId,
      filingType: filing.formType,
      model: claudeOptions?.model || modelConfig.defaultModel,
      operationId
    });
    
    const apiCallStart = Date.now();
    
    try {
      // Make the API call to Claude with enhanced options
      const response = await aiClient.completeChat({
        model: claudeOptions?.model || modelConfig.defaultModel,
        messages: [
          { role: 'user', content: prompt.getFullPrompt(content) }
        ],
        max_tokens: claudeOptions?.maxTokens || modelConfig.maxOutputTokens,
        temperature: claudeOptions?.temperature
      }, claudeOptions);
      
      // Record API call duration
      const apiCallDuration = Date.now() - apiCallStart;
      monitoring.recordTiming('ai.claude_api_duration', apiCallDuration, {
        filingType: filing.formType,
        model: response.model
      });
      
      // Log success
      componentLogger.info(`Claude API call successful`, {
        summaryId,
        filingType: filing.formType,
        responseLength: response.content.length,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        model: response.model,
        duration: apiCallDuration,
        operationId,
        attempts: response.executionMetadata?.attempts || 1,
        fallbackUsed: response.executionMetadata?.fallbackUsed || false
      });
      
      // Track token usage
      monitoring.recordValue('ai.tokens_used.input', response.usage.inputTokens);
      monitoring.recordValue('ai.tokens_used.output', response.usage.outputTokens);
      
      // Get the text response
      const summaryText = response.content;
      
      // Parse the JSON from the response
      componentLogger.info(`Parsing response JSON`, { summaryId, operationId });
      
      const parsingStart = Date.now();
      
      // Use our parser to extract structured data
      const parsedResult = parseResponse(
        summaryText,
        filing.formType as SECFilingType,
        {
          allowPartial: true,
          normalize: true,
          collectMetrics: true
        }
      );
      
      // Record parsing duration
      const parsingDuration = Date.now() - parsingStart;
      monitoring.recordTiming('ai.parsing_duration', parsingDuration, {
        filingType: filing.formType,
        success: parsedResult.success
      });
      
      // Handle parsing result
      if (parsedResult.success) {
        componentLogger.info(`Successfully parsed JSON from response`, {
          summaryId,
          filingType: filing.formType,
          isPartial: parsedResult.partial || false,
          operationId
        });
        
        if (parsedResult.partial) {
          monitoring.incrementCounter('ai.partial_parsing', 1, {
            filingType: filing.formType
          });
        } else {
          monitoring.incrementCounter('ai.full_parsing', 1, {
            filingType: filing.formType
          });
        }
        
        // Update the summary record with the results
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            summaryText,
            summaryJSON: parsedResult.data,
            processingStatus: 'COMPLETED',
            processingCompletedAt: new Date(),
            isPartialResult: parsedResult.partial || false,
            processingTimeMs: Date.now() - startTime,
            tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
            model: response.model,
            cost: response.cost.totalCost,
            attempts: response.executionMetadata?.attempts || 1,
            updatedAt: new Date()
          }
        });
        
        // Return the successful result with metrics
        return {
          summaryId,
          summaryText,
          summaryJSON: parsedResult.data,
          isPartial: parsedResult.partial || false,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cost: response.cost.totalCost,
          attempts: response.executionMetadata?.attempts || 1
        };
      } else {
        // Handle parsing failure with partial results
        componentLogger.warn(`Failed to parse valid JSON from response`, {
          summaryId,
          filingType: filing.formType,
          parsingErrors: parsedResult.errors,
          operationId
        });
        
        monitoring.incrementCounter('ai.parsing_failed', 1, {
          filingType: filing.formType
        });
        
        // Store the text anyway, but mark as failed/partial
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            summaryText,
            processingStatus: 'COMPLETED_WITH_WARNINGS',
            processingCompletedAt: new Date(),
            isPartialResult: true,
            processingTimeMs: Date.now() - startTime,
            processingError: 'Failed to parse JSON response: ' + parsedResult.errors?.join('; '),
            tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
            model: response.model,
            cost: response.cost.totalCost,
            attempts: response.executionMetadata?.attempts || 1,
            updatedAt: new Date()
          }
        });
        
        // Return partial success with parsing errors
        return {
          summaryId,
          summaryText,
          parsingErrors: parsedResult.errors,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cost: response.cost.totalCost,
          attempts: response.executionMetadata?.attempts || 1
        };
      }
    } catch (error) {
      // Handle AI API errors
      componentLogger.error(`Error calling Claude API`, {
        error: error instanceof Error ? error.message : String(error),
        summaryId,
        filingType: filing.formType,
        operationId
      });
      
      // Track API failure
      monitoring.incrementCounter('ai.api_error', 1, {
        filingType: filing.formType,
        errorType: error instanceof ApiError ? error.code : 'UNKNOWN'
      });
      
      // Only update the database if the error is not retriable or rate limiting
      // This allows the job processor to retry the task
      const isRetriable = error instanceof ApiError && error.isRetriable;
      const isRateLimit = error instanceof ApiError && error.code === ErrorCode.RATE_LIMITED;
      
      if (!isRetriable || (error instanceof ApiError && error.code === ErrorCode.RETRY_EXHAUSTED)) {
        // Update the summary record with the error
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            processingStatus: 'FAILED',
            processingError: error instanceof Error ? error.message : String(error),
            processingErrorCode: error instanceof ApiError ? error.code : 'UNKNOWN_ERROR',
            processingTimeMs: Date.now() - startTime,
            updatedAt: new Date()
          }
        });
      }
      
      // Wrap in SummarizationError for consistent handling
      throw new SummarizationError(
        `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
        summaryId,
        filing.formType,
        error instanceof ApiError ? error.code : 'AI_ERROR',
        isRetriable || isRateLimit,
        error instanceof ApiError ? error.code : 'ai_error'
      );
    }
  } catch (error) {
    // If error is already a SummarizationError, just rethrow
    if (error instanceof SummarizationError) {
      throw error;
    }
    
    // Otherwise wrap in SummarizationError
    throw new SummarizationError(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
      summaryId,
      'unknown',
      'SUMMARIZATION_FAILED',
      error instanceof ApiError && error.isRetriable,
      'unexpected_error'
    );
  }
} 