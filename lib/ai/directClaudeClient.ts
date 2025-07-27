/**
 * Direct Claude Client - Tranche 2 Migration
 * 
 * Simplified Claude API integration based on test-summarize patterns
 * Replaces complex summarization chain with direct, efficient processing
 */

import Anthropic from '@anthropic-ai/sdk';
import { FilingType } from '../sec-edgar/types';
import { getFormMetadata } from '../sec-edgar/form-registry';
import { estimateTokenCount } from './token-counter';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

const claudeLogger = logger.child('direct-claude-client');

// Safe monitoring wrapper
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};

/**
 * Configuration for Claude summarization
 */
export interface ClaudeSummarizationConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  enableChunking?: boolean;
  maxTokensPerChunk?: number;
}

/**
 * Result from Claude summarization
 */
export interface ClaudeSummarizationResult {
  summary: string | Record<string, any>;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
  model: string;
  chunksProcessed?: number;
  metadata?: Record<string, any>;
}

/**
 * Calculate estimated cost based on token counts
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  // Claude Sonnet 3.5 pricing: $3 per 1M input tokens, $15 per 1M output tokens
  const inputCost = (inputTokens / 1000000) * 3;
  const outputCost = (outputTokens / 1000000) * 15;
  return inputCost + outputCost;
}

/**
 * Split content into chunks that fit within token limits
 */
function chunkContent(content: string, maxTokensPerChunk: number = 50000): string[] {
  // Conservative estimate: 1 token ≈ 3 characters for SEC filings
  const maxCharsPerChunk = maxTokensPerChunk * 3;
  
  if (content.length <= maxCharsPerChunk) {
    return [content];
  }
  
  const chunks: string[] = [];
  let currentPos = 0;
  
  while (currentPos < content.length) {
    let chunkEnd = currentPos + maxCharsPerChunk;
    
    // Try to break at sensible points
    if (chunkEnd < content.length) {
      const breakPoints = [
        content.lastIndexOf('\n\n', chunkEnd),
        content.lastIndexOf('</p>', chunkEnd),
        content.lastIndexOf('</div>', chunkEnd),
        content.lastIndexOf('. ', chunkEnd)
      ];
      
      const bestBreak = Math.max(...breakPoints.filter(pos => pos > currentPos + maxCharsPerChunk * 0.8));
      if (bestBreak > currentPos) {
        chunkEnd = bestBreak + 1;
      }
    }
    
    chunks.push(content.slice(currentPos, chunkEnd));
    currentPos = chunkEnd;
  }
  
  return chunks;
}

/**
 * Generate optimized prompt for SEC filing summarization
 */
function generateOptimizedPrompt(
  filingType: FilingType, 
  content: string, 
  context: { ticker?: string; companyName?: string } = {}
): string {
  const metadata = getFormMetadata(filingType);
  const filingTypeDisplay = metadata?.displayName || filingType;
  
  let contextStr = '';
  if (context.companyName) {
    contextStr += `Company: ${context.companyName}\n`;
  }
  if (context.ticker) {
    contextStr += `Ticker: ${context.ticker}\n`;
  }
  
  return `You are an expert financial analyst tasked with summarizing a ${filingTypeDisplay} SEC filing.
${contextStr}
Please analyze the following filing content and extract the most important information:

${content}

IMPORTANT: Your response MUST be valid JSON. Do not include any text before or after the JSON.

Structure your analysis as a JSON object with the following format:
{
  "summary": "A concise 2-3 sentence overview of the most important takeaways",
  "financialPerformance": [
    {
      "metric": "Revenue",
      "value": "$X million/billion",
      "yearOverYearChange": "+/-X%",
      "insight": "Brief explanation of significance"
    }
  ],
  "businessHighlights": [
    {
      "topic": "Topic name",
      "detail": "Detailed explanation",
      "impact": "Analysis of business impact"
    }
  ],
  "riskFactors": [
    {
      "category": "Risk category",
      "description": "Description of the risk",
      "potentialImpact": "Analysis of potential impact"
    }
  ],
  "keyTakeaway": "Single most important insight for investors"
}`;
}

/**
 * Generate prompt for chunk processing
 */
function generateChunkPrompt(
  filingType: string, 
  content: string, 
  chunkIndex: number, 
  totalChunks: number, 
  context: { ticker?: string; companyName?: string } = {}
): string {
  let contextStr = '';
  if (context.companyName) {
    contextStr += `Company: ${context.companyName}\n`;
  }
  if (context.ticker) {
    contextStr += `Ticker: ${context.ticker}\n`;
  }
  
  return `You are analyzing part ${chunkIndex + 1} of ${totalChunks} of a ${filingType} SEC filing.
${contextStr}
Extract key information from this section and provide a structured summary focusing on:
- Financial metrics and performance data
- Business developments and strategic initiatives  
- Risk factors and material changes
- Any other significant information for investors

Content to analyze:

${content}

Respond with a JSON object containing:
{
  "chunkSummary": "2-3 sentence summary of this section",
  "keyFinancials": [{"metric": "name", "value": "amount", "insight": "explanation"}],
  "businessUpdates": [{"topic": "area", "detail": "description", "impact": "significance"}],
  "risks": [{"category": "type", "description": "risk description"}],
  "importantPoints": ["bullet point 1", "bullet point 2"]
}`;
}

/**
 * Direct Claude API client with simplified processing
 */
export class DirectClaudeClient {
  private anthropic: Anthropic;
  private defaultConfig: Required<ClaudeSummarizationConfig>;

  constructor(config: ClaudeSummarizationConfig = {}) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.defaultConfig = {
      model: config.model || 'claude-3-5-sonnet-20241022',
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.3,
      maxRetries: config.maxRetries || 2,
      enableChunking: config.enableChunking ?? true,
      maxTokensPerChunk: config.maxTokensPerChunk || 50000
    };
  }

  /**
   * Summarize SEC filing content with direct Claude API call
   */
  async summarizeFiling(
    content: string,
    filingType: FilingType,
    context: { ticker?: string; companyName?: string } = {},
    config: Partial<ClaudeSummarizationConfig> = {}
  ): Promise<ClaudeSummarizationResult> {
    const startTime = Date.now();
    const finalConfig = { ...this.defaultConfig, ...config };
    
    claudeLogger.info(`Starting direct Claude summarization for ${filingType}`, {
      ticker: context.ticker,
      contentLength: content.length,
      enableChunking: finalConfig.enableChunking
    });

    try {
      // Generate prompt and estimate tokens
      const prompt = generateOptimizedPrompt(filingType, content, context);
      const inputTokens = estimateTokenCount(prompt);
      const maxTokensAllowed = 100000; // Conservative limit

      let processMode: 'single' | 'chunked' = 'single';
      
      if (inputTokens > maxTokensAllowed && finalConfig.enableChunking) {
        processMode = 'chunked';
        claudeLogger.info(`Content too large (${inputTokens} tokens), switching to chunked processing`);
      }

      let result: ClaudeSummarizationResult;

      if (processMode === 'chunked') {
        result = await this.processInChunks(content, filingType, context, finalConfig);
      } else {
        result = await this.processSingle(prompt, finalConfig);
      }

      safeMonitoring.recordDuration('direct_claude_summarization_total_ms', Date.now() - startTime, {
        filingType,
        ticker: context.ticker || 'unknown',
        mode: processMode,
        success: 'true'
      });

      claudeLogger.info(`Direct Claude summarization completed`, {
        filingType,
        ticker: context.ticker,
        mode: processMode,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        duration: Date.now() - startTime
      });

      return {
        ...result,
        duration: Date.now() - startTime
      };

    } catch (error) {
      safeMonitoring.recordDuration('direct_claude_summarization_error_ms', Date.now() - startTime, {
        filingType,
        ticker: context.ticker || 'unknown',
        success: 'false'
      });

      claudeLogger.error(`Direct Claude summarization failed:`, error);
      throw error;
    }
  }

  /**
   * Process content in a single Claude API call
   */
  private async processSingle(
    prompt: string, 
    config: Required<ClaudeSummarizationConfig>
  ): Promise<ClaudeSummarizationResult> {
    const apiStart = Date.now();
    
    const response = await this.anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    safeMonitoring.recordDuration('direct_claude_api_call_ms', Date.now() - apiStart, {
      mode: 'single'
    });

    const responseText = response.content[0]?.text || '';
    
    // Try to parse as JSON
    let summaryText: string | Record<string, any> = responseText;
    try {
      if (responseText.trim().startsWith('{') && responseText.trim().endsWith('}')) {
        summaryText = JSON.parse(responseText);
      }
    } catch (jsonError) {
      claudeLogger.warn(`Failed to parse Claude response as JSON, using raw text`);
    }

    const cost = calculateCost(response.usage.input_tokens, response.usage.output_tokens);

    return {
      summary: summaryText,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
      duration: 0, // Set by caller
      model: config.model
    };
  }

  /**
   * Process content in chunks for large documents
   */
  private async processInChunks(
    content: string,
    filingType: FilingType,
    context: { ticker?: string; companyName?: string },
    config: Required<ClaudeSummarizationConfig>
  ): Promise<ClaudeSummarizationResult> {
    const chunks = chunkContent(content, config.maxTokensPerChunk);
    const chunkSummaries: any[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    claudeLogger.info(`Processing ${chunks.length} chunks for chunked summarization`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = generateChunkPrompt(
        filingType, 
        chunks[i], 
        i, 
        chunks.length, 
        context
      );
      
      const chunkTokens = estimateTokenCount(chunkPrompt);
      claudeLogger.debug(`Processing chunk ${i + 1}/${chunks.length}, tokens: ${chunkTokens}`);
      
      // Skip chunks that are still too large
      if (chunkTokens > 190000) {
        claudeLogger.warn(`Skipping chunk ${i + 1} - still too large (${chunkTokens} tokens)`);
        chunkSummaries.push({ 
          chunkSummary: `Chunk ${i + 1} was too large to process (${chunkTokens} tokens)`,
          skipped: true 
        });
        continue;
      }
      
      const apiStart = Date.now();
      const chunkResponse = await this.anthropic.messages.create({
        model: config.model,
        max_tokens: Math.min(config.maxTokens, 2000),
        temperature: config.temperature,
        messages: [
          {
            role: 'user',
            content: chunkPrompt
          }
        ]
      });

      safeMonitoring.recordDuration('direct_claude_api_call_ms', Date.now() - apiStart, {
        mode: 'chunked',
        chunkIndex: i.toString()
      });
      
      const chunkText = chunkResponse.content[0]?.text || '';
      totalInputTokens += chunkResponse.usage.input_tokens;
      totalOutputTokens += chunkResponse.usage.output_tokens;
      
      // Try to parse chunk response as JSON
      try {
        if (chunkText.trim().startsWith('{') && chunkText.trim().endsWith('}')) {
          chunkSummaries.push(JSON.parse(chunkText));
        } else {
          chunkSummaries.push({ chunkSummary: chunkText });
        }
      } catch (jsonError) {
        chunkSummaries.push({ chunkSummary: chunkText });
      }
    }
    
    // Aggregate chunk summaries into final summary
    const aggregatedSummary = {
      summary: `Analyzed ${chunks.length} sections of ${context.companyName || 'the company'}'s ${filingType} filing.`,
      financialPerformance: chunkSummaries.flatMap(chunk => chunk.keyFinancials || []).slice(0, 10),
      businessHighlights: chunkSummaries.flatMap(chunk => chunk.businessUpdates || []).slice(0, 10),
      riskFactors: chunkSummaries.flatMap(chunk => chunk.risks || []).slice(0, 10),
      keyTakeaway: `This ${filingType} filing contains ${chunks.length} major sections with detailed financial and business information.`,
      chunkSummaries: chunkSummaries.map(chunk => chunk.chunkSummary || '').filter(Boolean)
    };
    
    const totalCost = calculateCost(totalInputTokens, totalOutputTokens);
    
    return {
      summary: aggregatedSummary,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cost: totalCost,
      duration: 0, // Set by caller
      model: config.model,
      chunksProcessed: chunks.length
    };
  }
}

/**
 * Default instance for convenience
 */
export const directClaude = new DirectClaudeClient();