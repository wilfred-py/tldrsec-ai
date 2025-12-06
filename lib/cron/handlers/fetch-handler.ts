/**
 * Fetch Handler - Phase 2 of 3-Phase Async Pipeline
 *
 * Purpose: Fetch SEC filing content and cache it (10-30s target)
 * - Retrieve complete filing content from SEC EDGAR
 * - Store in FilingContentCache table with 24h TTL
 * - Queue ASYNC_SUMMARIZE_CACHED job for AI processing
 *
 * OPTIMIZATION: Uses direct index parsing instead of slow multi-retry approach
 * - Fetches index page first to find primary document
 * - Extracts document URL and fetches content directly
 * - Avoids slow fallback loops that can timeout
 *
 * This handler fits within Vercel's 180s limit
 */

import { logger } from '../../logging';
import { JobQueueService } from '../../job-queue';
import type { JobPayload } from '../../job-queue';
import { createHash } from 'crypto';
import { SECEdgarClient } from '../../sec-edgar/client';
import { verifyFilingContent, type FilingMetadata, type ContentVerificationResult } from '../../validation/filing-content-verifier';

const fetchLogger = logger.child('fetch-handler');

export interface FetchJobPayload extends JobPayload {
  userId: string;
  userEmail: string;
  userTier: string;
  ticker: {
    symbol: string;
    companyName?: string;
    cik?: string;
  };
  filing: {
    filingId: string;
    formType: string;
    filingDate: Date | string;
    filingUrl: string;
    accessionNumber: string;
  };
  executionContext: {
    executionId: string;
    cronTriggerTime: string;
    sourceContext: string;
    discoveryPhaseCompletedAt?: string;
  };
}

export interface FetchResult {
  success: boolean;
  cached: boolean;
  cacheId?: string;
  contentLength?: number;
  fetchDuration?: number;
  summarizeJobQueued: boolean;
  error?: string;
  contentVerification?: {
    isVerified: boolean;
    confidence: number;
    warnings?: string[];
  };
}

/**
 * Phase 2: Fetch SEC filing content and cache it
 *
 * Medium duration operation (60-120s) that:
 * 1. Attempts to retrieve content from SEC EDGAR
 * 2. Stores raw content in FilingContentCache with 24h TTL
 * 3. Queues ASYNC_SUMMARIZE_CACHED job for AI processing
 *
 * Fits within Vercel's 180s function timeout
 */
export async function handleFetch(
  payload: FetchJobPayload
): Promise<FetchResult> {
  const startTime = Date.now();
  const { userId, userEmail: _userEmail, userTier, ticker, filing, executionContext } = payload;
  const { executionId } = executionContext;

  fetchLogger.info(`[${executionId}] Starting fetch phase`, {
    userId,
    ticker: ticker.symbol,
    formType: filing.formType,
    accessionNumber: filing.accessionNumber,
    filingUrl: filing.filingUrl
  });

  try {
    const { getPrismaClient } = await import('../../db/prisma');
    const prisma = getPrismaClient();

    // Check if content is already cached and not expired
    const existingCache = await prisma.filingContentCache.findUnique({
      where: { accessionNumber: filing.accessionNumber },
      select: {
        id: true,
        content: true,
        contentLength: true,
        expiresAt: true,
        status: true
      }
    });

    const now = new Date();
    if (existingCache && existingCache.expiresAt > now && existingCache.status === 'CACHED') {
      fetchLogger.info(`[${executionId}] Content already cached`, {
        cacheId: existingCache.id,
        accessionNumber: filing.accessionNumber,
        contentLength: existingCache.contentLength,
        expiresAt: existingCache.expiresAt
      });

      // Queue summarize job immediately
      const summarizeJob = await JobQueueService.addJob({
        jobType: 'ASYNC_SUMMARIZE_CACHED',
        payload: {
          ...payload,
          cacheId: existingCache.id,
          executionContext: {
            ...executionContext,
            fetchPhaseCompletedAt: new Date().toISOString(),
            cacheHit: true
          }
        },
        priority: userTier === 'PREMIUM' ? 9 :
                 userTier === 'PLUS' ? 7 : 5,
        maxAttempts: 3
      });

      return {
        success: true,
        cached: true,
        cacheId: existingCache.id,
        contentLength: existingCache.contentLength,
        fetchDuration: 0,
        summarizeJobQueued: !!summarizeJob
      };
    }

    // Fetch content from SEC EDGAR using optimized direct fetch
    fetchLogger.debug(`[${executionId}] Fetching content from SEC EDGAR (optimized)`, {
      filingUrl: filing.filingUrl,
      accessionNumber: filing.accessionNumber
    });

    let content: string;
    let fetchError: string | undefined;
    let verificationResult: ContentVerificationResult | undefined;

    try {
      // OPTIMIZED: Fast direct fetch instead of slow multi-retry approach
      content = await fetchFilingContentOptimized(
        filing.accessionNumber,
        filing.filingUrl,
        ticker.cik || undefined,
        executionId
      );

      fetchLogger.info(`[${executionId}] Content fetched successfully`, {
        accessionNumber: filing.accessionNumber,
        contentLength: content.length,
        fetchDuration: Date.now() - startTime
      });

      // STEP 2.5: Verify content matches expected filing metadata (Gap 1 fix)
      // This ensures we fetched the correct filing and not a redirect or wrong content
      const expectedMetadata: FilingMetadata = {
        accessionNumber: filing.accessionNumber,
        cik: ticker.cik || '',
        formType: filing.formType,
        companyName: ticker.companyName || ticker.symbol
      };

      verificationResult = verifyFilingContent(content, expectedMetadata);

      fetchLogger.info(`[${executionId}] Content verification result`, {
        accessionNumber: filing.accessionNumber,
        isVerified: verificationResult.isVerified,
        confidence: verificationResult.confidence,
        accessionMatches: verificationResult.accessionNumber.matches,
        cikMatches: verificationResult.cik.matches,
        formTypeMatches: verificationResult.formType.matches,
        companyNameSimilarity: verificationResult.companyName.similarity,
        warnings: verificationResult.warnings.length > 0 ? verificationResult.warnings : undefined,
        errors: verificationResult.errors.length > 0 ? verificationResult.errors : undefined
      });

      // Log warning if verification confidence is low, but continue processing
      // (informational only initially as per plan - don't block on low confidence)
      if (!verificationResult.isVerified || verificationResult.confidence < 60) {
        fetchLogger.warn(`[${executionId}] Content verification confidence is low`, {
          accessionNumber: filing.accessionNumber,
          confidence: verificationResult.confidence,
          isVerified: verificationResult.isVerified,
          errors: verificationResult.errors,
          warnings: verificationResult.warnings,
          extractedMetadata: verificationResult.extractedMetadata,
          action: 'Proceeding with processing despite low confidence (warn only)'
        });
      }
    } catch (retrievalError) {
      fetchError = retrievalError instanceof Error ? retrievalError.message : 'Unknown retrieval error';
      fetchLogger.error(`[${executionId}] Failed to fetch content`, {
        accessionNumber: filing.accessionNumber,
        error: fetchError,
        fetchDuration: Date.now() - startTime
      });

      // Store error in cache for future reference
      await prisma.filingContentCache.upsert({
        where: { accessionNumber: filing.accessionNumber },
        create: {
          accessionNumber: filing.accessionNumber,
          cik: ticker.cik || '',
          formType: filing.formType,
          content: '',
          contentLength: 0,
          contentHash: '',
          expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour for errors
          fetchDuration: Date.now() - startTime,
          fetchError,
          status: 'ERROR'
        },
        update: {
          fetchError,
          fetchDuration: Date.now() - startTime,
          status: 'ERROR',
          expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000)
        }
      });

      return {
        success: false,
        cached: false,
        fetchDuration: Date.now() - startTime,
        summarizeJobQueued: false,
        error: fetchError
      };
    }

    // Calculate content hash for deduplication
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Store in cache with 24h TTL
    const fetchDuration = Date.now() - startTime;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const cachedContent = await prisma.filingContentCache.upsert({
      where: { accessionNumber: filing.accessionNumber },
      create: {
        accessionNumber: filing.accessionNumber,
        cik: ticker.cik || '',
        formType: filing.formType,
        content,
        contentLength: content.length,
        contentHash,
        expiresAt,
        fetchDuration,
        status: 'CACHED'
      },
      update: {
        content,
        contentLength: content.length,
        contentHash,
        expiresAt,
        fetchDuration,
        fetchError: null,
        status: 'CACHED',
        fetchedAt: new Date()
      }
    });

    fetchLogger.info(`[${executionId}] Content cached successfully`, {
      cacheId: cachedContent.id,
      accessionNumber: filing.accessionNumber,
      contentLength: content.length,
      contentHash: contentHash.substring(0, 16),
      expiresAt,
      fetchDuration
    });

    // Queue ASYNC_SUMMARIZE_CACHED job
    const summarizeJob = await JobQueueService.addJob({
      jobType: 'ASYNC_SUMMARIZE_CACHED',
      payload: {
        ...payload,
        cacheId: cachedContent.id,
        executionContext: {
          ...executionContext,
          fetchPhaseCompletedAt: new Date().toISOString(),
          cacheHit: false
        }
      },
      priority: userTier === 'PREMIUM' ? 9 :
               userTier === 'PLUS' ? 7 : 5,
      maxAttempts: 3
    });

    fetchLogger.info(`[${executionId}] Fetch phase completed`, {
      cacheId: cachedContent.id,
      summarizeJobQueued: !!summarizeJob,
      totalDuration: Date.now() - startTime
    });

    return {
      success: true,
      cached: true,
      cacheId: cachedContent.id,
      contentLength: content.length,
      fetchDuration,
      summarizeJobQueued: !!summarizeJob,
      contentVerification: verificationResult ? {
        isVerified: verificationResult.isVerified,
        confidence: verificationResult.confidence,
        warnings: verificationResult.warnings.length > 0 ? verificationResult.warnings : undefined
      } : undefined
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    fetchLogger.error(`[${executionId}] Fetch phase failed`, {
      userId,
      accessionNumber: filing.accessionNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    });

    return {
      success: false,
      cached: false,
      fetchDuration: duration,
      summarizeJobQueued: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Optimized filing content fetch that uses direct index parsing
 *
 * Strategy:
 * 1. Parse the filingUrl (usually an index page) to find primary document
 * 2. Fetch the primary document directly
 * 3. If filing URL is already a document, fetch directly
 *
 * This is much faster than the legacy approach which:
 * - Tries multiple URL patterns
 * - Has long timeouts per attempt
 * - Can take 60+ seconds with retries
 *
 * @param accessionNumber SEC accession number
 * @param filingUrl URL to the filing (usually index page)
 * @param cik Company CIK number
 * @param executionId Execution ID for logging
 * @returns Filing content as string
 */
async function fetchFilingContentOptimized(
  accessionNumber: string,
  filingUrl: string,
  cik: string | undefined,
  executionId: string
): Promise<string> {
  const secClient = new SECEdgarClient();

  // Parse accession number without dashes for URL construction
  const formattedAccession = accessionNumber.replace(/-/g, '');

  // Extract CIK from accession or use provided
  const cikFromAccession = formattedAccession.substring(0, 10).replace(/^0+/, '');
  const effectiveCik = cik?.replace(/^0+/, '') || cikFromAccession;

  fetchLogger.debug(`[${executionId}] Optimized fetch starting`, {
    accessionNumber,
    filingUrl,
    effectiveCik
  });

  // Step 1: Fetch the index page to find the primary document
  // The filingUrl typically points to an index page like:
  // https://www.sec.gov/Archives/edgar/data/CIK/ACCESSION/ACCESSION-index.htm
  const indexUrl = filingUrl.includes('-index.') ? filingUrl :
    `https://www.sec.gov/Archives/edgar/data/${effectiveCik}/${formattedAccession}/${accessionNumber}-index.htm`;

  let indexContent: string;
  try {
    indexContent = await secClient.getFilingDocument(indexUrl, { handleNotFound: true }) || '';
  } catch (indexError) {
    // Try alternate index URL format
    const altIndexUrl = `https://www.sec.gov/Archives/edgar/data/${effectiveCik}/${formattedAccession}/${accessionNumber}-index.html`;
    try {
      indexContent = await secClient.getFilingDocument(altIndexUrl, { handleNotFound: true }) || '';
    } catch {
      throw new Error(`Failed to fetch index page: ${indexError}`);
    }
  }

  if (!indexContent || indexContent.length < 100) {
    throw new Error(`Index page is empty or too short for ${accessionNumber}`);
  }

  // Validate that we received an actual EDGAR index page, not a redirect to SEC search
  // SEC sometimes returns the search page HTML when a filing isn't available or when there's an issue
  if (indexContent.includes('href="https://www.sec.gov/search-filings"') ||
      indexContent.includes('rel="canonical" href="https://www.sec.gov/search-filings"') ||
      indexContent.includes('smartSearch.js') ||
      (indexContent.includes('search-filings') && !indexContent.includes('EDGAR Filing Documents'))) {
    throw new Error(`SEC returned search page instead of filing index for ${accessionNumber}`);
  }

  // Step 2: Parse index to find primary document URL
  // Look for the main filing document (typically .xml for Form 4, .htm for 10-K/10-Q, etc.)
  const documentUrl = extractPrimaryDocumentUrl(indexContent, effectiveCik, formattedAccession, executionId);

  if (!documentUrl) {
    // Fallback: try to fetch the complete submission text file
    const textFileUrl = `https://www.sec.gov/Archives/edgar/data/${effectiveCik}/${formattedAccession}/${accessionNumber}.txt`;

    try {
      const textContent = await secClient.getFilingDocument(textFileUrl, { handleNotFound: true });
      if (textContent && textContent.length > 100) {
        fetchLogger.debug(`[${executionId}] Using complete submission text file`, {
          url: textFileUrl,
          contentLength: textContent.length
        });
        return textContent;
      }
    } catch {
      // Continue to error
    }

    throw new Error(`Could not find primary document for ${accessionNumber}`);
  }

  // Step 3: Fetch the actual document content
  fetchLogger.debug(`[${executionId}] Fetching primary document`, {
    documentUrl
  });

  const content = await secClient.getFilingDocument(documentUrl, { handleNotFound: true });

  if (!content || content.length < 100) {
    throw new Error(`Document content is empty or too short for ${accessionNumber}`);
  }

  // Validate content doesn't contain NoSuchKey error
  if (content.includes('NoSuchKey') || content.includes('<Code>NoSuchKey</Code>')) {
    throw new Error(`Document not found (NoSuchKey) for ${accessionNumber}`);
  }

  // Validate that content is NOT the SEC search page (redirect detection)
  if (content.includes('href="https://www.sec.gov/search-filings"') ||
      content.includes('rel="canonical" href="https://www.sec.gov/search-filings"') ||
      content.includes('smartSearch.js')) {
    throw new Error(`SEC returned search page instead of document content for ${accessionNumber}`);
  }

  fetchLogger.debug(`[${executionId}] Successfully fetched document`, {
    documentUrl,
    contentLength: content.length
  });

  return content;
}

/**
 * Extract primary document URL from index page content
 *
 * Priority:
 * 1. Form 4/Form 3/Form 5: Look for XML file (primary ownership data)
 * 2. 10-K/10-Q: Look for HTM file (main filing document)
 * 3. 8-K: Look for HTM file (current report)
 * 4. Default: First available document
 */
function extractPrimaryDocumentUrl(
  indexContent: string,
  cik: string,
  formattedAccession: string,
  executionId: string
): string | null {
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccession}`;

  // Find all document hrefs in the index
  const hrefMatches = Array.from(indexContent.matchAll(/href="([^"]+\.(xml|htm|html|txt))"/gi));
  const hrefs: { href: string; type: string }[] = [];

  for (const match of hrefMatches) {
    let href = match[1];
    const type = match[2].toLowerCase();

    // Skip non-filing documents like stylesheets
    if (href.includes('xsl') && !href.includes('form')) {
      continue;
    }

    // Skip SEC navigation links (not actual filing documents)
    // These include: /index.htm, /edgar/*, company search, etc.
    if (href === '/index.htm' || href.startsWith('/edgar/') || href.includes('searchedgar')) {
      continue;
    }

    // Handle XBRL viewer URLs: /ix?doc=/Archives/edgar/data/...
    // Extract the actual document path from the viewer URL
    if (href.startsWith('/ix?doc=')) {
      const docMatch = href.match(/\/ix\?doc=([^&]+)/);
      if (docMatch) {
        href = docMatch[1];
      }
    }

    hrefs.push({ href, type });
  }

  fetchLogger.debug(`[${executionId}] Found ${hrefs.length} document links in index`);

  // Priority: XML (for Form 4), then HTM, then HTML, then TXT
  // Look for form-specific XML first (e.g., wf-form4_xxx.xml, wk-form4_xxx.xml)
  const formXml = hrefs.find(h =>
    h.type === 'xml' &&
    h.href.toLowerCase().includes('form') &&
    !h.href.includes('xslF') // Exclude XSL transform versions
  );

  if (formXml) {
    const fullUrl = formXml.href.startsWith('/')
      ? `https://www.sec.gov${formXml.href}`
      : `${baseUrl}/${formXml.href.split('/').pop()}`;
    fetchLogger.debug(`[${executionId}] Selected Form XML document: ${fullUrl}`);
    return fullUrl;
  }

  // Look for primary HTM document (usually the main filing)
  const primaryHtm = hrefs.find(h =>
    (h.type === 'htm' || h.type === 'html') &&
    !h.href.includes('index') &&
    !h.href.includes('FilingSummary')
  );

  if (primaryHtm) {
    const fullUrl = primaryHtm.href.startsWith('/')
      ? `https://www.sec.gov${primaryHtm.href}`
      : `${baseUrl}/${primaryHtm.href.split('/').pop()}`;
    fetchLogger.debug(`[${executionId}] Selected HTM document: ${fullUrl}`);
    return fullUrl;
  }

  // Fallback to any XML (not XSL transform)
  const anyXml = hrefs.find(h => h.type === 'xml' && !h.href.includes('xslF'));
  if (anyXml) {
    const fullUrl = anyXml.href.startsWith('/')
      ? `https://www.sec.gov${anyXml.href}`
      : `${baseUrl}/${anyXml.href.split('/').pop()}`;
    fetchLogger.debug(`[${executionId}] Selected generic XML document: ${fullUrl}`);
    return fullUrl;
  }

  // Last resort: text file
  const txtFile = hrefs.find(h => h.type === 'txt');
  if (txtFile) {
    const fullUrl = txtFile.href.startsWith('/')
      ? `https://www.sec.gov${txtFile.href}`
      : `${baseUrl}/${txtFile.href.split('/').pop()}`;
    fetchLogger.debug(`[${executionId}] Selected TXT document: ${fullUrl}`);
    return fullUrl;
  }

  fetchLogger.warn(`[${executionId}] No primary document found in index`);
  return null;
}
