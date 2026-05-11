import { calculateCost, estimateTokenCount } from '../../../lib/ai/token-counter';
import { logger } from '../../../lib/logging';

// Create a module-specific logger
const chunkLogger = logger.child('enhanced-content-chunker');

/**
 * Content chunking options
 */
export interface ChunkingOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
  preserveStructure?: boolean;
  minChunkSize?: number;
}

/**
 * Predefined chunking strategies
 */
export const CHUNKING_STRATEGIES = {
  // Aggressive chunking for large documents - high token usage
  AGGRESSIVE: {
    maxTokensPerChunk: 50000,
    overlapTokens: 500,
    preserveStructure: true,
    minChunkSize: 1000
  } as ChunkingOptions,
  
  // Balanced chunking - moderate token usage
  BALANCED: {
    maxTokensPerChunk: 25000,
    overlapTokens: 300,
    preserveStructure: true,
    minChunkSize: 800
  } as ChunkingOptions,
  
  // Conservative chunking for rate limit management - low token usage
  CONSERVATIVE: {
    maxTokensPerChunk: 15000,
    overlapTokens: 200,
    preserveStructure: true,
    minChunkSize: 600
  } as ChunkingOptions,
  
  // Minimal chunking for testing/debugging - very low token usage
  MINIMAL: {
    maxTokensPerChunk: 8000,
    overlapTokens: 100,
    preserveStructure: true,
    minChunkSize: 400
  } as ChunkingOptions
};

/**
 * Content chunk metadata
 */
export interface ContentChunk {
  content: string;
  index: number;
  tokenCount: number;
  startPosition: number;
  endPosition: number;
  breakType: 'paragraph' | 'section' | 'sentence' | 'hard';
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: ContentChunk[];
  totalTokens: number;
  totalChunks: number;
  averageTokensPerChunk: number;
  estimatedCost: number;
  chunkingStrategy: string;
}

/**
 * Token cost calculation
 */
export interface TokenCostEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/**
 * Calculate estimated cost based on token counts.
 *
 * Thin wrapper around lib/ai/token-counter.calculateCost() to preserve the
 * single-number return shape used by 7 callers (this file + aiSummarizer.ts +
 * the index re-export). Previously hardcoded Claude-era pricing ($3/$15 per
 * million) which was 6× too high for grok-4.1-fast and 2.4× too high for
 * grok-4.3 — every chunked-summary cost estimate was wrong.
 */
export function calculateTokenCost(inputTokens: number, outputTokens: number): number {
  return calculateCost(inputTokens, outputTokens).totalCost;
}

/**
 * Estimate cost for single or chunked processing
 */
export function estimateProcessingCost(
  content: string,
  maxTokensPerChunk: number = 50000,
  estimatedOutputTokensPerChunk: number = 1000
): TokenCostEstimate {
  const totalTokens = estimateTokenCount(content);
  
  if (totalTokens <= maxTokensPerChunk) {
    // Single processing — one call, billed at whichever tier matches its size.
    const estimatedOutputTokens = Math.ceil(totalTokens * 0.3);
    return {
      inputTokens: totalTokens,
      estimatedOutputTokens,
      totalTokens: totalTokens + estimatedOutputTokens,
      estimatedCost: calculateTokenCost(totalTokens, estimatedOutputTokens)
    };
  } else {
    // Chunked processing — N independent API calls. Each chunk bills as its
    // own request, so the per-chunk size is what determines the pricing tier
    // (NOT the cross-chunk sum). Previously this passed `totalTokens` into
    // `calculateTokenCost`, which now sees >200K and switches to the high tier;
    // but each actual chunk is ≤maxTokensPerChunk (default 50K) and bills at
    // the low tier — over-estimating spend by 2x on long filings.
    const numberOfChunks = Math.ceil(totalTokens / maxTokensPerChunk);
    const estimatedOutputTokens = numberOfChunks * estimatedOutputTokensPerChunk;
    const perChunkCost = calculateTokenCost(maxTokensPerChunk, estimatedOutputTokensPerChunk);
    return {
      inputTokens: totalTokens,
      estimatedOutputTokens,
      totalTokens: totalTokens + estimatedOutputTokens,
      estimatedCost: perChunkCost * numberOfChunks
    };
  }
}

/**
 * Split content into chunks that fit within token limits with intelligent boundary detection
 * @param content The content to chunk
 * @param options Chunking configuration options
 * @returns Array of content chunks with metadata
 */
export function chunkContent(content: string, options: ChunkingOptions = {}): ChunkingResult {
  const {
    maxTokensPerChunk = 50000,
    overlapTokens = 500,
    preserveStructure = true,
    minChunkSize = 1000
  } = options;

  chunkLogger.debug(`Starting content chunking`, {
    contentLength: content.length,
    maxTokensPerChunk,
    overlapTokens,
    preserveStructure
  });

  // Rough estimation: 1 token ≈ 3-4 characters for English text
  // Using conservative estimate since SEC filings have dense content
  const maxCharsPerChunk = maxTokensPerChunk * 3;
  const overlapChars = overlapTokens * 3;
  const minCharsPerChunk = minChunkSize * 3;

  if (content.length <= maxCharsPerChunk) {
    const tokenCount = estimateTokenCount(content);
    chunkLogger.debug(`Content fits in single chunk: ${tokenCount} tokens`);
    
    return {
      chunks: [{
        content,
        index: 0,
        tokenCount,
        startPosition: 0,
        endPosition: content.length,
        breakType: 'hard'
      }],
      totalTokens: tokenCount,
      totalChunks: 1,
      averageTokensPerChunk: tokenCount,
      estimatedCost: calculateTokenCost(tokenCount, Math.ceil(tokenCount * 0.3)),
      chunkingStrategy: 'single'
    };
  }

  const chunks: ContentChunk[] = [];
  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < content.length) {
    let chunkEnd = Math.min(currentPos + maxCharsPerChunk, content.length);
    let breakType: 'paragraph' | 'section' | 'sentence' | 'hard' = 'hard';

    // If we're not at the end and preserveStructure is enabled, try to break at a sensible point
    if (chunkEnd < content.length && preserveStructure) {
      const searchStart = Math.max(currentPos, chunkEnd - maxCharsPerChunk * 0.3);
      
      // Look for different types of breaks in order of preference
      const breakPoints: Array<{ position: number; type: typeof breakType }> = [
        // Section breaks (highest priority)
        ...findBreakPoints(content, searchStart, chunkEnd, /\n\s*\n\s*[A-Z][A-Z\s]+\n/g, 'section'),
        
        // Paragraph breaks
        ...findBreakPoints(content, searchStart, chunkEnd, /\n\s*\n/g, 'paragraph'),
        
        // HTML paragraph tags
        ...findBreakPoints(content, searchStart, chunkEnd, /<\/p>/g, 'paragraph'),
        
        // HTML div tags
        ...findBreakPoints(content, searchStart, chunkEnd, /<\/div>/g, 'paragraph'),
        
        // Sentence breaks (lowest priority)
        ...findBreakPoints(content, searchStart, chunkEnd, /\.\s+/g, 'sentence')
      ];

      // Find the best break point (closest to target while being reasonably sized)
      const idealPosition = currentPos + maxCharsPerChunk * 0.85;
      const validBreaks = breakPoints.filter(bp => 
        bp.position > currentPos + minCharsPerChunk && 
        bp.position < chunkEnd
      );

      if (validBreaks.length > 0) {
        // Sort by distance from ideal position, preferring section/paragraph breaks
        validBreaks.sort((a, b) => {
          const aDistance = Math.abs(a.position - idealPosition);
          const bDistance = Math.abs(b.position - idealPosition);
          
          // Prefer section breaks, then paragraph breaks
          if (a.type === 'section' && b.type !== 'section') return -1;
          if (b.type === 'section' && a.type !== 'section') return 1;
          if (a.type === 'paragraph' && b.type === 'sentence') return -1;
          if (b.type === 'paragraph' && a.type === 'sentence') return 1;
          
          return aDistance - bDistance;
        });

        const bestBreak = validBreaks[0];
        chunkEnd = bestBreak.position;
        breakType = bestBreak.type;
      }
    }

    // Extract chunk content
    let chunkContent = content.slice(currentPos, chunkEnd);
    
    // Add overlap from previous chunk if not the first chunk
    if (currentPos > 0 && overlapTokens > 0) {
      const overlapStart = Math.max(0, currentPos - overlapChars);
      const overlapContent = content.slice(overlapStart, currentPos);
      chunkContent = overlapContent + chunkContent;
    }

    const tokenCount = estimateTokenCount(chunkContent);
    
    chunks.push({
      content: chunkContent,
      index: chunkIndex,
      tokenCount,
      startPosition: currentPos,
      endPosition: chunkEnd,
      breakType
    });

    chunkLogger.debug(`Created chunk ${chunkIndex + 1}`, {
      tokenCount,
      charLength: chunkContent.length,
      breakType,
      startPos: currentPos,
      endPos: chunkEnd
    });

    currentPos = chunkEnd;
    chunkIndex++;

    // Safety check to prevent infinite loops
    if (chunkIndex > 100) {
      chunkLogger.warn('Reached maximum chunk limit, stopping chunking');
      break;
    }
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
  const averageTokensPerChunk = Math.round(totalTokens / chunks.length);
  const estimatedOutputTokens = chunks.length * 1000; // Estimate 1000 tokens per chunk summary
  const estimatedCost = calculateTokenCost(totalTokens, estimatedOutputTokens);

  const result: ChunkingResult = {
    chunks,
    totalTokens,
    totalChunks: chunks.length,
    averageTokensPerChunk,
    estimatedCost,
    chunkingStrategy: preserveStructure ? 'structure-aware' : 'character-based'
  };

  chunkLogger.info(`Content chunking completed`, {
    totalChunks: chunks.length,
    totalTokens,
    averageTokensPerChunk,
    estimatedCost,
    strategy: result.chunkingStrategy,
    breakTypes: chunks.reduce((acc, chunk) => {
      acc[chunk.breakType] = (acc[chunk.breakType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  });

  return result;
}

/**
 * Find break points of a specific type within a range
 */
function findBreakPoints(
  content: string,
  start: number,
  end: number,
  pattern: RegExp,
  type: 'paragraph' | 'section' | 'sentence'
): Array<{ position: number; type: typeof type }> {
  const breakPoints: Array<{ position: number; type: typeof type }> = [];
  const searchText = content.slice(start, end);
  
  let match;
  while ((match = pattern.exec(searchText)) !== null) {
    const position = start + match.index + match[0].length;
    breakPoints.push({ position, type });
    
    // Prevent infinite loops with global regex
    if (!pattern.global) break;
  }
  
  return breakPoints;
}

/**
 * Validate that chunks don't exceed token limits
 */
export function validateChunks(chunks: ContentChunk[], maxTokensPerChunk: number): boolean {
  let isValid = true;
  
  chunks.forEach((chunk, index) => {
    if (chunk.tokenCount > maxTokensPerChunk) {
      chunkLogger.warn(`Chunk ${index} exceeds token limit`, {
        chunkIndex: index,
        tokenCount: chunk.tokenCount,
        maxTokensPerChunk,
        contentPreview: chunk.content.slice(0, 200) + '...'
      });
      isValid = false;
    }
  });

  return isValid;
}

/**
 * Get chunking statistics for monitoring and optimization
 */
export function getChunkingStats(result: ChunkingResult): Record<string, any> {
  const { chunks } = result;
  
  const tokenCounts = chunks.map(chunk => chunk.tokenCount);
  const minTokens = Math.min(...tokenCounts);
  const maxTokens = Math.max(...tokenCounts);
  
  const breakTypeDistribution = chunks.reduce((acc, chunk) => {
    acc[chunk.breakType] = (acc[chunk.breakType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalChunks: result.totalChunks,
    totalTokens: result.totalTokens,
    averageTokensPerChunk: result.averageTokensPerChunk,
    minTokensPerChunk: minTokens,
    maxTokensPerChunk: maxTokens,
    estimatedCost: result.estimatedCost,
    chunkingStrategy: result.chunkingStrategy,
    breakTypeDistribution,
    tokenDistribution: {
      median: getMedian(tokenCounts),
      standardDeviation: getStandardDeviation(tokenCounts, result.averageTokensPerChunk)
    }
  };
}

/**
 * Calculate median of an array of numbers
 */
function getMedian(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

/**
 * Calculate standard deviation
 */
function getStandardDeviation(numbers: number[], mean: number): number {
  const squaredDifferences = numbers.map(num => Math.pow(num - mean, 2));
  const avgSquaredDiff = squaredDifferences.reduce((sum, val) => sum + val, 0) / numbers.length;
  return Math.sqrt(avgSquaredDiff);
}