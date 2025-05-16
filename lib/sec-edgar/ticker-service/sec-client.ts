import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import Bottleneck from 'bottleneck';
import { SECCompanyData } from './types';
import { SECEdgarError, SECErrorCode } from '../types';

/**
 * Client for accessing SEC API data endpoints, with rate limiting and proper headers
 */
export class SECDataClient {
  private client: AxiosInstance;
  private limiter: Bottleneck;
  private baseUrl: string = 'https://data.sec.gov';
  private userAgent: string;
  private maxRequestsPerSecond: number;

  constructor(options: { 
    userAgent?: string; 
    maxRequestsPerSecond?: number;
  } = {}) {
    // SEC requires a legitimate user agent with contact information
    this.userAgent = options.userAgent || 
      process.env.SEC_USER_AGENT || 
      'TLDRSEC-AI-App contact@example.com';
    
    // SEC fair access policy allows max 10 requests per second
    this.maxRequestsPerSecond = options.maxRequestsPerSecond || 
      parseInt(process.env.SEC_MAX_REQUESTS_PER_SECOND || '10', 10);

    // Create axios client with proper headers
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 seconds timeout
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      }
    });

    // Initialize rate limiter
    this.limiter = new Bottleneck({
      maxConcurrent: 5, // Maximum concurrent requests
      minTime: 1000 / this.maxRequestsPerSecond, // Minimum time between requests
      highWater: 20, // Maximum size of queue
      strategy: Bottleneck.strategy.LEAK, // If queue is full, drop oldest requests
    });

    // Log failed requests
    this.limiter.on('failed', async (error, jobInfo) => {
      console.warn(`SEC API request attempt ${jobInfo.retryCount} failed:`, error);
      
      // Implement exponential backoff
      const delay = Math.min(
        1000 * Math.pow(2, jobInfo.retryCount),
        30000 // Max 30 seconds delay
      );
      
      console.log(`Retrying in ${delay}ms`);
      return delay;
    });
  }

  /**
   * Get company data by CIK (Central Index Key)
   * @param cik CIK number (with or without leading zeros)
   * @returns Company data from SEC
   */
  async getCompanyData(cik: string): Promise<SECCompanyData> {
    // Ensure CIK is padded to 10 digits as required by the API
    const formattedCik = this.formatCik(cik);
    
    return this.executeRequest<SECCompanyData>({
      method: 'GET',
      url: `/submissions/CIK${formattedCik}.json`
    });
  }

  /**
   * Execute an API request with rate limiting and retries
   */
  private async executeRequest<T>(
    config: AxiosRequestConfig, 
    options: { retry?: boolean; maxRetries?: number } = {}
  ): Promise<T> {
    const shouldRetry = options.retry !== false;
    const maxRetries = options.maxRetries || 3;

    // Wrap the axios request with rate limiting
    return this.limiter.schedule(async () => {
      try {
        console.log(`Requesting ${config.url}`);
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
          } else if (axiosError.response.status === 404) {
            secError = new SECEdgarError(
              `SEC API resource not found: ${config.url}`,
              SECErrorCode.NOT_FOUND,
              404
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

        console.error(`SEC API error: ${secError.message}`);

        // If we shouldn't retry or have exceeded max retries, rethrow
        if (!shouldRetry || maxRetries <= 0) {
          throw secError;
        }

        // Otherwise, throw to trigger bottleneck retry
        throw secError;
      }
    }, { 
      // Bottleneck retry options
      retries: shouldRetry ? maxRetries : 0,
      expiration: 60000 // Give up after 60 seconds
    });
  }

  /**
   * Format a CIK number to the 10-digit format required by the SEC API
   * @param cik CIK number (with or without leading zeros)
   * @returns 10-digit CIK with leading zeros
   */
  private formatCik(cik: string): string {
    // Remove any non-numeric characters
    const numericCik = cik.replace(/\D/g, '');
    
    // Pad with leading zeros to 10 digits
    return numericCik.padStart(10, '0');
  }
} 