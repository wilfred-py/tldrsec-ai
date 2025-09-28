/**
 * Enhanced Document Chunking
 * 
 * Provides advanced document chunking strategies with the ability to process
 * all chunks and combine their results for comprehensive summarization.
 */

import { estimateTokenCount, splitDocumentIntoChunks, getContextConfig } from '../prompts/context-manager';
import { SECFilingType } from '../prompts/prompt-types';
import { SummarizationOptions, SummarizationResult, summarizeFiling } from '../summarize';
import { logger } from '../../logging';
import { v4 as uuidv4 } from 'uuid';
import { monitoring } from '../../monitoring';

// Logger for this component
const componentLogger = logger.child('enhanced-chunker');

/**
 * Process document content for summarization with enhanced chunking
 * - Checks if document needs chunking based on token count
 * - Either returns full document or processes it into chunks
 * 
 * @param content - The document content to process
 * @param filingType - The type of SEC filing
 * @param maxTokens - Maximum tokens allowed
 * @returns Processed document content and chunking info
 */
export function processDocumentContent(
  content: string, 
  filingType: SECFilingType, 
  maxTokens: number = 150000
): {
  processedContent: string;
  chunks: string[];
  isChunked: boolean;
  chunkCount: number;
  estimatedTokens: number;
} {
  // Estimate current token count
  const estimatedTokens = estimateTokenCount(content);
  
  // If we're already under the limit, return the full content
  if (estimatedTokens <= maxTokens * 0.85) { // Using 85% of max as safety margin
    return {
      processedContent: content,
      chunks: [content],
      isChunked: false,
      chunkCount: 1,
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
  
  // Return all chunks and chunking info
  return {
    processedContent: chunks[0], // For backward compatibility
    chunks,
    isChunked: true,
    chunkCount: chunks.length,
    estimatedTokens
  };
}

/**
 * Process all chunks of a document and combine the results
 * 
 * @param chunks - Array of document chunks
 * @param filingType - The type of SEC filing
 * @param options - Summarization options
 * @returns Combined summarization result
 */
export async function processAllChunks(
  chunks: string[], 
  filingType: SECFilingType, 
  options: SummarizationOptions
): Promise<SummarizationResult> {
  const startTime = Date.now();
  const results: SummarizationResult[] = [];
  const errors: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  
  componentLogger.info(`Processing ${chunks.length} chunks for filing ${options.filingId}`);
  monitoring.incrementCounter('ai.chunking.chunks_processed', chunks.length);
  
  // Process each chunk sequentially
  for (let i = 0; i < chunks.length; i++) {
    try {
      componentLogger.info(`Processing chunk ${i+1}/${chunks.length} for filing ${options.filingId}`);
      
      // Create a unique summary ID for this chunk
      const chunkSummaryId = options.summaryId ? `${options.summaryId}-chunk-${i+1}` : uuidv4();
      
      // Process this chunk
      const chunkResult = await summarizeFiling({
        ...options,
        summaryId: chunkSummaryId,
        documentContent: chunks[i],
        claudeOptions: {
          ...options.claudeOptions,
          metadata: {
            ...options.claudeOptions?.metadata,
            chunkIndex: `${i+1}`,
            totalChunks: `${chunks.length}`,
            isChunk: 'true'
          }
        }
      });
      
      results.push(chunkResult);
      
      // Track token usage and cost
      totalInputTokens += chunkResult.inputTokens || 0;
      totalOutputTokens += chunkResult.outputTokens || 0;
      totalCost += chunkResult.cost || 0;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      componentLogger.error(`Error processing chunk ${i+1}/${chunks.length}: ${errorMessage}`);
      errors.push(`Chunk ${i+1}: ${errorMessage}`);
      monitoring.incrementCounter('ai.chunking.chunk_errors', 1);
    }
  }
  
  // If we have no successful results, throw an error
  if (results.length === 0) {
    throw new Error(`Failed to process any chunks: ${errors.join('; ')}`);
  }
  
  // Combine the results
  const combinedResult = combineChunkResults(results, options.summaryId || uuidv4());
  
  // Add metadata about the chunking process
  combinedResult.duration = Date.now() - startTime;
  combinedResult.inputTokens = totalInputTokens;
  combinedResult.outputTokens = totalOutputTokens;
  combinedResult.cost = totalCost;
  
  // If we have any errors but some successful results, mark as partial
  if (errors.length > 0) {
    combinedResult.isPartial = true;
    combinedResult.parsingErrors = errors;
  }
  
  componentLogger.info(`Completed processing ${chunks.length} chunks for filing ${options.filingId} in ${combinedResult.duration}ms`);
  monitoring.recordTiming('ai.chunking.total_processing_time', combinedResult.duration);
  
  return combinedResult;
}

/**
 * Combine results from multiple chunks into a single coherent result
 * 
 * @param results - Array of chunk results
 * @param summaryId - ID for the combined summary
 * @returns Combined summarization result
 */
export function combineChunkResults(
  results: SummarizationResult[], 
  summaryId: string
): SummarizationResult {
  // If there's only one result, just return it with the new summary ID
  if (results.length === 1) {
    return {
      ...results[0],
      summaryId
    };
  }
  
  componentLogger.info(`Combining ${results.length} chunk results`);
  
  // Extract and combine JSON data if available
  let combinedJSON: Record<string, unknown> = {};
  let combinedText = '';
  const modelUsed = results[0].modelUsed; // Use the model from the first result
  
  // Combine JSON data
  results.forEach((result, index) => {
    if (result.summaryJSON) {
      // For each section in the JSON, combine arrays or append text
      Object.entries(result.summaryJSON).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // If it's an array, concatenate with existing array or create new one
          if (!combinedJSON[key]) {
            combinedJSON[key] = [];
          }
          if (Array.isArray(combinedJSON[key])) {
            (combinedJSON[key] as unknown[]).push(...value);
          }
        } else if (typeof value === 'string') {
          // If it's a string, append with a separator
          if (!combinedJSON[key]) {
            combinedJSON[key] = value;
          } else if (typeof combinedJSON[key] === 'string') {
            combinedJSON[key] = `${combinedJSON[key]}\n\n${value}`;
          }
        } else {
          // For other types (objects, numbers), use the most complete or recent one
          if (!combinedJSON[key] || Object.keys(value as object).length > Object.keys(combinedJSON[key] as object).length) {
            combinedJSON[key] = value;
          }
        }
      });
    }
    
    // Combine text summaries
    if (result.summaryText) {
      if (typeof result.summaryText === 'string') {
        combinedText += (combinedText ? '\n\n' : '') + 
          `${index > 0 ? `PART ${index + 1}:\n` : ''}${result.summaryText}`;
      } else if (typeof result.summaryText === 'object') {
        // If summary text is an object, merge it into combinedJSON
        combinedJSON = {
          ...combinedJSON,
          ...(result.summaryText as Record<string, unknown>)
        };
      }
    }
  });
  
  // Deduplicate arrays in combined JSON
  Object.keys(combinedJSON).forEach(key => {
    if (Array.isArray(combinedJSON[key])) {
      // Convert to Set and back to array to remove duplicates
      combinedJSON[key] = [...new Set(combinedJSON[key] as unknown[])];
    }
  });
  
  // Create the combined result
  return {
    summaryId,
    summaryText: combinedText || 'Combined summary from multiple document chunks',
    summaryJSON: Object.keys(combinedJSON).length > 0 ? combinedJSON : undefined,
    duration: results.reduce((sum, result) => sum + (result.duration || 0), 0),
    modelUsed,
    attempts: results.reduce((sum, result) => sum + (result.attempts || 1), 0),
    isPartial: results.some(result => result.isPartial)
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
export function truncateDocumentContent(content: string, maxTokens: number): string {
  // Estimate current token count
  const currentTokens = estimateTokenCount(content);
  
  // If already under limit, return as is
  if (currentTokens <= maxTokens) {
    return content;
  }
  
  // Split document into sections/paragraphs
  const sections = content.split(/\n\n+/);
  
  
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
    
    // Prioritize shorter sections (more likely to be headers or key points)
    if (section.length < 100) {
      priority += 1;
    }
    
    return { section, priority, index };
  });
  
  // Sort sections by priority (high to low)
  prioritizedSections.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // If same priority, maintain original order
    return a.index - b.index;
  });
  
  // Keep sections until we hit the token limit
  let truncatedContent = '';
  let currentTokenCount = 0;
  const sectionsToKeep = [];
  
  for (const { section, index } of prioritizedSections) {
    const sectionTokens = estimateTokenCount(section);
    if (currentTokenCount + sectionTokens <= maxTokens * 0.95) { // 95% to be safe
      sectionsToKeep.push({ section, index });
      currentTokenCount += sectionTokens;
    }
  }
  
  // Sort back to original document order
  sectionsToKeep.sort((a, b) => a.index - b.index);
  
  // Combine sections
  truncatedContent = sectionsToKeep.map(item => item.section).join('\n\n');
  
  // Add a note about truncation
  truncatedContent += '\n\n[Document was truncated due to length]';
  
  return truncatedContent;
}
