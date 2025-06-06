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
import { extractFilingContent } from '@/lib/parsers/filing-extractor';
import { logger } from '@/lib/logging';
import { monitoring } from '@/lib/monitoring';
import { ApiError, ErrorCode } from '@/lib/error-handling';
import { prisma } from '@/lib/db/prisma';

// TODO: Implement actual cost calculation based on model and token counts
// This function calculates the estimated cost of an AI operation.
// Currently, it's a placeholder and returns 0.
// It needs to be updated with actual pricing models for different AI models.
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Example pricing (replace with actual rates)
  // const claudeHaikuInputCostPerMillion = 0.25;
  // const claudeHaikuOutputCostPerMillion = 1.25;
  // const claudeSonnetInputCostPerMillion = 3;
  // const claudeSonnetOutputCostPerMillion = 15;

  let cost = 0;
  // A real implementation would look up rates based on the 'model' string
  // For now, log and return 0
  componentLogger.debug(`Cost calculation for model '${model}', input tokens: ${inputTokens}, output tokens: ${outputTokens}. Placeholder returning 0.`);
  
  // Placeholder logic:
  // if (model.includes('haiku')) {
  //   cost = (inputTokens / 1000000) * claudeHaikuInputCostPerMillion + (outputTokens / 1000000) * claudeHaikuOutputCostPerMillion;
  // } else if (model.includes('sonnet')) {
  //   cost = (inputTokens / 1000000) * claudeSonnetInputCostPerMillion + (outputTokens / 1000000) * claudeSonnetOutputCostPerMillion;
  // } else {
  //   // Default or unknown model
  //   cost = 0; // Or some other default calculation
  // }
  return cost;
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
  let filingRecordFromDB: any = null;
  const { filingId, summaryId, requestId, claudeOptions, documentContent } = options; 
  // filingRecordFromDB is declared above so it's in scope for the catch blocks 
  const startTime = Date.now();
  
  const aiClient = claudeClient;
  const operationId = requestId || `summarize-${summaryId}-${Date.now()}`;
  
  componentLogger.info(`Starting summarization`, { summaryId, filingId, operationId });
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
            throw new SummarizationError(`Filing with ID ${filingId} not found`, summaryId, 'unknown', 'FILING_NOT_FOUND', false, 'missing_filing');
    }
    
    if (!summary) {
            throw new SummarizationError(`Summary with ID ${summaryId} not found`, summaryId, filingRecordFromDB?.formType || 'unknown', 'SUMMARY_NOT_FOUND', false, 'missing_summary');
    }
    
    await prisma.summary.update({
      where: { id: summaryId },
      data: { processingStatus: 'PROCESSING', processingCompletedAt: null }
    });

    if (!documentContent || documentContent.length === 0) {
    monitoring.incrementCounter('ai.summarization_error', 1);
      throw new SummarizationError(
        `Document content was not provided for filing ${filingId}`,
        summaryId,
        filingRecordFromDB!.formType,
        'NO_CONTENT_PROVIDED',
        false,
        'missing_document_content'
      );
    }
    componentLogger.info(`Using provided document content, preparing prompt`, { summaryId, operationId, contentLength: documentContent.length });
    
        monitoring.incrementCounter('ai.summarization_by_type', 1);
    
    // --- Prompt Chunking/Truncation Integration ---
    const { needsChunking } = await import('./prompts/context-manager');
    const { generateChunkedPrompts } = await import('./prompts/filing-prompts');

    let summaryText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let modelUsed = claudeOptions?.model || modelConfig.defaultModel;
    let chunkSummaries: string[] = [];
    let chunkParsingErrors: string[] = [];
    let chunkAttempts = 0;
    let cost = 0;
    let parsingDuration = 0;
    let parsedResult: any = null;
    let chunked = false;

    // Check if chunking is needed
    const doChunk = needsChunking(documentContent, filingRecordFromDB!.formType);
    if (doChunk) {
      chunked = true;
      componentLogger.info('Document requires chunking, splitting into chunks', { summaryId, operationId });
      monitoring.incrementCounter('ai.summarization_chunked', 1);
      // Generate chunked prompts
      const chunkedPrompts = generateChunkedPrompts({
        content: documentContent,
        filingType: filingRecordFromDB!.formType,
        companyName: filingRecordFromDB!.ticker?.companyName || 'Unknown Company',
        filingDate: filingRecordFromDB!.filingDate ? new Date(filingRecordFromDB!.filingDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        ticker: filingRecordFromDB!.ticker?.symbol || 'Unknown',
        contextConfig: undefined,
        promptConfig: claudeOptions,
        section: undefined
      });
      componentLogger.info(`Generated ${chunkedPrompts.length} chunks for summarization`, { summaryId, operationId });
      for (const chunkPrompt of chunkedPrompts) {
        try {
          const chunkStart = Date.now();
          const response = await aiClient.completeChat({
            model: chunkPrompt.options.model || modelConfig.defaultModel,
            messages: chunkPrompt.messages,
            max_tokens: chunkPrompt.options.maxTokens || modelConfig.maxOutputTokens,
            temperature: chunkPrompt.options.temperature
          }, chunkPrompt.options);
          const chunkDuration = Date.now() - chunkStart;
          monitoring.recordTiming('ai.claude_api_duration', chunkDuration);

          let chunkSummary = '';
          if (response.content && Array.isArray(response.content)) {
            for (const block of response.content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                chunkSummary += block.text;
              }
            }
          }
          if (!chunkSummary && response.content) {
            chunkSummary = JSON.stringify(response.content);
          }
          chunkSummaries.push(chunkSummary);
          inputTokens += response.usage?.input_tokens || 0;
          outputTokens += response.usage?.output_tokens || 0;
          modelUsed = response.model || modelUsed;
          cost += calculateCost(modelUsed, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);
          chunkAttempts += response.executionMetadata?.attempts || 1;
        } catch (chunkError) {
          componentLogger.error('Error summarizing chunk', { summaryId, operationId, chunkIndex: chunkPrompt.chunkIndex, error: chunkError });
          chunkParsingErrors.push(`Chunk ${chunkPrompt.chunkIndex + 1}: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`);
          monitoring.incrementCounter('ai.summarization_chunk_error', 1);
        }
      }
      summaryText = chunkSummaries.join('\n\n---\n\n');
      // Optionally, you could re-summarize the combined chunk summaries in a final pass here
      // For now, just aggregate
      componentLogger.info('Aggregated chunked summaries', { summaryId, operationId, chunkCount: chunkedPrompts.length });
    } else {
      // Not chunked, use normal prompt
      const promptGenerator = getPromptForFilingType(filingRecordFromDB!.formType as SECFilingType, {
        ticker: filingRecordFromDB!.ticker?.symbol,
        companyName: filingRecordFromDB!.ticker?.companyName
      });
      const promptContent = promptGenerator.getFullPrompt(documentContent);
      componentLogger.debug(`Prompt prepared`, {
        summaryId,
        promptType: filingRecordFromDB!.formType,
        promptLength: promptContent.length,
        operationId
      });
      componentLogger.info(`Calling Claude API`, {
        summaryId,
        filingType: filingRecordFromDB!.formType,
        model: claudeOptions?.model || modelConfig.defaultModel,
        operationId
      });
      const apiCallStart = Date.now();
      try {
        const response = await aiClient.completeChat({
          model: claudeOptions?.model || modelConfig.defaultModel,
          messages: [
            { role: 'user', content: promptContent }
          ],
          max_tokens: claudeOptions?.maxTokens || modelConfig.maxOutputTokens,
          temperature: claudeOptions?.temperature
        }, claudeOptions);
      
      const apiCallDuration = Date.now() - apiCallStart;
      monitoring.recordTiming('ai.claude_api_duration', apiCallDuration);
      
      let summaryText = '';
      if (response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            summaryText += block.text; // Concatenate text from all text blocks
          }
        }
      }

      if (!summaryText && response.content) { // If summaryText is still empty but there was content
        componentLogger.warn('No text content extracted from Claude response, using stringified content.', { summaryId, operationId, responseContent: response.content });
        summaryText = JSON.stringify(response.content); // Fallback similar to old behavior for unexpected structure
      } else if (!summaryText) {
        componentLogger.warn('No text content and no response.content found in Claude response.', { summaryId, operationId });
      }
      
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const modelUsed = response.model || (claudeOptions?.model || modelConfig.defaultModel);
      const cost = calculateCost(modelUsed, inputTokens, outputTokens);

      componentLogger.debug(`AI response received`, { summaryId, model: response.model, inputTokens, outputTokens, operationId });
        monitoring.recordValue('ai.tokens_used.input', inputTokens);
        monitoring.recordValue('ai.tokens_used.output', outputTokens);
      
      console.log('\n[DEBUG][ClaudeSummarizer] RAW CLAUDE RESPONSE START ===\n', summaryText, '\n=== RAW CLAUDE RESPONSE END\n');

      componentLogger.info(`Parsing response JSON`, { summaryId, operationId });
      const parsingStartTime = Date.now();
      const parsedResult = parseResponse(summaryText, filingRecordFromDB!.formType as SECFilingType);
      const parsingDuration = Date.now() - parsingStartTime;

      if (parsedResult.success && parsedResult.data) {
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        componentLogger.info(`Successfully parsed response JSON`, { summaryId, operationId });
        
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
        componentLogger.warn(`Failed to parse valid JSON from response`, {
          summaryId,
          filingType: filingRecordFromDB!.formType,
          parsingErrors: parsedResult.errors,
          operationId
        });
        
        monitoring.incrementCounter('ai.summarization_parsing_error', 1);
        
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            summaryText, 
            processingStatus: 'COMPLETED_WITH_WARNINGS',
            processingCompletedAt: new Date(),
            isPartialResult: true,
            processingTimeMs: Date.now() - startTime,
            processingError: 'Failed to parse JSON response: ' + parsedResult.errors?.join('; '),
            tokensUsed: inputTokens + outputTokens,
            model: response.model,
            cost,
            attempts: response.executionMetadata?.attempts || 1
          }
        });
        
        return {
          summaryId,
          summaryText,
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
      componentLogger.error(`Error calling Claude API`, {
        error: error instanceof Error ? error.message : String(error),
        summaryId,
        filingType: filingRecordFromDB!.formType,
        operationId
      });
      
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