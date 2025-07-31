import Anthropic from '@anthropic-ai/sdk';
import { FilingType } from '../../../types/sec/filing';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { logger } from '../../../lib/logging';
import { ContentChunk, ChunkingResult, calculateTokenCost } from './contentChunker';

// Create a module-specific logger
const aiLogger = logger.child('enhanced-ai-summarizer');

/**
 * AI summarization options
 */
export interface SummarizationOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  timeout?: number;
  enableFallback?: boolean;
}

/**
 * Structured summary response format
 */
export interface StructuredSummary {
  summary: string;
  financialPerformance: Array<{
    metric: string;
    value: string;
    yearOverYearChange?: string;
    insight: string;
  }>;
  businessHighlights: Array<{
    topic: string;
    detail: string;
    impact: string;
  }>;
  riskFactors: Array<{
    category: string;
    description: string;
    potentialImpact: string;
  }>;
  keyTakeaway: string;
  chunkSummaries?: string[];
}

/**
 * AI summarization result
 */
export interface SummarizationResult {
  summary: StructuredSummary;
  metadata: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    processingTimeMs: number;
    model: string;
    chunksProcessed?: number;
    chunkingStrategy?: string;
  };
  success: boolean;
  error?: string;
}

/**
 * Chunk summary for aggregation
 */
interface ChunkSummary {
  chunkSummary: string;
  keyFinancials?: Array<{
    metric: string;
    value: string;
    insight: string;
  }>;
  businessUpdates?: Array<{
    topic: string;
    detail: string;
    impact: string;
  }>;
  risks?: Array<{
    category: string;
    description: string;
  }>;
  importantPoints?: string[];
  skipped?: boolean;
}

/**
 * Create Anthropic client
 */
function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  
  return new Anthropic({ apiKey });
}

/**
 * Generate a structured prompt for SEC filing summarization
 * @param filingType The type of filing
 * @param content The content to summarize
 * @param companyName Company name for context
 * @param ticker Ticker symbol for context
 * @returns A customized prompt with content
 */
export function generateStructuredPrompt(
  filingType: FilingType,
  content: string,
  companyName?: string,
  ticker?: string
): string {
  // Get metadata for the filing type
  const metadata = getFormMetadata(filingType);
  const filingTypeDisplay = metadata?.displayName || filingType;
  
  // Create context string
  let contextStr = '';
  if (companyName) {
    contextStr += `Company: ${companyName}\n`;
  }
  if (ticker) {
    contextStr += `Ticker: ${ticker}\n`;
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
 * Generate a chunk-specific prompt for processing individual content chunks
 */
export function generateChunkPrompt(
  filingType: string,
  content: string,
  chunkIndex: number,
  totalChunks: number,
  companyName?: string,
  ticker?: string
): string {
  let contextStr = '';
  if (companyName) {
    contextStr += `Company: ${companyName}\n`;
  }
  if (ticker) {
    contextStr += `Ticker: ${ticker}\n`;
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
 * Parse AI response with fallback handling
 */
function parseAIResponse<T>(responseText: string, fallbackData?: Partial<T>): T | null {
  try {
    // Clean response text
    const cleanedText = responseText.trim();
    
    // Check if the response looks like JSON
    if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
      return JSON.parse(cleanedText) as T;
    }
    
    // Try to extract JSON from within the response
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    
    // If we have fallback data, use it
    if (fallbackData) {
      aiLogger.warn('Failed to parse JSON response, using fallback data');
      return { ...fallbackData, summary: cleanedText } as T;
    }
    
    return null;
  } catch (error) {
    aiLogger.warn(`Failed to parse AI response as JSON: ${error}`, {
      responsePreview: responseText.slice(0, 200)
    });
    
    // Return fallback with raw text if available
    if (fallbackData) {
      return { ...fallbackData, summary: responseText } as T;
    }
    
    return null;
  }
}

/**
 * Process a single content chunk with AI summarization
 */
async function processChunk(
  chunk: ContentChunk,
  filingType: string,
  totalChunks: number,
  companyName?: string,
  ticker?: string,
  options: SummarizationOptions = {}
): Promise<{ summary: ChunkSummary; inputTokens: number; outputTokens: number }> {
  const { model = 'claude-3-5-sonnet-20241022', maxTokens = 2000, temperature = 0.3 } = options;
  
  const anthropic = createAnthropicClient();
  
  const prompt = generateChunkPrompt(
    filingType,
    chunk.content,
    chunk.index,
    totalChunks,
    companyName,
    ticker
  );
  
  // Skip chunks that are still too large even after chunking
  if (chunk.tokenCount > 190000) {
    aiLogger.warn(`Skipping chunk ${chunk.index + 1} - too large (${chunk.tokenCount} tokens)`);
    return {
      summary: {
        chunkSummary: `Chunk ${chunk.index + 1} was too large to process (${chunk.tokenCount} tokens)`,
        skipped: true
      },
      inputTokens: 0,
      outputTokens: 0
    };
  }
  
  aiLogger.debug(`Processing chunk ${chunk.index + 1}/${totalChunks}`, {
    tokenCount: chunk.tokenCount,
    breakType: chunk.breakType
  });
  
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsedSummary = parseAIResponse<ChunkSummary>(responseText, {
      chunkSummary: responseText
    });
    
    return {
      summary: parsedSummary || { chunkSummary: responseText },
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    };
  } catch (error) {
    aiLogger.error(`Error processing chunk ${chunk.index + 1}: ${error}`);
    return {
      summary: {
        chunkSummary: `Error processing chunk ${chunk.index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        skipped: true
      },
      inputTokens: 0,
      outputTokens: 0
    };
  }
}

/**
 * Aggregate multiple chunk summaries into a final structured summary
 */
function aggregateChunkSummaries(
  chunkSummaries: ChunkSummary[],
  companyName?: string,
  filingType?: string
): StructuredSummary {
  const validSummaries = chunkSummaries.filter(s => !s.skipped);
  
  // Aggregate financial performance
  const financialPerformance = validSummaries
    .flatMap(s => s.keyFinancials || [])
    .slice(0, 10); // Limit to top 10
  
  // Aggregate business highlights
  const businessHighlights = validSummaries
    .flatMap(s => s.businessUpdates || [])
    .slice(0, 10); // Limit to top 10
  
  // Aggregate risk factors
  const riskFactors = validSummaries
    .flatMap(s => s.risks?.map(r => ({
      category: r.category,
      description: r.description,
      potentialImpact: 'Requires further analysis'
    })) || [])
    .slice(0, 10); // Limit to top 10
  
  // Create summary from chunk summaries
  const chunkTexts = validSummaries
    .map(s => s.chunkSummary)
    .filter(Boolean);
  
  const summary = `Analyzed ${chunkSummaries.length} sections of ${companyName || 'the company'}'s ${filingType || 'SEC'} filing. ` +
    `Key insights extracted from ${validSummaries.length} processable sections.`;
  
  const keyTakeaway = validSummaries.length > 0
    ? `This ${filingType || 'SEC'} filing contains ${chunkSummaries.length} major sections with detailed financial and business information.`
    : `Unable to process most sections of this ${filingType || 'SEC'} filing due to size constraints.`;
  
  return {
    summary,
    financialPerformance,
    businessHighlights,
    riskFactors,
    keyTakeaway,
    chunkSummaries: chunkTexts
  };
}

/**
 * Summarize content using chunked processing
 */
export async function summarizeWithChunking(
  chunkingResult: ChunkingResult,
  filingType: FilingType,
  companyName?: string,
  ticker?: string,
  options: SummarizationOptions = {}
): Promise<SummarizationResult> {
  const startTime = Date.now();
  
  aiLogger.info(`Starting chunked summarization`, {
    totalChunks: chunkingResult.totalChunks,
    totalTokens: chunkingResult.totalTokens,
    filingType,
    companyName,
    ticker
  });
  
  try {
    const chunkSummaries: ChunkSummary[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    // Process each chunk
    for (const chunk of chunkingResult.chunks) {
      const result = await processChunk(
        chunk,
        filingType,
        chunkingResult.totalChunks,
        companyName,
        ticker,
        options
      );
      
      chunkSummaries.push(result.summary);
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
    }
    
    // Aggregate chunk summaries
    const aggregatedSummary = aggregateChunkSummaries(
      chunkSummaries,
      companyName,
      filingType
    );
    
    const totalCost = calculateTokenCost(totalInputTokens, totalOutputTokens);
    const processingTimeMs = Date.now() - startTime;
    
    aiLogger.info(`Chunked summarization completed`, {
      totalChunks: chunkingResult.totalChunks,
      processedChunks: chunkSummaries.filter(s => !s.skipped).length,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      processingTimeMs
    });
    
    return {
      summary: aggregatedSummary,
      metadata: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        cost: totalCost,
        processingTimeMs,
        model: options.model || 'claude-3-5-sonnet-20241022',
        chunksProcessed: chunkingResult.totalChunks,
        chunkingStrategy: chunkingResult.chunkingStrategy
      },
      success: true
    };
  } catch (error) {
    aiLogger.error(`Error in chunked summarization: ${error}`);
    return {
      summary: {
        summary: `Error during chunked summarization: ${error instanceof Error ? error.message : String(error)}`,
        financialPerformance: [],
        businessHighlights: [],
        riskFactors: [],
        keyTakeaway: 'Unable to process filing due to technical error'
      },
      metadata: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        processingTimeMs: Date.now() - startTime,
        model: options.model || 'claude-3-5-sonnet-20241022',
        chunksProcessed: 0
      },
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Summarize content in a single API call
 */
export async function summarizeSingle(
  content: string,
  filingType: FilingType,
  companyName?: string,
  ticker?: string,
  options: SummarizationOptions = {}
): Promise<SummarizationResult> {
  const startTime = Date.now();
  const { model = 'claude-3-5-sonnet-20241022', maxTokens = 4000, temperature = 0.3 } = options;
  
  aiLogger.info(`Starting single summarization`, {
    contentLength: content.length,
    filingType,
    companyName,
    ticker
  });
  
  try {
    const anthropic = createAnthropicClient();
    const prompt = generateStructuredPrompt(filingType, content, companyName, ticker);
    
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsedSummary = parseAIResponse<StructuredSummary>(responseText, {
      summary: responseText,
      financialPerformance: [],
      businessHighlights: [],
      riskFactors: [],
      keyTakeaway: 'Unable to parse structured response'
    });
    
    if (!parsedSummary) {
      throw new Error('Failed to parse AI response');
    }
    
    const totalCost = calculateTokenCost(response.usage.input_tokens, response.usage.output_tokens);
    const processingTimeMs = Date.now() - startTime;
    
    aiLogger.info(`Single summarization completed`, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalCost,
      processingTimeMs
    });
    
    return {
      summary: parsedSummary,
      metadata: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        cost: totalCost,
        processingTimeMs,
        model
      },
      success: true
    };
  } catch (error) {
    aiLogger.error(`Error in single summarization: ${error}`);
    return {
      summary: {
        summary: `Error during summarization: ${error instanceof Error ? error.message : String(error)}`,
        financialPerformance: [],
        businessHighlights: [],
        riskFactors: [],
        keyTakeaway: 'Unable to process filing due to technical error'
      },
      metadata: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        processingTimeMs: Date.now() - startTime,
        model
      },
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}