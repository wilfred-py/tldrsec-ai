/**
 * Claude AI Summarization Service
 * 
 * Handles the summarization of SEC filings using Anthropic's Claude API
 * with specialized prompts for different filing types.
 */

import { PrismaClient } from '@prisma/client';
import { claudeClient } from './claude-client';
import { modelConfig } from './config';
import { parseResponse } from './parsers';
import { SECFilingType } from './prompts/prompt-types';
import { getPromptForFilingType } from './prompts';
import { extractFilingContent } from '@/lib/parsers/filing-extractor';
import { logger } from '@/lib/logging';
import { monitoring } from '@/lib/monitoring';

// Initialize Prisma client
const prisma = new PrismaClient();

// Component logger
const componentLogger = logger.child('claude-summarizer');

/**
 * Error class for summarization failures
 */
export class SummarizationError extends Error {
  filingType: string;
  summaryId: string;
  code: string;
  
  constructor(message: string, summaryId: string, filingType: string, code: string = 'SUMMARIZATION_FAILED') {
    super(message);
    this.name = 'SummarizationError';
    this.summaryId = summaryId;
    this.filingType = filingType;
    this.code = code;
  }
}

/**
 * Summarize an SEC filing using Claude AI
 * 
 * @param summaryId - The ID of the summary record to process
 * @returns The updated summary with AI-generated content
 */
export async function summarizeFiling(summaryId: string) {
  const startTime = Date.now();
  
  // Log the start of summarization
  componentLogger.info(`Starting summarization for summary ${summaryId}`);
  
  // Record the summarization attempt
  monitoring.incrementCounter('ai.summarization_started', 1);
  
  try {
    // Get the summary record with related ticker
    const summary = await prisma.summary.findUnique({
      where: { id: summaryId },
      include: { ticker: true }
    });
    
    if (!summary) {
      throw new SummarizationError(
        `Summary with ID ${summaryId} not found`,
        summaryId,
        'unknown',
        'SUMMARY_NOT_FOUND'
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
      filingType: summary.filingType,
      filingUrl: summary.filingUrl
    });
    
    // Track specific filing type
    monitoring.incrementCounter('ai.summarization_by_type', 1, {
      filingType: summary.filingType
    });
    
    // Extract the filing content
    let content;
    try {
      // The extractFilingContent function gets the document from the SEC EDGAR system
      // and parses it to extract the relevant text content
      content = await extractFilingContent(summary.filingUrl, summary.filingType as SECFilingType);
      
      if (!content) {
        throw new Error('Content extraction returned empty result');
      }
    } catch (error) {
      // Log and track the extraction failure
      componentLogger.error(`Error extracting filing content`, {
        summaryId,
        filingType: summary.filingType,
        filingUrl: summary.filingUrl,
        error
      });
      
      monitoring.incrementCounter('ai.extraction_failed', 1, {
        filingType: summary.filingType
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
        summary.filingType,
        'CONTENT_EXTRACTION_FAILED'
      );
    }
    
    componentLogger.info(`Content extracted successfully, preparing prompt`, {
      summaryId,
      filingType: summary.filingType,
      contentLength: content.length
    });
    
    // Get the appropriate prompt for this filing type
    const prompt = getPromptForFilingType(summary.filingType as SECFilingType, {
      // Include additional context like ticker, company name if available
      ticker: summary.ticker?.symbol,
      companyName: summary.ticker?.companyName
    });
    
    // Log the prompt preparation
    componentLogger.debug(`Prompt prepared`, {
      summaryId,
      promptType: summary.filingType,
      promptLength: prompt.length
    });
    
    // Call Claude API with the prompt and content
    componentLogger.info(`Calling Claude API`, {
      summaryId,
      filingType: summary.filingType,
      model: modelConfig.defaultModel
    });
    
    const apiCallStart = Date.now();
    
    try {
      // Make the API call to Claude
      const response = await claudeClient.completeChat({
        model: modelConfig.defaultModel,
        messages: [
          { role: 'user', content: prompt.getFullPrompt(content) }
        ],
        max_tokens: modelConfig.maxOutputTokens
      });
      
      // Record API call duration
      const apiCallDuration = Date.now() - apiCallStart;
      monitoring.recordTiming('ai.claude_api_duration', apiCallDuration, {
        filingType: summary.filingType
      });
      
      // Log success
      componentLogger.info(`Claude API call successful`, {
        summaryId,
        filingType: summary.filingType,
        responseLength: response.content?.[0]?.text?.length || 0,
        tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens,
        duration: apiCallDuration
      });
      
      // Track token usage
      monitoring.recordValue('ai.tokens_used.input', response.usage?.input_tokens || 0);
      monitoring.recordValue('ai.tokens_used.output', response.usage?.output_tokens || 0);
      
      // Get the text response
      const summaryText = response.content?.[0]?.text || '';
      
      // Parse the JSON from the response
      componentLogger.info(`Parsing response JSON`, { summaryId });
      
      const parsingStart = Date.now();
      
      // Use our parser to extract structured data
      const parsedResult = parseResponse(
        summaryText,
        summary.filingType as SECFilingType,
        {
          allowPartial: true,
          normalize: true,
          collectMetrics: true
        }
      );
      
      // Record parsing duration
      const parsingDuration = Date.now() - parsingStart;
      monitoring.recordTiming('ai.parsing_duration', parsingDuration, {
        filingType: summary.filingType,
        success: parsedResult.success
      });
      
      // Handle parsing result
      if (parsedResult.success) {
        componentLogger.info(`Successfully parsed JSON from response`, {
          summaryId,
          filingType: summary.filingType,
          isPartial: parsedResult.partial || false
        });
        
        if (parsedResult.partial) {
          monitoring.incrementCounter('ai.partial_parsing', 1, {
            filingType: summary.filingType
          });
        } else {
          monitoring.incrementCounter('ai.full_parsing', 1, {
            filingType: summary.filingType
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
            tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens,
            updatedAt: new Date()
          }
        });
        
        // Return the updated summary
        return {
          summaryId,
          summaryText,
          summaryJSON: parsedResult.data,
          isPartial: parsedResult.partial || false,
          duration: Date.now() - startTime
        };
      } else {
        // Parsing failed
        componentLogger.error(`Failed to parse JSON from response`, {
          summaryId,
          filingType: summary.filingType,
          errors: parsedResult.errors
        });
        
        monitoring.incrementCounter('ai.parsing_failed', 1, {
          filingType: summary.filingType
        });
        
        // Update the summary with the error but still save the text
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            summaryText,
            processingStatus: 'PARTIAL',
            processingError: parsedResult.errors?.join(', '),
            processingCompletedAt: new Date(),
            processingTimeMs: Date.now() - startTime,
            tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens,
            updatedAt: new Date()
          }
        });
        
        // Return partial result
        return {
          summaryId,
          summaryText,
          parsingErrors: parsedResult.errors,
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      // Handle API call errors
      componentLogger.error(`Error calling Claude API`, {
        summaryId,
        filingType: summary.filingType,
        error
      });
      
      monitoring.incrementCounter('ai.claude_api_error', 1, {
        filingType: summary.filingType
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
        `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
        summaryId,
        summary.filingType,
        'CLAUDE_API_ERROR'
      );
    }
  } catch (error) {
    // Overall error handling
    monitoring.incrementCounter('ai.summarization_failed', 1);
    
    if (error instanceof SummarizationError) {
      throw error;
    }
    
    throw new SummarizationError(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
      summaryId,
      'unknown',
      'UNKNOWN_ERROR'
    );
  }
} 