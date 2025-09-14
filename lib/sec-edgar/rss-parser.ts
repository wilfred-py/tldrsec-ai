import { parseStringPromise } from 'xml2js';
import { logger } from '../logging';
import { 
  CIKValidationResult,
  CIKValidationError,
  CIKErrorCode,
  ValidationResult
} from '../../types/validation';

const rssLogger = logger.child('sec-rss-parser');

export interface RSSFilingEntry {
  accessionNumber: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  rssEntryDate: Date;
  title: string;
}

export interface CompanyRSSFeed {
  cik: string;
  companyName: string;
  entries: RSSFilingEntry[];
  lastUpdated: Date;
}

/**
 * Parse SEC company RSS feed XML to extract filing information
 * RSS Format: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1318605&output=atom
 */
export async function parseSecCompanyRSS(xmlContent: string, cik: string): Promise<CompanyRSSFeed> {
  try {
    const result = await parseStringPromise(xmlContent);
    
    if (!result.feed) {
      throw new Error('Invalid RSS feed format - no feed element found');
    }

    const feed = result.feed;
    const entries: RSSFilingEntry[] = [];
    
    // Extract company name from feed title
    const feedTitle = feed.title?.[0] || '';
    const companyNameMatch = feedTitle.match(/^(.+?)\s+\(/);
    const companyName = companyNameMatch ? companyNameMatch[1].trim() : `Company ${cik}`;

    // Process each entry
    if (feed.entry && Array.isArray(feed.entry)) {
      for (const entry of feed.entry) {
        try {
          const parsedEntry = parseRSSEntry(entry);
          if (parsedEntry) {
            entries.push(parsedEntry);
          }
        } catch (entryError) {
          rssLogger.warn('Failed to parse RSS entry', { 
            error: entryError, 
            cik,
            entryId: entry.id?.[0] 
          });
        }
      }
    }

    rssLogger.info(`Parsed RSS feed for ${companyName}`, {
      cik,
      entriesFound: entries.length,
      companyName
    });

    return {
      cik,
      companyName,
      entries: entries.sort((a, b) => b.rssEntryDate.getTime() - a.rssEntryDate.getTime()),
      lastUpdated: new Date()
    };

  } catch (error) {
    rssLogger.error('Failed to parse SEC RSS feed', { error, cik });
    throw new Error(`RSS parsing failed for CIK ${cik}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse individual RSS entry to extract filing information
 */
function parseRSSEntry(entry: any): RSSFilingEntry | null {
  try {
    // Extract accession number from entry ID or link
    const entryId = entry.id?.[0] || '';
    const accessionMatch = entryId.match(/(\d{10}-\d{2}-\d{6})/);
    
    if (!accessionMatch) {
      rssLogger.debug('No accession number found in entry', { entryId });
      return null;
    }

    const accessionNumber = accessionMatch[1];
    
    // Extract filing type and date from title
    // Example: "8-K - Current report filing"
    const title = entry.title?.[0] || '';
    const filingTypeMatch = title.match(/^([A-Z0-9\/-]+)/);
    const filingType = filingTypeMatch ? filingTypeMatch[1] : 'UNKNOWN';

    // Extract filing date from summary or updated field
    const summaryText = entry.summary?.[0] || '';
    const dateMatch = typeof summaryText === 'string' ? summaryText.match(/Filed:\s*(\d{4}-\d{2}-\d{2})/) : null;
    
    let filingDate: Date;
    if (dateMatch) {
      filingDate = new Date(dateMatch[1]);
    } else {
      // Fallback to entry updated date
      const updatedStr = entry.updated?.[0] || entry.published?.[0];
      filingDate = updatedStr ? new Date(updatedStr) : new Date();
    }

    // Extract filing URL from link
    const link = entry.link?.[0];
    let filingUrl = '';
    
    if (typeof link === 'string') {
      filingUrl = link;
    } else if (link && link.$ && link.$.href) {
      filingUrl = link.$.href;
    }

    // RSS entry date
    const rssEntryDate = entry.updated?.[0] ? new Date(entry.updated[0]) : new Date();

    return {
      accessionNumber,
      filingType,
      filingDate,
      filingUrl,
      rssEntryDate,
      title: title.trim()
    };

  } catch (error) {
    rssLogger.error('Failed to parse RSS entry', { error, entry });
    return null;
  }
}

/**
 * Validate and format CIK number
 */
export function validateCIK(cik: string): CIKValidationResult {
  const startTime = Date.now();
  
  // Basic validation
  if (!cik || typeof cik !== 'string') {
    return {
      isValid: false,
      error: {
        code: CIKErrorCode.EMPTY_VALUE,
        message: 'CIK must be a non-empty string',
        details: `Received: ${typeof cik} - ${cik}`
      },
      metadata: {
        originalValue: String(cik),
        validationTimestamp: new Date(),
        validationMethod: 'FORMAT_CHECK',
        processingTimeMs: Date.now() - startTime
      }
    };
  }
  
  // Remove any whitespace
  const trimmedCik = cik.trim();
  
  if (trimmedCik.length === 0) {
    return {
      isValid: false,
      error: {
        code: CIKErrorCode.EMPTY_VALUE,
        message: 'CIK cannot be empty or whitespace only'
      },
      metadata: {
        originalValue: cik,
        validationTimestamp: new Date(),
        validationMethod: 'FORMAT_CHECK',
        processingTimeMs: Date.now() - startTime
      }
    };
  }
  
  // Check if it's numeric
  if (!/^\d+$/.test(trimmedCik)) {
    return {
      isValid: false,
      error: {
        code: CIKErrorCode.NON_NUMERIC,
        message: 'CIK must contain only numeric characters',
        details: `Invalid characters found in: ${trimmedCik}`
      },
      metadata: {
        originalValue: cik,
        validationTimestamp: new Date(),
        validationMethod: 'FORMAT_CHECK',
        processingTimeMs: Date.now() - startTime
      }
    };
  }
  
  // Check length (CIK should be 1-10 digits)
  if (trimmedCik.length > 10) {
    return {
      isValid: false,
      error: {
        code: CIKErrorCode.INVALID_LENGTH,
        message: 'CIK cannot be longer than 10 digits',
        details: `Length: ${trimmedCik.length}, Value: ${trimmedCik}`
      },
      metadata: {
        originalValue: cik,
        validationTimestamp: new Date(),
        validationMethod: 'FORMAT_CHECK',
        processingTimeMs: Date.now() - startTime
      }
    };
  }
  
  // Format with leading zeros (10 digits)
  const formattedCik = trimmedCik.padStart(10, '0');
  
  return {
    isValid: true,
    formattedCIK: formattedCik,
    metadata: {
      originalValue: cik,
      validationTimestamp: new Date(),
      validationMethod: 'FORMAT_CHECK',
      processingTimeMs: Date.now() - startTime
    }
  };
}

/**
 * Generate SEC RSS URL for a company by CIK
 */
export function generateSecRssUrl(cik: string): string {
  const validation = validateCIK(cik);
  
  if (!validation.isValid) {
    throw new Error(`Invalid CIK provided: ${validation.error?.message}. Details: ${validation.error?.details}`);
  }
  
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${validation.formattedCIK}&output=atom`;
}

/**
 * Fetch and parse SEC RSS feed for a company
 */
export async function fetchSecCompanyRSS(cik: string): Promise<CompanyRSSFeed> {
  // Validate CIK first
  const validation = validateCIK(cik);
  if (!validation.isValid) {
    const error = new Error(`Invalid CIK provided: ${validation.error?.message}`);
    rssLogger.error('CIK validation failed', { 
      originalCik: cik, 
      error: validation.error,
      metadata: validation.metadata 
    });
    throw error;
  }
  
  const formattedCik = validation.formattedCIK!;
  const rssUrl = generateSecRssUrl(cik);
  
  try {
    rssLogger.debug(`Fetching RSS feed for CIK ${formattedCik}`, { 
      rssUrl, 
      originalCik: cik,
      validationMetadata: validation.metadata 
    });
    
    // Railway-enhanced SEC fetch with detailed diagnostics
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    const userAgent = isRailway
      ? 'TLDRSEC wilfredchen1@gmail.com'
      : 'TLDRSEC wilfredchen1@gmail.com';
    
    rssLogger.info(`[SEC-FETCH] Starting RSS fetch`, {
      cik: formattedCik,
      url: rssUrl,
      environment: process.env.NODE_ENV,
      isRailway,
      userAgent,
      timestamp: new Date().toISOString()
    });

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/atom+xml, application/xml, text/xml',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(15000) // 15 second timeout for Railway
    });

    rssLogger.info(`[SEC-FETCH] Response received`, {
      cik: formattedCik,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      url: rssUrl
    });

    if (!response.ok) {
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url: rssUrl,
        cik: formattedCik,
        isRailway,
        responseHeaders: Object.fromEntries(response.headers.entries())
      };
      
      rssLogger.error(`[SEC-FETCH] HTTP error response`, errorDetails);
      throw new Error(`SEC RSS fetch failed - HTTP ${response.status}: ${response.statusText} for CIK ${formattedCik}`);
    }

    const xmlContent = await response.text();
    return await parseSecCompanyRSS(xmlContent, formattedCik);

  } catch (error) {
    const isRailway = !!process.env.RAILWAY_PUBLIC_DOMAIN;
    const errorDetails = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      rssUrl,
      originalCik: cik,
      formattedCik,
      environment: process.env.NODE_ENV,
      isRailway,
      railwayDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
      errorType: error instanceof TypeError ? 'NetworkError' : 
                 error instanceof Error && error.name === 'AbortError' ? 'TimeoutError' :
                 error instanceof SyntaxError ? 'ParseError' : 'UnknownError',
      timestamp: new Date().toISOString()
    };
    
    rssLogger.error(`[SEC-FETCH] Failed to fetch RSS feed for CIK ${formattedCik}`, errorDetails);
    
    // Railway-specific debugging
    if (isRailway) {
      rssLogger.error(`[RAILWAY-DEBUG] SEC connectivity issue detected`, {
        possibleCauses: [
          'Railway IP range blocked by SEC.gov',
          'DNS resolution failure for sec.gov',
          'Firewall/egress restrictions',
          'SEC rate limiting Railway IPs',
          'SSL/TLS certificate issues'
        ],
        troubleshooting: {
          testEndpoint: '/api/debug/sec-connectivity?cik=' + formattedCik,
          railwayDomain: process.env.RAILWAY_PUBLIC_DOMAIN
        }
      });
    }
    
    throw error;
  }
}
