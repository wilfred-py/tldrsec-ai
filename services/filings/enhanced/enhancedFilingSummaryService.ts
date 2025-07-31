import { FilingType } from '../../../types/sec/filing';
import { FilingSummaryResult } from '../../filing/types';
import { parseFormContentEnhanced } from '../../../lib/parsers/enhanced-form-parser';
import { estimateTokenCount } from '../../../lib/ai/token-counter';
import { logger } from '../../../lib/logging';
import * as secService from '../../secService';
import { 
  processFilingDocument, 
  DocumentProcessingResult,
  DocumentProcessingOptions 
} from './documentProcessor';
import { 
  chunkContent, 
  ChunkingOptions, 
  ChunkingResult,
  estimateProcessingCost 
} from './contentChunker';
import { 
  summarizeWithChunking, 
  summarizeSingle, 
  SummarizationOptions,
  SummarizationResult 
} from './aiSummarizer';
import { 
  checkEnhancedCache, 
  saveToEnhancedCache,
  CacheEntry 
} from './enhancedCache';

// Create a module-specific logger
const enhancedLogger = logger.child('enhanced-filing-summary-service');

/**
 * Enhanced filing summary options
 */
export interface EnhancedFilingSummaryOptions {
  useEnhancedFetch?: boolean;
  enableFallbacks?: boolean;
  saveToDatabase?: boolean;
  maxRetries?: number;
  chunkingOptions?: ChunkingOptions;
  summarizationOptions?: SummarizationOptions;
  documentProcessingOptions?: DocumentProcessingOptions;
}

/**
 * Enhanced filing summary result
 */
export interface EnhancedFilingSummaryResult {
  data: FilingSummaryResult | null;
  error?: string;
  metadata?: {
    processingStrategy: 'single' | 'chunked';
    cacheHit: boolean;
    documentProcessing: DocumentProcessingResult;
    chunkingResult?: ChunkingResult;
    summarizationResult: SummarizationResult;
    totalProcessingTimeMs: number;
  };
}

/**
 * Convert enhanced summary to legacy format
 */
function convertToLegacyFormat(
  ticker: string,
  companyName: string,
  filingType: FilingType,
  filingDate: string,
  filingUrl: string,
  summarizationResult: SummarizationResult,
  accessionNumber?: string
): FilingSummaryResult {
  const { summary, metadata } = summarizationResult;

  return {
    ticker,
    companyName,
    filingType,
    filingDate,
    accessionNumber: accessionNumber || '',
    summaryText: summary.summary,
    keyPoints: [
      ...summary.financialPerformance.map(fp => `${fp.metric}: ${fp.value} - ${fp.insight}`),
      ...summary.businessHighlights.map(bh => `${bh.topic}: ${bh.detail} (Impact: ${bh.impact})`),
      ...summary.riskFactors.map(rf => `Risk - ${rf.category}: ${rf.description}`),
      summary.keyTakeaway
    ].filter(Boolean),
    url: filingUrl,
    filingUrl,
    tokensUsed: metadata.totalTokens,
    inputTokens: metadata.inputTokens,
    outputTokens: metadata.outputTokens,
    model: metadata.model,
    cost: metadata.cost,
    processingStatus: 'COMPLETED' as const,
    processingTimeMs: metadata.processingTimeMs,
    // Enhanced fields
    parsedContent: undefined,
    rawData: summary, // Store structured summary in rawData
  };
}

/**
 * Enhanced filing summary service - main entry point
 */
export async function getEnhancedFilingSummary(
  ticker: string,
  formType: FilingType,
  options: EnhancedFilingSummaryOptions = {}
): Promise<EnhancedFilingSummaryResult> {
  const startTime = Date.now();
  const {
    enableFallbacks = true,
    saveToDatabase = true,
    maxRetries = 2,
    chunkingOptions = {},
    summarizationOptions = {},
    documentProcessingOptions = {}
  } = options;

  enhancedLogger.info(`Starting enhanced filing summary`, {
    ticker,
    formType,
    enableFallbacks,
    saveToDatabase
  });

  try {
    // Step 1: Get company info
    enhancedLogger.debug(`Getting company info for ${ticker}`);
    const companyInfo = await secService.getCompanyInfo(ticker);
    if (!companyInfo) {
      return {
        data: null,
        error: `Could not find company info for ${ticker}`
      };
    }

    // Step 2: Get latest filing
    enhancedLogger.debug(`Getting latest filing of type ${formType} for ${ticker}`);
    const filing = await secService.getLatestFilingByFormType(ticker, formType);
    if (!filing) {
      return {
        data: null,
        error: `No ${formType} filing found for ${ticker}`
      };
    }

    // Step 3: Construct filing URL
    const filingUrl = filing.filingUrl || 
      `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}/` + 
      `${filing.accessionNumber}-index.html`;

    enhancedLogger.debug(`Processing filing URL: ${filingUrl}`);

    // Step 4: Check cache first
    let cacheEntry: CacheEntry | null = null;
    try {
      cacheEntry = await checkEnhancedCache(filingUrl);
      if (cacheEntry) {
        enhancedLogger.info(`Cache hit for ${ticker} - ${formType}`);
        
        const legacyResult = convertToLegacyFormat(
          ticker,
          companyInfo.name || ticker,
          formType,
          filing.filingDate || new Date().toISOString(),
          filingUrl,
          {
            summary: cacheEntry.summary,
            metadata: cacheEntry.metadata,
            success: true
          },
          filing.accessionNumber
        );

        return {
          data: legacyResult,
          metadata: {
            processingStrategy: cacheEntry.metadata.chunksProcessed ? 'chunked' : 'single',
            cacheHit: true,
            documentProcessing: {
              content: '', // Not stored for cached results
              actualUrl: filingUrl,
              isDirectoryListing: false,
              processingTimeMs: 0
            },
            summarizationResult: {
              summary: cacheEntry.summary,
              metadata: cacheEntry.metadata,
              success: true
            },
            totalProcessingTimeMs: Date.now() - startTime
          }
        };
      }
    } catch (cacheError) {
      enhancedLogger.warn(`Cache check failed, continuing with processing: ${cacheError}`);
    }

    // Step 5: Process filing document
    enhancedLogger.debug(`Processing filing document`);
    const documentResult = await processFilingDocument(filingUrl, documentProcessingOptions);
    
    if (!documentResult.content || documentResult.content.length < 100) {
      return {
        data: null,
        error: 'Could not retrieve meaningful content from filing document',
        metadata: {
          processingStrategy: 'single',
          cacheHit: false,
          documentProcessing: documentResult,
          summarizationResult: {
            summary: {
              summary: 'No content available',
              financialPerformance: [],
              businessHighlights: [],
              riskFactors: [],
              keyTakeaway: 'Document content unavailable'
            },
            metadata: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              cost: 0,
              processingTimeMs: 0,
              model: 'none'
            },
            success: false,
            error: 'No content available'
          },
          totalProcessingTimeMs: Date.now() - startTime
        }
      };
    }

    // Step 6: Parse content for metadata (optional)
    let parsedMetadata: any = {};
    try {
      const parsedContent = await parseFormContentEnhanced(documentResult.content);
      parsedMetadata = parsedContent.metadata || {};
    } catch (parseError) {
      enhancedLogger.warn(`Content parsing failed, continuing without metadata: ${parseError}`);
    }

    // Step 7: Determine processing strategy based on content size
    const tokenCount = estimateTokenCount(documentResult.content);
    const maxTokensForSingle = 100000; // Conservative limit
    const processingStrategy: 'single' | 'chunked' = tokenCount > maxTokensForSingle ? 'chunked' : 'single';

    enhancedLogger.info(`Using ${processingStrategy} processing strategy`, {
      tokenCount,
      threshold: maxTokensForSingle
    });

    let summarizationResult: SummarizationResult;
    let chunkingResult: ChunkingResult | undefined;

    // Step 8: Process content based on strategy
    if (processingStrategy === 'chunked') {
      // Chunk the content
      chunkingResult = chunkContent(documentResult.content, chunkingOptions);
      enhancedLogger.info(`Content chunked into ${chunkingResult.totalChunks} chunks`);

      // Summarize with chunking
      summarizationResult = await summarizeWithChunking(
        chunkingResult,
        formType,
        companyInfo.name,
        ticker,
        summarizationOptions
      );
    } else {
      // Single summarization
      summarizationResult = await summarizeSingle(
        documentResult.content,
        formType,
        companyInfo.name,
        ticker,
        summarizationOptions
      );
    }

    // Step 9: Handle summarization failure
    if (!summarizationResult.success) {
      if (enableFallbacks) {
        enhancedLogger.warn(`Summarization failed, using fallback approach`);
        // Could implement fallback logic here
      }
      return {
        data: null,
        error: summarizationResult.error || 'Summarization failed',
        metadata: {
          processingStrategy,
          cacheHit: false,
          documentProcessing: documentResult,
          chunkingResult,
          summarizationResult,
          totalProcessingTimeMs: Date.now() - startTime
        }
      };
    }

    // Step 10: Convert to legacy format
    const legacyResult = convertToLegacyFormat(
      ticker,
      companyInfo.name || ticker,
      formType,
      filing.filingDate || new Date().toISOString(),
      filingUrl,
      summarizationResult,
      filing.accessionNumber
    );

    // Step 11: Save to cache
    if (saveToDatabase) {
      try {
        await saveToEnhancedCache(
          filingUrl,
          summarizationResult,
          ticker,
          companyInfo.name
        );
      } catch (cacheError) {
        enhancedLogger.warn(`Failed to save to cache: ${cacheError}`);
      }
    }

    const totalProcessingTimeMs = Date.now() - startTime;
    
    enhancedLogger.info(`Enhanced filing summary completed`, {
      ticker,
      formType,
      processingStrategy,
      totalTokens: summarizationResult.metadata.totalTokens,
      cost: summarizationResult.metadata.cost,
      totalProcessingTimeMs
    });

    return {
      data: legacyResult,
      metadata: {
        processingStrategy,
        cacheHit: false,
        documentProcessing: documentResult,
        chunkingResult,
        summarizationResult,
        totalProcessingTimeMs
      }
    };

  } catch (error) {
    enhancedLogger.error(`Error in enhanced filing summary: ${error}`, {
      ticker,
      formType
    });

    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        processingStrategy: 'single',
        cacheHit: false,
        documentProcessing: {
          content: '',
          actualUrl: '',
          isDirectoryListing: false,
          processingTimeMs: 0
        },
        summarizationResult: {
          summary: {
            summary: 'Error occurred during processing',
            financialPerformance: [],
            businessHighlights: [],
            riskFactors: [],
            keyTakeaway: 'Processing failed due to technical error'
          },
          metadata: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0,
            processingTimeMs: 0,
            model: 'none'
          },
          success: false,
          error: error instanceof Error ? error.message : String(error)
        },
        totalProcessingTimeMs: Date.now() - startTime
      }
    };
  }
}