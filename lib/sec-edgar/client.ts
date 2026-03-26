import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import Bottleneck from 'bottleneck';
import {
  FilingType,
  SECApiResponse,
  SECEdgarConfig,
  SECEdgarError,
  SECErrorCode,
  SECRequestOptions,
  SECFilingSearchParams
} from './types';
import { sleep } from '../utils';
import {
  SubmissionsResponse,
  SubmissionsFiling,
  SubmissionsPollResult,
  buildSubmissionsUrl,
  zipColumnarFilings,
  filterNewFilings,
  SubmissionsParseError,
} from './submissions-client';

/**
 * Default SEC EDGAR API configuration
 *
 * IMPORTANT: These values must fit within the 165s FILING_PROCESSING_TIMEOUT.
 *
 * Timeout Budget Analysis (165s total, with 15s buffer before Vercel 180s limit):
 * - SEC fetch: up to 120s worst case
 * - AI summarization: up to 60s
 * - Total: 180s worst case (fits 165s budget in typical cases)
 *
 * Filing retrieval worst case (attemptFilingRetrieval):
 * - Index page fetch: 15s
 * - Extension probing (up to 4): 4 × 15s = 60s
 * - Fallback probing (up to 3): 3 × 15s = 45s
 * - Total worst case: ~120s
 *
 * Expected case (typical filings):
 * - Index fetch: 15s
 * - Document fetch: 15s
 * - Total expected: ~30s (much better than worst case) ✓
 *
 * Note: maxRetries=0 means no retry at this level. Job queue handles retries.
 */
const DEFAULT_CONFIG: SECEdgarConfig = {
  userAgent: 'TLDRSEC wilfredchen1@gmail.com', // SEC compliant User-Agent format
  maxRequestsPerSecond: 10, // SEC fair access policy limit
  baseUrl: 'https://www.sec.gov',
  maxRetries: 0,      // CRITICAL: No retries - single 15s attempt per request
                      // Filing retrieval makes 2+ requests per filing (index + doc)
                      // With maxRetries=0: typical 2 requests × 15s = 30s ✓
  retryDelay: 1000    // 1s initial (unused with maxRetries=0)
};

/**
 * SEC EDGAR API client with rate limiting and retry logic
 */
export class SECEdgarClient {
  private client: AxiosInstance;
  private limiter: Bottleneck;
  private config: SECEdgarConfig;
  private requestInterval: number;
  private lastRequestTime: number = 0;

  constructor(config: Partial<SECEdgarConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize axios client with default configuration
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 15000, // 15 seconds timeout - reduced to fit more requests within 60s budget
      headers: {
        'User-Agent': this.config.userAgent, // Required by SEC
        'Accept': 'application/json, text/html, application/xml, */*',
        'Accept-Encoding': 'gzip, deflate',
      }
    });

    // Initialize rate limiter based on SEC's fair access policy
    this.limiter = new Bottleneck({
      maxConcurrent: 5, // Maximum concurrent requests
      minTime: 1000 / this.config.maxRequestsPerSecond, // Minimum time between requests
      highWater: 50, // Maximum size of queue
      strategy: Bottleneck.strategy.LEAK, // If queue is full, drop the oldest requests
    });

    // Add logging for debugging
    this.limiter.on('failed', async (error, jobInfo) => {
      console.warn(`SEC API request attempt ${jobInfo.retryCount} failed:`, error);
      
      // Implement exponential backoff for retries
      const delay = this.getRetryDelay(jobInfo.retryCount);
      console.log(`Retrying in ${delay}ms`);
      return delay;
    });

    // Calculate request interval in ms from max requests per second
    this.requestInterval = this.config.maxRequestsPerSecond 
      ? 1000 / this.config.maxRequestsPerSecond 
      : 100; // Default: 10 requests per second
  }

  /**
   * Calculate exponential backoff delay for retries
   *
   * IMPORTANT: Max delay reduced from 5s to 3s to fit within 60s SEC fetch budget.
   * With maxRetries: 1 (2 total attempts), delays are minimal: 1s → 2s → 3s (capped)
   */
  private getRetryDelay(retryCount: number): number {
    return Math.min(
      this.config.retryDelay * Math.pow(2, retryCount),
      3000 // Max 3 seconds delay (reduced from 5s to fit 60s budget)
    );
  }

  /**
   * Execute an API request with rate limiting and retries
   */
  private async executeRequest<T>(
    config: AxiosRequestConfig, 
    options: { retry?: boolean; maxRetries?: number } = {}
  ): Promise<T> {
    const shouldRetry = options.retry !== false;
    const maxRetries = options.maxRetries || this.config.maxRetries;

    // Wrap the axios request with rate limiting
    return this.limiter.schedule(async () => {
      try {
        const response = await this.client.request<T>(config);
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        let secError: SECEdgarError;

        if (axiosError.response) {
          // Server responded with error status
          if (axiosError.response.status === 429) {
            secError = new SECEdgarError(
              'SEC API rate limit exceeded', 
              SECErrorCode.RATE_LIMIT_EXCEEDED,
              429
            );
          } else {
            secError = new SECEdgarError(
              `SEC API error: ${axiosError.response.status} ${axiosError.response.statusText}`,
              SECErrorCode.UNKNOWN_ERROR,
              axiosError.response.status
            );
          }
        } else if (axiosError.request) {
          // Request was made but no response received (timeout)
          secError = new SECEdgarError(
            'SEC API timeout or no response',
            SECErrorCode.TIMEOUT
          );
        } else {
          // Error in setting up the request
          secError = new SECEdgarError(
            `Error setting up SEC API request: ${axiosError.message}`,
            SECErrorCode.NETWORK_ERROR
          );
        }

        // If we should retry and haven't exceeded max retries, throw special error
        if (shouldRetry && maxRetries > 0) {
          throw secError;
        }

        // Otherwise, rethrow the error
        throw secError;
      }
    }, { 
      // Bottleneck retry options
      retries: shouldRetry ? maxRetries : 0,
      expiration: 60000 // Give up after 60 seconds
    });
  }

  /**
   * Fetch recent filings from SEC EDGAR
   */
  async getRecentFilings(options: SECRequestOptions = {}): Promise<SECApiResponse> {
    const {
      start = 0,
      count = 100,
      formType,
      cik,
      owner = 'include',
      retry = true,
      maxRetries = this.config.maxRetries
    } = options;

    // Construct query parameters
    const params: Record<string, string> = {
      action: 'getcurrent',
      owner,
      start: start.toString(),
      count: count.toString(),
      output: 'atom'
    };

    // Add form type filter if specified
    if (formType) {
      const formTypes = Array.isArray(formType) ? formType : [formType];
      params.type = formTypes.join(',');
    }

    // Add CIK filter if specified
    if (cik) {
      params.CIK = cik;
    }

    // Make request to SEC EDGAR browse endpoint
    return this.executeRequest<any>(
      {
        method: 'GET',
        url: '/cgi-bin/browse-edgar',
        params,
      },
      { retry, maxRetries }
    );
  }

  /**
   * Fetch a specific filing document from SEC EDGAR
   * @param url The URL of the document to fetch
   * @param options Options for retrying and handling errors
   * @returns The document content or null if not found
   * @throws SECEdgarError for network errors or other issues
   */
  async getFilingDocument(url: string, options: { 
    retry?: boolean; 
    maxRetries?: number; 
    handleNotFound?: boolean;
  } = {}): Promise<string | null> {
    const { 
      retry = true, 
      maxRetries = this.config.maxRetries,
      handleNotFound = true // Default to handling 404 errors gracefully
    } = options;
    
    // If the URL is a relative URL, prepend the base URL
    const fullUrl = url.startsWith('http') ? url : `${this.config.baseUrl}${url}`;
    
    try {
      return await this.executeRequest<string>(
        {
          method: 'GET',
          url: fullUrl,
          responseType: 'text',
          validateStatus: (status) => {
            // Consider 404 as a valid status if handleNotFound is true
            return (handleNotFound && status === 404) || (status >= 200 && status < 300);
          }
        },
        { retry, maxRetries }
      );
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Handle 404 errors gracefully if requested
      if (handleNotFound && axiosError.response?.status === 404) {
        console.warn(`Document not found at ${fullUrl}`);
        return null;
      }
      
      // For other errors, add context about the document being fetched
      if (axiosError.response) {
        throw new SECEdgarError(
          `Failed to fetch document: ${axiosError.response.status} ${axiosError.response.statusText} for URL ${fullUrl}`,
          SECErrorCode.DOCUMENT_FETCH_ERROR,
          axiosError.response.status
        );
      }
      
      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Fetch company information by CIK or ticker
   */
  async getCompanyInfo(identifier: string): Promise<any> {
    // Determine if identifier is a CIK or ticker
    const isCik = /^\d+$/.test(identifier);
    const searchParam = isCik ? { CIK: identifier } : { company: identifier };

    return this.executeRequest<any>(
      {
        method: 'GET',
        url: '/cgi-bin/browse-edgar',
        params: {
          action: 'getcompany',
          ...searchParam,
          output: 'atom'
        }
      }
    );
  }

  /**
   * Fetch an RSS feed from the SEC EDGAR API
   */
  async fetchRssFeed(url: string): Promise<string> {
    await this.throttleRequest();
    
    try {
      const response = await this.client.get(url, {
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching SEC RSS feed: ${error}`);
      throw error;
    }
  }

  /**
   * Get recent filings from the SEC EDGAR API
   */
  async getRecentFilingsFromApi(params: SECFilingSearchParams): Promise<SECApiResponse> {
    await this.throttleRequest();
    
    try {
      const url = this.buildFilingsUrl(params);
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching SEC filings: ${error}`);
      throw error;
    }
  }

  /**
   * Get a specific filing from the SEC EDGAR API
   */
  async getFiling(url: string): Promise<string> {
    await this.throttleRequest();
    
    try {
      const response = await this.client.get(url, {
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching SEC filing: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch submissions data from the SEC EDGAR Submissions API.
   *
   * Polls data.sec.gov/submissions/CIK{padded}.json for a specific company.
   * Returns new filings since the given watermark, plus the latest
   * acceptanceDateTime for watermark updates.
   *
   * Uses the shared Bottleneck rate limiter (SEC rate limits apply per IP
   * across all *.sec.gov hostnames).
   *
   * Supports ETag-based conditional requests: when lastEtag is provided,
   * sends If-None-Match header. SEC returns 304 Not Modified when nothing
   * changed, saving bandwidth (~95% of polls during normal operation).
   *
   * @param cik - Company CIK number (will be zero-padded to 10 digits)
   * @param watermark - Last seen acceptanceDateTime string, or null for first run
   * @param lastEtag - ETag from previous response, or null for first request
   * @returns Poll result with new filings, latest watermark, and ETag status
   */
  async fetchSubmissions(
    cik: string,
    watermark: string | null,
    lastEtag: string | null = null
  ): Promise<SubmissionsPollResult & { etag: string | null }> {
    const url = buildSubmissionsUrl(cik);

    const headers: Record<string, string> = {};
    if (lastEtag) {
      headers['If-None-Match'] = lastEtag;
    }

    try {
      const response = await this.limiter.schedule(async () => {
        return this.client.request<SubmissionsResponse>({
          method: 'GET',
          url,
          headers,
          // Accept 304 as valid (conditional request cache hit)
          validateStatus: (status) => status === 304 || (status >= 200 && status < 300),
        });
      }, {
        retries: 0,
        expiration: 60000,
      });

      // 304 Not Modified — ETag cache hit, no new filings
      if (response.status === 304) {
        return {
          newFilings: [],
          latestAcceptanceDateTime: null,
          companyName: '',
          notModified: true,
          etag: lastEtag,
        };
      }

      const data = response.data;
      const responseEtag = (response.headers?.etag as string) ?? null;

      // Parse columnar arrays into filing records
      const allFilings = zipColumnarFilings(data.filings.recent);

      // Filter to filings newer than watermark
      const newFilings = filterNewFilings(allFilings, watermark);

      // Determine the latest acceptanceDateTime for watermark update
      let latestAcceptanceDateTime: string | null = null;
      if (data.filings.recent.acceptanceDateTime.length > 0) {
        // The first entry is the most recent filing
        latestAcceptanceDateTime = data.filings.recent.acceptanceDateTime[0];
      }

      return {
        newFilings,
        latestAcceptanceDateTime,
        companyName: data.name,
        notModified: false,
        etag: responseEtag,
      };
    } catch (error) {
      if (error instanceof SubmissionsParseError) {
        console.error(`[fetchSubmissions] Parse error for CIK ${cik}: ${error.message}`);
        throw new SECEdgarError(
          `Submissions API parse error for CIK ${cik}: ${error.message}`,
          SECErrorCode.PARSING_ERROR
        );
      }

      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const status = axiosError.response.status;
        if (status === 429) {
          throw new SECEdgarError(
            `SEC rate limit exceeded polling CIK ${cik}`,
            SECErrorCode.RATE_LIMIT_EXCEEDED,
            429
          );
        }
        throw new SECEdgarError(
          `Submissions API error for CIK ${cik}: ${status} ${axiosError.response.statusText}`,
          SECErrorCode.UNKNOWN_ERROR,
          status
        );
      }

      if (axiosError.request) {
        throw new SECEdgarError(
          `Submissions API timeout for CIK ${cik}`,
          SECErrorCode.TIMEOUT
        );
      }

      throw error;
    }
  }

  /**
   * Throttle requests to comply with SEC Edgar API rate limits
   */
  private async throttleRequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestInterval) {
      const sleepTime = this.requestInterval - timeSinceLastRequest;
      await sleep(sleepTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Build the URL for the SEC EDGAR API
   */
  private buildFilingsUrl(params: SECFilingSearchParams): string {
    const baseUrl = 'https://data.sec.gov/api/xbrl/filings';
    const queryParams = new URLSearchParams();
    
    if (params.formType) {
      const formTypes = Array.isArray(params.formType) 
        ? params.formType 
        : [params.formType];
      queryParams.append('form', formTypes.join(','));
    }
    
    if (params.startDate) {
      queryParams.append('from', this.formatDate(params.startDate));
    }
    
    if (params.endDate) {
      queryParams.append('to', this.formatDate(params.endDate));
    }
    
    if (params.count) {
      queryParams.append('count', params.count.toString());
    }
    
    if (params.ticker) {
      queryParams.append('ticker', params.ticker);
    }
    
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
  
  /**
   * Format a date for the SEC EDGAR API
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
} 