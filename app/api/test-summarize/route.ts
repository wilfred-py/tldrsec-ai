import { FilingType } from '../../../lib/sec-edgar/types';
import { enhancedFetch } from '../../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../../lib/parsers/enhanced-form-parser';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { estimateTokenCount } from '../../../lib/ai/token-counter';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { logger } from '../../../lib/logging';
import { getPrismaClient } from '../../../lib/db/prisma';
import { enhancedClaudeClient } from '../../../lib/ai/enhanced-claude-client';
import { ClaudeMessage } from '../../../lib/ai/claude-client';
import { monitoring } from '../../../lib/monitoring';
import { NextRequest, NextResponse } from 'next/server';

// Create a safe wrapper for monitoring functions
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

// Create a module-specific logger
const apiLogger = logger.child('api-test-summarize');

// Interface for the request body
interface TestSummarizeRequest {
  filingUrl: string;
  filingType?: FilingType;
  companyName?: string;
  ticker?: string;
  dryRun?: boolean;
}

// Interface for the response data
interface TestSummarizeResponse {
  success: boolean;
  error?: string;
  parsedContent?: {
    sections: Record<string, string>;
    metadata: Record<string, any>;
  };
  prompt?: string;
  tokenEstimates?: {
    inputTokens: number;
    estimatedOutputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  summary?: {
    text: string | Record<string, any>;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    duration: number;
  };
  cacheHit?: boolean;
  processingTimeMs: number;
}

/**
 * Check if content is a directory listing
 * @param content HTML content to check
 * @returns True if content appears to be a directory listing
 */
function isDirectoryListing(content: string): boolean {
  try {
    const $ = cheerio.load(content);
    
    // Check for table with "Name", "Last modified", "Size" headers
    const hasDirectoryTable = $('table').find('th, td').text().match(/Name.*Last modified.*Size/i) !== null;
    
    // Check for links that look like directory entries
    const links = $('a');
    let directoryLinkCount = 0;
    
    links.each((_, link) => {
      const href = $(link).attr('href');
      if (href && (href.endsWith('/') || href.match(/\.(html?|xml|txt|pdf)$/i))) {
        directoryLinkCount++;
      }
    });
    
    return hasDirectoryTable || (links.length > 5 && directoryLinkCount > links.length * 0.7);
  } catch (error) {
    return false; // If we can't parse the HTML, assume it's not a directory listing
  }
}

/**
 * Extract document links from a directory listing HTML
 * @param html HTML content of the directory listing
 * @param baseUrl Base URL for resolving relative links
 * @returns Array of document links
 */
function extractDocumentLinksFromDirectoryListing(html: string, baseUrl: string): string[] {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const links: string[] = [];
    
    // Get all links in the document
    const anchors = document.querySelectorAll('a');
    
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const href = anchor.getAttribute('href');
      
      if (href && !href.includes('?') && !href.includes('..')) {
        // Filter for common filing document extensions
        if (href.endsWith('.txt') || 
            href.endsWith('.xml') || 
            href.endsWith('.html') || 
            href.endsWith('.htm')) {
          // Resolve relative URLs to absolute URLs
          const absoluteUrl = new URL(href, baseUrl).href;
          links.push(absoluteUrl);
        }
      }
    }
    
    return links;
  } catch (error) {
    apiLogger.error('Error extracting links from directory listing', { error });
    return [];
  }
}

/**
 * Calculate estimated cost based on token counts
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens (estimated or actual)
 * @returns Estimated cost in USD
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  // Claude Sonnet 4 pricing: $3 per 1M input tokens, $15 per 1M output tokens
  const inputCost = (inputTokens / 1000000) * 3;
  const outputCost = (outputTokens / 1000000) * 15;
  return inputCost + outputCost;
}

// In-memory cache for testing purposes
const inMemoryCache: Record<string, { data: any, expiresAt: Date }> = {};

/**
 * Generate a simplified prompt for SEC filing summarization
 * @param filingType The type of filing
 * @param content The content to summarize
 * @param companyName Company name for context
 * @param ticker Ticker symbol for context
 * @returns A customized prompt with content
 */
function generateSimplifiedPrompt(filingType: FilingType, content: string, companyName?: string, ticker?: string): string {
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
  
  // Base prompt with context
  let prompt = `You are an expert financial analyst tasked with summarizing a ${filingTypeDisplay} SEC filing.
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
    }
  `;
  
  return prompt;
}

/**
 * Check if a summary exists in the cache
 * @param filingUrl URL of the filing
 * @returns Cached summary or null if not found
 */
async function checkCache(filingUrl: string): Promise<any | null> {
  try {
    // Check in-memory cache first
    const cacheKey = filingUrl;
    const cachedItem = inMemoryCache[cacheKey];
    
    if (cachedItem && cachedItem.expiresAt > new Date()) {
      return cachedItem.data;
    }
    
    // If not in memory, remove expired items
    if (cachedItem && cachedItem.expiresAt <= new Date()) {
      delete inMemoryCache[cacheKey];
    }
    
    return null;
  } catch (error) {
    apiLogger.error('Error checking cache', { error });
    return null;
  }
}

/**
 * Save a summary to the cache
 * @param filingUrl URL of the filing
 * @param data Summary data to cache
 * @param ttlMinutes Time to live in minutes
 */
async function saveToCache(filingUrl: string, data: any, ttlMinutes: number = 60): Promise<void> {
  try {
    // Save to in-memory cache
    const cacheKey = filingUrl;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
    
    inMemoryCache[cacheKey] = {
      data,
      expiresAt
    };
    
    apiLogger.debug(`Saved to in-memory cache: ${cacheKey}, expires: ${expiresAt.toISOString()}`);
  } catch (error) {
    apiLogger.error('Error saving to cache', { error });
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse request body
    const requestData: TestSummarizeRequest = await request.json();
    const { filingUrl, filingType, companyName, ticker, dryRun = false } = requestData;
    
    if (!filingUrl) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameter: filingUrl',
          processingTimeMs: Date.now() - startTime 
        },
        { status: 400 }
      );
    }
    
    // Step 1: Check cache
    const cachedResult = await checkCache(filingUrl);
    if (cachedResult) {
      apiLogger.info(`Cache hit for ${filingUrl}`);
      return NextResponse.json({
        ...cachedResult,
        cacheHit: true,
        processingTimeMs: Date.now() - startTime
      });
    }
    
    // Step 2: Fetch filing content
    apiLogger.debug(`Fetching filing from ${filingUrl}`);
    let content: string;
    let actualUrl = filingUrl;
    
    try {
      const fetchStart = Date.now();
      const response = await enhancedFetch(filingUrl);
      content = await response.text();
      safeMonitoring.recordDuration('sec_filing_fetch_ms', Date.now() - fetchStart, { source: 'test-summarize' });
      
      // Check if this is a directory listing and handle accordingly
      if (isDirectoryListing(content)) {
        apiLogger.info(`URL ${filingUrl} is a directory listing, looking for document links`);
        const documentLinks = extractDocumentLinksFromDirectoryListing(content, filingUrl);
        
        if (documentLinks.length > 0) {
          // Use the first document link
          actualUrl = documentLinks[0];
          apiLogger.info(`Using first document from listing: ${actualUrl}`);
          
          // Fetch the actual document
          const docFetchStart = Date.now();
          const docResponse = await enhancedFetch(actualUrl);
          content = await docResponse.text();
          safeMonitoring.recordDuration('sec_filing_fetch_ms', Date.now() - docFetchStart, { source: 'test-summarize', is_directory: 'true' });
        }
      }
    } catch (fetchError) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch filing: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
          processingTimeMs: Date.now() - startTime
        },
        { status: 500 }
      );
    }
    
    // Step 3: Parse filing content
    apiLogger.debug(`Parsing filing content from ${actualUrl}`);
    let parsedContent: { sections: Record<string, string>; metadata: Record<string, any> };
    
    try {
      const parseStart = Date.now();
      parsedContent = parseFormContentEnhanced(content);
      safeMonitoring.recordDuration('sec_filing_parse_ms', Date.now() - parseStart, { source: 'test-summarize' });
      
      // Add ticker to metadata if provided
      if (ticker && parsedContent.metadata) {
        parsedContent.metadata = {
          ...parsedContent.metadata,
          ticker
        };
      }
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to parse filing content: ${error instanceof Error ? error.message : String(error)}`,
          processingTimeMs: Date.now() - startTime
        },
        { status: 500 }
      );
    }
    
    // Step 4: Generate prompt
    apiLogger.debug(`Generating prompt for ${actualUrl}`);
    // Use the actual filing type from parsed content or fall back to the provided filingType
    const actualFilingType = (parsedContent.metadata?.filingType || filingType || 'GENERIC') as FilingType;
    const actualCompanyName = parsedContent.metadata?.companyName || companyName;
    const actualTicker = parsedContent.metadata?.ticker || ticker;
    
    // Generate prompt directly instead of using the imported function
    const prompt = generateSimplifiedPrompt(actualFilingType, content, actualCompanyName, actualTicker);
    
    // Step 5: Estimate tokens and cost
    const inputTokens = estimateTokenCount(prompt);
    const estimatedOutputTokens = Math.ceil(inputTokens * 0.3); // Estimate output as 30% of input
    const totalTokens = inputTokens + estimatedOutputTokens;
    const estimatedCost = calculateCost(inputTokens, estimatedOutputTokens);
    
    const tokenEstimates = {
      inputTokens,
      estimatedOutputTokens,
      totalTokens,
      estimatedCost
    };
    
    // Prepare response without summary if dry run
    const response: TestSummarizeResponse = {
      success: true,
      parsedContent: {
        sections: parsedContent.sections,
        metadata: parsedContent.metadata
      },
      prompt,
      tokenEstimates,
      processingTimeMs: Date.now() - startTime
    };
    
    // Step 6: Call Claude API if not dry run
    if (!dryRun) {
      apiLogger.debug(`Calling Claude API for ${actualUrl}`);
      try {
        const messages: ClaudeMessage[] = [
          {
            role: 'user',
            content: prompt
          }
        ];
        
        const claudeResponse = await enhancedClaudeClient.sendMessage(messages, {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 4000,
          temperature: 0.3
        });
        
        // Try to parse the response as JSON
        let summaryText: string | Record<string, any> = claudeResponse.content;
        try {
          // Check if the response is valid JSON
          if (claudeResponse.content.trim().startsWith('{') && claudeResponse.content.trim().endsWith('}')) {
            summaryText = JSON.parse(claudeResponse.content);
          }
        } catch (jsonError) {
          // If parsing fails, use the raw text
          apiLogger.warn(`Failed to parse Claude response as JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
        }
        
        response.summary = {
          text: summaryText,
          inputTokens: claudeResponse.inputTokens,
          outputTokens: claudeResponse.outputTokens,
          cost: claudeResponse.totalCost,
          duration: claudeResponse.executionTimeMs
        };
        
        // Save to cache with 1-hour TTL
        await saveToCache(filingUrl, response, 60);
      } catch (claudeError) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to generate summary: ${claudeError instanceof Error ? claudeError.message : String(claudeError)}`,
            parsedContent: response.parsedContent,
            prompt: response.prompt,
            tokenEstimates: response.tokenEstimates,
            processingTimeMs: Date.now() - startTime
          },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(response);
  } catch (error) {
    apiLogger.error(`Unhandled error in test-summarize API: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { 
        success: false,
        error: `An error occurred during test summarization: ${error instanceof Error ? error.message : String(error)}`,
        processingTimeMs: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}
