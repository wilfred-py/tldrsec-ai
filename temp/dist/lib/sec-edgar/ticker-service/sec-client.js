"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECDataClient = void 0;
const axios_1 = __importDefault(require("axios"));
const bottleneck_1 = __importDefault(require("bottleneck"));
const types_1 = require("../types");
/**
 * Client for accessing SEC API data endpoints, with rate limiting and proper headers
 */
class SECDataClient {
    constructor(options = {}) {
        this.baseUrl = 'https://data.sec.gov';
        // SEC requires a legitimate user agent with contact information
        this.userAgent = options.userAgent ||
            process.env.SEC_USER_AGENT ||
            'TLDRSEC-AI-App contact@example.com';
        // SEC fair access policy allows max 10 requests per second
        this.maxRequestsPerSecond = options.maxRequestsPerSecond ||
            parseInt(process.env.SEC_MAX_REQUESTS_PER_SECOND || '10', 10);
        // Create axios client with proper headers
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000, // 30 seconds timeout
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
            }
        });
        // Initialize rate limiter
        this.limiter = new bottleneck_1.default({
            maxConcurrent: 5, // Maximum concurrent requests
            minTime: 1000 / this.maxRequestsPerSecond, // Minimum time between requests
            highWater: 20, // Maximum size of queue
            strategy: bottleneck_1.default.strategy.LEAK, // If queue is full, drop oldest requests
        });
        // Log failed requests
        this.limiter.on('failed', async (error, jobInfo) => {
            console.warn(`SEC API request attempt ${jobInfo.retryCount} failed:`, error);
            // Implement exponential backoff
            const delay = Math.min(1000 * Math.pow(2, jobInfo.retryCount), 30000 // Max 30 seconds delay
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
    async getCompanyData(cik) {
        // Ensure CIK is padded to 10 digits as required by the API
        const formattedCik = this.formatCik(cik);
        return this.executeRequest({
            method: 'GET',
            url: `/submissions/CIK${formattedCik}.json`
        });
    }
    /**
     * Execute an API request with rate limiting and retries
     */
    async executeRequest(config, options = {}) {
        const shouldRetry = options.retry !== false;
        const maxRetries = options.maxRetries || 3;
        // Wrap the axios request with rate limiting
        return this.limiter.schedule(async () => {
            try {
                console.log(`Requesting ${config.url}`);
                const response = await this.client.request(config);
                return response.data;
            }
            catch (error) {
                const axiosError = error;
                let secError;
                if (axiosError.response) {
                    // Server responded with error status
                    if (axiosError.response.status === 429) {
                        secError = new types_1.SECEdgarError('SEC API rate limit exceeded', types_1.SECErrorCode.RATE_LIMIT_EXCEEDED, 429);
                    }
                    else if (axiosError.response.status === 404) {
                        secError = new types_1.SECEdgarError(`SEC API resource not found: ${config.url}`, types_1.SECErrorCode.NOT_FOUND, 404);
                    }
                    else {
                        secError = new types_1.SECEdgarError(`SEC API error: ${axiosError.response.status} ${axiosError.response.statusText}`, types_1.SECErrorCode.UNKNOWN_ERROR, axiosError.response.status);
                    }
                }
                else if (axiosError.request) {
                    // Request was made but no response received (timeout)
                    secError = new types_1.SECEdgarError('SEC API timeout or no response', types_1.SECErrorCode.TIMEOUT);
                }
                else {
                    // Error in setting up the request
                    secError = new types_1.SECEdgarError(`Error setting up SEC API request: ${axiosError.message}`, types_1.SECErrorCode.NETWORK_ERROR);
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
    formatCik(cik) {
        // Remove any non-numeric characters
        const numericCik = cik.replace(/\D/g, '');
        // Pad with leading zeros to 10 digits
        return numericCik.padStart(10, '0');
    }
}
exports.SECDataClient = SECDataClient;
