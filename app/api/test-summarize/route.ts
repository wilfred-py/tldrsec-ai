import { FilingType } from '../../../lib/sec-edgar/types';
import { enhancedFetch } from '../../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../../lib/parsers/enhanced-form-parser';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { estimateTokenCount } from '../../../lib/ai/token-counter';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { logger } from '../../../lib/logging';
import { getPrismaClient } from '../../../lib/db/prisma';
const prisma = getPrismaClient();
import Anthropic from '@anthropic-ai/sdk';
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
  saveToDatabase?: boolean;
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
  savedSummaryId?: string;
}

/**
 * Check if content is a directory listing
 * @param content HTML content to check
 * @returns True if content appears to be a directory listing
 */
function isDirectoryListing(content: string): boolean {
  try {
    // Check for directory listing indicators in the content
    const hasDirectoryTitle = content.includes('Directory Listing') || content.includes('Directory List');
    const hasParentDirectory = content.includes('Parent Directory');
    const hasFileTable = content.includes('<table') && content.includes('Last Modified');
    
    // If it has clear directory listing indicators, return true
    if (hasDirectoryTitle || (hasParentDirectory && hasFileTable)) {
      return true;
    }
    
    // Fallback to cheerio parsing for more complex detection
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
 * Intelligent document prioritization based on SEC filing patterns
 * Prioritizes XML files for cost efficiency and uses generic SEC patterns
 * @param links Array of document links to prioritize
 * @param accessionNumber Accession number for pattern matching
 * @param baseUrl Base URL for context
 * @returns Prioritized array of document links
 */
function prioritizeDocuments(links: string[], accessionNumber: string | null, baseUrl: string): string[] {
  const priorityLevels = {
    critical: [] as string[],    // Primary XML documents (most cost-effective)
    high: [] as string[],        // Main filing documents (HTML/TXT)
    medium: [] as string[],      // Other filing documents
    low: [] as string[],         // Exhibits and supplementary
    exhibits: [] as string[]     // Clearly exhibit files (lowest priority)
  };
  
  const accessionClean = accessionNumber ? accessionNumber.replace(/-/g, '') : '';
  
  // Track categorization for debugging
  const categorization: { [key: string]: string } = {};
  
  links.forEach(link => {
    const filename = link.split('/').pop()?.toLowerCase() || '';
    const href = filename;
    
    // CRITICAL: Primary XML documents (most cost-effective)
    if (
      // Common SEC XML documents
      href === 'primary_doc.xml' ||
      href === 'filing.xml' ||
      href === 'document.xml' ||
      href === 'form.xml' ||
      // XML files with accession numbers
      (accessionClean && href.includes(accessionClean) && href.endsWith('.xml'))
    ) {
      priorityLevels.critical.push(link);
      categorization[filename] = 'critical-xml';
    }
    // HIGH: Main filing documents with accession numbers or standard patterns
    else if (
      // Contains clean accession number (HTML/TXT)
      (accessionClean && href.includes(accessionClean) && href.match(/\.(html?|txt)$/i)) ||
      // Generic SEC patterns: d123456d[formtype].htm
      href.match(/^d\d+d(8k|10k|10q|144|3|4|5)\.html?$/i) ||
      // Date-based patterns: YYYYMMDD.htm or similar
      href.match(/^\d{8}\.html?$/i) ||
      // Filing with company ticker: [ticker]-[date].htm (generic pattern)
      href.match(/^[a-z]{2,6}-\d{6,8}\.html?$/i)
    ) {
      priorityLevels.high.push(link);
      categorization[filename] = 'high-main';
    }
    // MEDIUM: XML files (cost-effective but not primary documents)
    else if (
      href.endsWith('.xml') &&
      !href.includes('exhibit') && 
      !href.includes('ex-') &&
      !href.includes('ex_')
    ) {
      priorityLevels.medium.push(link);
      categorization[filename] = 'medium-xml';
    }
    // MEDIUM: Other HTML/TXT documents (not exhibits)
    else if (
      href.match(/\.(html?|txt)$/i) && 
      !href.includes('exhibit') && 
      !href.includes('ex-') &&
      !href.includes('ex_') &&
      !href.includes('index') &&
      href.includes('-') // Has meaningful structure
    ) {
      priorityLevels.medium.push(link);
      categorization[filename] = 'medium-structured';
    }
    // LOW: Basic documents without clear structure
    else if (
      href.match(/\.(html?|txt|xml)$/i) && 
      !href.includes('exhibit') && 
      !href.includes('ex-') &&
      !href.includes('ex_') &&
      !href.includes('index')
    ) {
      priorityLevels.low.push(link);
      categorization[filename] = 'low-basic';
    }
    // EXHIBITS: Clearly exhibit files (lowest priority)
    else {
      priorityLevels.exhibits.push(link);
      categorization[filename] = 'exhibits';
    }
  });
  
  const result = [
    ...priorityLevels.critical,
    ...priorityLevels.high,
    ...priorityLevels.medium,
    ...priorityLevels.low,
    ...priorityLevels.exhibits
  ];
  
  apiLogger.info(`Document prioritization results`, {
    baseUrl,
    accessionNumber,
    totals: {
      critical: priorityLevels.critical.length,
      high: priorityLevels.high.length,
      medium: priorityLevels.medium.length,
      low: priorityLevels.low.length,
      exhibits: priorityLevels.exhibits.length
    },
    topResults: {
      critical: priorityLevels.critical.slice(0, 3).map(url => url.split('/').pop()),
      high: priorityLevels.high.slice(0, 3).map(url => url.split('/').pop()),
      medium: priorityLevels.medium.slice(0, 3).map(url => url.split('/').pop())
    },
    categorization: Object.fromEntries(
      Object.entries(categorization).slice(0, 10) // Limit for readability
    )
  });
  
  return result;
}

/**
 * Extract document links from a directory listing HTML with intelligent prioritization
 * Enhanced version based on SEC filing pattern analysis
 * @param html HTML content of the directory listing
 * @param baseUrl Base URL for resolving relative links
 * @returns Array of document links, sorted by priority (main filing first)
 */
function extractDocumentLinksFromDirectoryListing(html: string, baseUrl: string): string[] {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const allLinks: string[] = [];
    
    // Extract accession number from base URL for filtering
    const accessionMatch = baseUrl.match(/(\d{10}-\d{2}-\d{6})/);
    const accessionNumber = accessionMatch ? accessionMatch[1] : null;
    
    const anchors = document.querySelectorAll('a');
    
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const href = anchor.getAttribute('href');
      
      if (!href || href.includes('?') || href.includes('..')) {
        continue;
      }
      
      // Skip absolute URLs that go outside SEC or the current accession directory
      if (href.startsWith('http')) {
        // Allow SEC URLs but only within the same accession directory or known filing patterns
        if (href.includes('sec.gov')) {
          // Skip general SEC navigation pages
          if (href.includes('sec.gov/index') || 
              href.includes('sec.gov/search') || 
              href.includes('sec.gov/news') ||
              href.includes('sec.gov/about') ||
              href.includes('sec.gov/newsroom')) {
            continue;
          }
          // Only allow if it's in the same data directory or a direct filing URL
          const currentDataPath = baseUrl.match(/\/data\/\d+\/\d+/)?.[0];
          if (currentDataPath && !href.includes(currentDataPath)) {
            continue;
          }
        } else {
          // Skip all non-SEC external links
          continue;
        }
      }
      
      // Skip directory navigation
      if (href === '/' || href === '../' || href.startsWith('/index') || href.startsWith('/search')) {
        continue;
      }
      
      // Only include filing-related document types (prioritize XML for cost efficiency)
      if (href.endsWith('.xml') || href.endsWith('.txt') || 
          href.endsWith('.html') || href.endsWith('.htm') ||
          href.endsWith('.xsd') || href.endsWith('.xbrl')) {
        
        const absoluteUrl = new URL(href, baseUrl).href;
        allLinks.push(absoluteUrl);
      }
    }
    
    // Use intelligent prioritization
    const prioritizedLinks = prioritizeDocuments(allLinks, accessionNumber, baseUrl);
    
    // Additional smart URL transformation for missing patterns
    const transformedUrls: string[] = [...prioritizedLinks];
    
    // If we don't have any critical documents, try to construct them
    if (prioritizedLinks.length === 0 || 
        (prioritizedLinks[0] && !prioritizedLinks.some(url => url.includes(accessionNumber?.replace(/-/g, '') || '')))) {
      if (accessionNumber) {
        const basePath = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        const accessionClean = accessionNumber.replace(/-/g, '');
        
        // Try common SEC filing patterns (prioritize XML for cost efficiency)
        const possibleUrls = [
          `${basePath}primary_doc.xml`, // Most common XML pattern
          `${basePath}filing.xml`, // Alternative XML pattern
          `${basePath}${accessionClean}.xml`, // Accession-based XML
          `${basePath}${accessionClean}.htm`, // Generic HTML pattern
          `${basePath}d${accessionClean}.htm`, // Alternative HTML pattern
        ];
        
        transformedUrls.unshift(...possibleUrls);
      }
    }
    
    apiLogger.debug(`Extracted ${transformedUrls.length} document links from directory listing`, {
      baseUrl,
      accessionNumber,
      totalExtracted: allLinks.length,
      afterPrioritization: prioritizedLinks.length,
      withTransformations: transformedUrls.length,
      firstFew: transformedUrls.slice(0, 3)
    });
    
    return transformedUrls;
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
  // Claude Sonnet 3.5 pricing: $3 per 1M input tokens, $15 per 1M output tokens
  const inputCost = (inputTokens / 1000000) * 3;
  const outputCost = (outputTokens / 1000000) * 15;
  return inputCost + outputCost;
}

/**
 * Split content into chunks that fit within token limits
 * @param content The content to chunk
 * @param maxTokensPerChunk Maximum tokens per chunk (default: 150,000 to leave room for prompt)
 * @returns Array of content chunks
 */
function chunkContent(content: string, maxTokensPerChunk: number = 50000): string[] {
  // Rough estimation: 1 token ≈ 4 characters for English text
  // Using conservative estimate since SEC filings have dense content
  const maxCharsPerChunk = maxTokensPerChunk * 3;
  
  if (content.length <= maxCharsPerChunk) {
    return [content];
  }
  
  const chunks: string[] = [];
  let currentPos = 0;
  
  while (currentPos < content.length) {
    let chunkEnd = currentPos + maxCharsPerChunk;
    
    // If we're not at the end, try to break at a sensible point
    if (chunkEnd < content.length) {
      // Look for paragraph breaks, section breaks, or sentence ends
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
 * Generate a simplified prompt for SEC filing chunk summarization
 * @param filingType The type of filing
 * @param content The content chunk to summarize
 * @param chunkIndex The index of this chunk
 * @param totalChunks Total number of chunks
 * @param companyName Company name for context
 * @param ticker Ticker symbol for context
 * @returns A customized prompt for the chunk
 */
function generateChunkPrompt(filingType: string, content: string, chunkIndex: number, totalChunks: number, companyName?: string, ticker?: string): string {
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
 * Find or create a ticker for testing purposes
 * For test summaries, we'll create a temporary ticker if it doesn't exist
 * @param symbol Ticker symbol
 * @param companyName Company name
 * @returns Ticker ID
 */
async function findOrCreateTestTicker(symbol: string, companyName?: string): Promise<string> {
  try {
    // Try to find existing ticker for a test user or create a test user
    let testUser;
    try {
      testUser = await prisma.user.findFirst({
        where: {
          email: 'test@tldrsec.com'
        }
      });
    } catch (error) {
      apiLogger.debug('Test user not found, creating one');
    }

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'test@tldrsec.com',
          name: 'Test User',
          authProvider: 'test',
          authProviderId: 'test-user-id',
          onboardingCompleted: true
        }
      });
      apiLogger.info('Created test user for test summaries');
    }

    // Try to find existing ticker
    let ticker = await prisma.ticker.findFirst({
      where: {
        symbol: symbol.toUpperCase(),
        userId: testUser.id
      }
    });

    if (!ticker) {
      // Create new ticker
      ticker = await prisma.ticker.create({
        data: {
          symbol: symbol.toUpperCase(),
          companyName: companyName || `${symbol.toUpperCase()} Company`,
          userId: testUser.id
        }
      });
      apiLogger.info(`Created test ticker: ${symbol.toUpperCase()}`);
    }

    return ticker.id;
  } catch (error) {
    apiLogger.error(`Error finding/creating test ticker: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}


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
 * Check if a summary exists in the database cache
 * @param filingUrl URL of the filing
 * @returns Cached summary data or null if not found
 */
async function checkCache(filingUrl: string): Promise<any | null> {
  try {
    // Look for existing summary by filing URL, include ticker relation
    const existingSummary = await prisma.summary.findFirst({
      where: {
        filingUrl: filingUrl
      },
      include: {
        ticker: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (existingSummary) {
      apiLogger.debug(`Database cache hit for ${filingUrl}`, { 
        summaryId: existingSummary.id,
        createdAt: existingSummary.createdAt 
      });

      // Reconstruct the cached response format
      const cachedData = {
        success: true,
        parsedContent: {
          sections: {},
          metadata: {
            filingType: existingSummary.filingType,
            companyName: existingSummary.ticker?.companyName || 'Unknown Company',
            ticker: existingSummary.ticker?.symbol || 'UNKNOWN'
          }
        },
        summary: {
          text: existingSummary.summaryJSON || existingSummary.summaryText,
          inputTokens: Math.floor((existingSummary.tokensUsed || 0) * 0.7), // Estimate split
          outputTokens: Math.floor((existingSummary.tokensUsed || 0) * 0.3), // Estimate split
          cost: existingSummary.cost || 0,
          duration: existingSummary.processingTimeMs || 0
        },
        tokenEstimates: {
          inputTokens: Math.floor((existingSummary.tokensUsed || 0) * 0.7),
          estimatedOutputTokens: Math.floor((existingSummary.tokensUsed || 0) * 0.3),
          totalTokens: existingSummary.tokensUsed || 0,
          estimatedCost: existingSummary.cost || 0
        },
        savedSummaryId: existingSummary.id
      };

      return cachedData;
    }
    
    return null;
  } catch (error) {
    apiLogger.error('Error checking database cache', { error, filingUrl });
    return null;
  }
}

/**
 * Save a summary response to the database cache (with idempotency)
 * @param filingUrl URL of the filing
 * @param data Complete response data to cache
 * @returns The saved summary ID or existing ID if already cached
 */
async function saveToCache(filingUrl: string, data: any): Promise<string | null> {
  try {
    // Check if summary already exists (idempotency check)
    const existingSummary = await prisma.summary.findFirst({
      where: {
        filingUrl: filingUrl
      }
    });

    if (existingSummary) {
      apiLogger.debug(`Summary already exists in database cache: ${existingSummary.id}`);
      return existingSummary.id;
    }

    // Only save if we have summary data
    if (!data.summary) {
      apiLogger.debug('No summary data to cache, skipping database save');
      return null;
    }

    // Extract metadata for database fields
    const filingType = data.parsedContent?.metadata?.filingType || 'UNKNOWN';
    const companyName = data.parsedContent?.metadata?.companyName;
    const ticker = data.parsedContent?.metadata?.ticker;

    // Get or create ticker if available
    let tickerId: string;
    if (ticker) {
      tickerId = await findOrCreateTestTicker(ticker, companyName);
    } else {
      // Create a generic test ticker for unknown filings
      tickerId = await findOrCreateTestTicker('TEST', companyName || 'Test Company');
    }

    // Extract filing date from URL or use current date
    let filingDate = new Date();
    const dateMatch = filingUrl.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      filingDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
    }

    // Prepare summary text and JSON
    const summaryText = typeof data.summary.text === 'string' 
      ? data.summary.text 
      : JSON.stringify(data.summary.text, null, 2);
    const summaryJSON = typeof data.summary.text === 'object' ? data.summary.text : null;

    // Save to database
    const savedSummary = await prisma.summary.create({
      data: {
        tickerId,
        filingType: filingType.toUpperCase(),
        filingDate,
        filingUrl,
        summaryText,
        summaryJSON,
        cost: data.summary.cost || 0,
        tokensUsed: (data.summary.inputTokens || 0) + (data.summary.outputTokens || 0),
        attempts: 1,
        processingTimeMs: data.summary.duration || 0,
        processingStatus: 'COMPLETED',
        processingCompletedAt: new Date(),
        model: 'claude-3-5-sonnet-20241022',
        isPartialResult: false,
        sentToUser: false
      }
    });

    apiLogger.info(`Saved summary to database cache: ${savedSummary.id}`, {
      filingUrl,
      filingType,
      cost: data.summary.cost,
      tokensUsed: savedSummary.tokensUsed,
      chunksProcessed: data.summary.chunksProcessed
    });

    return savedSummary.id;
  } catch (error) {
    apiLogger.error('Error saving to database cache', { error, filingUrl });
    // Don't throw error - caching is not critical for functionality
    return null;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse request body
    const requestData: TestSummarizeRequest = await request.json();
    const { filingUrl, filingType, companyName, ticker, dryRun = false, saveToDatabase = false } = requestData;
    
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
    
    // Note: saveToDatabase is now handled automatically by the cache layer
    // The parameter is kept for backward compatibility but not strictly required
    
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
      content = await enhancedFetch(filingUrl, {
        responseType: 'text',
        headers: {
          'User-Agent': 'tldrSEC-AI Bot (contact@tldrsec.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        operationName: 'sec-filing-fetch'
      });
      safeMonitoring.recordDuration('sec_filing_fetch_ms', Date.now() - fetchStart, { source: 'test-summarize' });
      
      // Check if this is a directory listing and handle accordingly
      apiLogger.debug(`Checking if content is directory listing, length: ${content.length}`);
      if (isDirectoryListing(content)) {
        apiLogger.info(`URL ${filingUrl} is a directory listing, looking for document links`);
        const documentLinks = extractDocumentLinksFromDirectoryListing(content, filingUrl);
        apiLogger.info(`Found ${documentLinks.length} document links:`, { links: documentLinks.slice(0, 3) });
        
        if (documentLinks.length > 0) {
          // Find the first valid filing document with enhanced validation
          let selectedUrl = null;
          for (const link of documentLinks) {
            const filename = link.split('/').pop()?.toLowerCase() || '';
            
            // Exclude navigation and non-filing URLs
            if (link.includes('sec.gov/index.htm') || 
                link.includes('sec.gov/search') || 
                link.includes('sec.gov/news') ||
                link.includes('sec.gov/about') ||
                link.includes('sec.gov/newsroom') ||
                link.endsWith('/') ||
                filename.includes('index') ||
                filename.includes('upcoming-events')) {
              continue;
            }
            
            // Must be a filing document type (prioritize XML for cost efficiency)
            if (filename.match(/\.(xml|html?|txt|xbrl)$/i)) {
              selectedUrl = link;
              // Prefer XML files if found
              if (filename.endsWith('.xml')) {
                break;
              }
            }
          }
          
          if (selectedUrl) {
            actualUrl = selectedUrl;
            apiLogger.info(`Using selected document from listing: ${actualUrl}`, {
              totalLinks: documentLinks.length,
              selectedIndex: documentLinks.indexOf(selectedUrl),
              filename: selectedUrl.split('/').pop(),
              firstFewLinks: documentLinks.slice(0, 5)
            });
          } else {
            apiLogger.warn('No valid filing documents found in directory listing', {
              totalLinks: documentLinks.length,
              allLinks: documentLinks.slice(0, 10) // Limit logging for readability
            });
            
            // Fallback: Try to construct a direct filing URL
            const accessionMatch = filingUrl.match(/(\d{10}-\d{2}-\d{6})/);
            if (accessionMatch) {
              const accessionNumber = accessionMatch[1];
              const basePath = filingUrl.endsWith('/') ? filingUrl : filingUrl + '/';
              const fallbackUrl = `${basePath}${accessionNumber.replace(/-/g, '')}.htm`;
              
              apiLogger.info(`Trying fallback constructed URL: ${fallbackUrl}`);
              actualUrl = fallbackUrl;
            }
          }
          
          // Fetch the actual document
          const docFetchStart = Date.now();
          content = await enhancedFetch(actualUrl, {
            responseType: 'text',
            headers: {
              'User-Agent': 'tldrSEC-AI Bot (contact@tldrsec.com)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            operationName: 'sec-filing-fetch'
          });
          safeMonitoring.recordDuration('sec_filing_fetch_ms', Date.now() - docFetchStart, { source: 'test-summarize', is_directory: 'true' });
          apiLogger.info(`Fetched actual document, new content length: ${content.length}`);
        } else {
          apiLogger.warn('No document links found in directory listing');
        }
      } else {
        apiLogger.debug('Content is not detected as directory listing');
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
      parsedContent = await parseFormContentEnhanced(content);
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
    
    // Step 5: Check if content needs chunking
    const inputTokens = estimateTokenCount(prompt);
    const maxTokensAllowed = 100000; // Conservative limit to ensure chunks fit within context
    
    let tokenEstimates;
    let processMode: 'single' | 'chunked' = 'single';
    
    if (inputTokens > maxTokensAllowed) {
      // Content is too large, needs chunking
      processMode = 'chunked';
      const contentChunks = chunkContent(content);
      apiLogger.info(`Content too large (${inputTokens} tokens), splitting into ${contentChunks.length} chunks`);
      
      // Estimate tokens for chunked processing
      const avgChunkTokens = Math.ceil(inputTokens / contentChunks.length);
      const estimatedOutputTokens = contentChunks.length * 1000; // Estimate 1000 tokens per chunk summary
      tokenEstimates = {
        inputTokens,
        estimatedOutputTokens,
        totalTokens: inputTokens + estimatedOutputTokens,
        estimatedCost: calculateCost(inputTokens, estimatedOutputTokens),
        chunks: contentChunks.length,
        avgChunkTokens
      };
    } else {
      // Single prompt processing
      const estimatedOutputTokens = Math.ceil(inputTokens * 0.3);
      tokenEstimates = {
        inputTokens,
        estimatedOutputTokens,
        totalTokens: inputTokens + estimatedOutputTokens,
        estimatedCost: calculateCost(inputTokens, estimatedOutputTokens)
      };
    }
    
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
      apiLogger.debug(`Calling Claude API for ${actualUrl} in ${processMode} mode`);
      try {
        // Create Anthropic client directly
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
        
        if (processMode === 'chunked') {
          // Process content in chunks
          const contentChunks = chunkContent(content);
          const chunkSummaries: any[] = [];
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          
          apiLogger.info(`Processing ${contentChunks.length} chunks for ${actualUrl}`);
          
          for (let i = 0; i < contentChunks.length; i++) {
            const chunkPrompt = generateChunkPrompt(
              actualFilingType, 
              contentChunks[i], 
              i, 
              contentChunks.length, 
              actualCompanyName, 
              actualTicker
            );
            
            const chunkTokens = estimateTokenCount(chunkPrompt);
            apiLogger.debug(`Processing chunk ${i + 1}/${contentChunks.length}, tokens: ${chunkTokens}`);
            
            // Skip chunks that are still too large
            if (chunkTokens > 190000) {
              apiLogger.warn(`Skipping chunk ${i + 1} - still too large (${chunkTokens} tokens)`);
              chunkSummaries.push({ 
                chunkSummary: `Chunk ${i + 1} was too large to process (${chunkTokens} tokens)`,
                skipped: true 
              });
              continue;
            }
            
            const chunkResponse = await anthropic.messages.create({
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 2000,
              temperature: 0.3,
              messages: [
                {
                  role: 'user',
                  content: chunkPrompt
                }
              ]
            });
            
            const chunkText = chunkResponse.content[0]?.type === 'text' ? chunkResponse.content[0].text : '';
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
            summary: `Analyzed ${contentChunks.length} sections of ${actualCompanyName || 'the company'}'s ${actualFilingType} filing.`,
            financialPerformance: chunkSummaries.flatMap(chunk => chunk.keyFinancials || []).slice(0, 10),
            businessHighlights: chunkSummaries.flatMap(chunk => chunk.businessUpdates || []).slice(0, 10),
            riskFactors: chunkSummaries.flatMap(chunk => chunk.risks || []).slice(0, 10),
            keyTakeaway: `This ${actualFilingType} filing contains ${contentChunks.length} major sections with detailed financial and business information.`,
            chunkSummaries: chunkSummaries.map(chunk => chunk.chunkSummary || '').filter(Boolean)
          };
          
          const totalCost = (totalInputTokens / 1000000) * 3 + (totalOutputTokens / 1000000) * 15;
          
          response.summary = {
            text: aggregatedSummary,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cost: totalCost,
            duration: 0
          };
          
          // Add chunksProcessed as additional metadata
          (response.summary as any).chunksProcessed = contentChunks.length;
          
          // Database saving is now handled by the cache layer
          
        } else {
          // Single prompt processing
          const claudeResponse = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4000,
            temperature: 0.3,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          });
          
          // Extract text content from Claude response
          const responseText = claudeResponse.content[0]?.type === 'text' ? claudeResponse.content[0].text : '';
          
          // Try to parse the response as JSON
          let summaryText: string | Record<string, any> = responseText;
          try {
            // Check if the response is valid JSON
            if (responseText.trim().startsWith('{') && responseText.trim().endsWith('}')) {
              summaryText = JSON.parse(responseText);
            }
          } catch (jsonError) {
            // If parsing fails, use the raw text
            apiLogger.warn(`Failed to parse Claude response as JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
          }
          
          // Calculate cost
          const cost = (claudeResponse.usage.input_tokens / 1000000) * 3 + (claudeResponse.usage.output_tokens / 1000000) * 15;
          
          response.summary = {
            text: summaryText,
            inputTokens: claudeResponse.usage.input_tokens,
            outputTokens: claudeResponse.usage.output_tokens,
            cost: cost,
            duration: 0
          };
          
          // Database saving is now handled by the cache layer
        }
        
        // Save to database cache
        const cacheId = await saveToCache(filingUrl, response);
        if (cacheId && !response.savedSummaryId) {
          response.savedSummaryId = cacheId;
        }
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
