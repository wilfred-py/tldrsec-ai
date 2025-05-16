import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import Bottleneck from 'bottleneck';
import { 
  FilingType, 
  SECApiResponse, 
  SECEdgarConfig, 
  SECEdgarError, 
  SECErrorCode, 
  SECRequestOptions 
} from './types';

/**
 * Default SEC EDGAR API configuration
 */
const DEFAULT_CONFIG: SECEdgarConfig = {
  userAgent: 'TLDRSEC-AI-App contact@example.com', // Should be updated with real contact info
  maxRequestsPerSecond: 10, // SEC fair access policy limit
  baseUrl: 'https://www.sec.gov',
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * SEC EDGAR API client with rate limiting and retry logic
 */
export class SECEdgarClient {
  private client: AxiosInstance;
  private limiter: Bottleneck;
  private config: SECEdgarConfig;

  constructor(config: Partial<SECEdgarConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize axios client with default configuration
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000, // 30 seconds timeout
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
  }

  /**
   * Calculate exponential backoff delay for retries
   */
  private getRetryDelay(retryCount: number): number {
    return Math.min(
      this.config.retryDelay * Math.pow(2, retryCount),
      30000 // Max 30 seconds delay
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
   */
  async getFilingDocument(url: string, options: { retry?: boolean; maxRetries?: number } = {}): Promise<string> {
    const { retry = true, maxRetries = this.config.maxRetries } = options;
    
    // If the URL is a relative URL, prepend the base URL
    const fullUrl = url.startsWith('http') ? url : `${this.config.baseUrl}${url}`;
    
    return this.executeRequest<string>(
      {
        method: 'GET',
        url: fullUrl,
        responseType: 'text',
      },
      { retry, maxRetries }
    );
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
} 