/**
 * Resend API client implementation with advanced error handling, retry logic, and monitoring
 */
import { Resend } from 'resend';
import { v4 as uuidv4 } from 'uuid';
import Bottleneck from 'bottleneck';
import { 
  ApiError, 
  ErrorCode, 
  createExternalApiError,
  createTimeoutError
} from '../error-handling';
import { 
  executeWithRetry, 
  RetryConfig, 
  DefaultRetryConfig,
  CircuitBreakerConfig,
  DefaultCircuitBreakerConfig,
  TimeoutAbortController
} from '../error-handling/retry';
import { logger } from '../logging';
// Import monitoring module
import { monitoring } from '../monitoring';

// Define a safe version of recordEmailSent that handles missing function
const safeRecordEmailSent = (emailType: string, recipient: string, success: boolean, tags: Record<string, string> = {}): void => {
  try {
    if (typeof monitoring.recordEmailSent === 'function') {
      monitoring.recordEmailSent(emailType, recipient, success, tags);
    }
  } catch (error) {
    logger.warn('Failed to record email metrics', { error });
  }
};

import { resendConfig } from './config';
import type { 
  EmailMessage, 
  EmailSendResult, 
  EmailSendSuccess,
  EmailSendFailure,
  EmailUsage,
  EmailRecipient,
  EmailAttachment,
  EmailVerificationResult
} from './types';

/**
 * Error codes specific to the Resend API
 */
export enum ResendErrorCode {
  INVALID_API_KEY = 'invalid_api_key',
  MISSING_API_KEY = 'missing_api_key',
  INVALID_EMAIL = 'invalid_email',
  MISSING_FROM = 'missing_from',
  MISSING_TO = 'missing_to',
  INVALID_PAYLOAD = 'invalid_payload',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  DOMAIN_NOT_VERIFIED = 'domain_not_verified',
  EMAIL_SENDING_FAILED = 'email_sending_failed',
  SENDER_NOT_AUTHORIZED = 'sender_not_authorized',
  VALIDATION_ERROR = 'validation_error',
}

/**
 * Options for sending an email
 */
export interface SendEmailOptions {
  /** Request ID for tracking */
  requestId?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
}

/**
 * Resend API client with advanced error handling, retry logic, and monitoring
 */
export class ResendClient {
  /** Resend API client instance */
  private resend: Resend;
  /** Rate limiter for API calls */
  private limiter: Bottleneck;
  /** Whether this is a dummy client (no API key) */
  private isDummyClient: boolean = false;
  /** Total emails sent since last reset */
  private totalSent: number = 0;
  /** Total emails failed since last reset */
  private totalFailed: number = 0;
  /** Last time metrics were reset */
  private lastResetTime: Date;
  
  /**
   * Create a new Resend API client
   * @param key Optional API key (will use environment variable if not provided)
   */
  constructor(key?: string) {
    // Get API key from environment if not provided
    key = key || process.env.RESEND_API_KEY;
    
    // If no API key is provided, create a dummy client
    if (!key) {
      // In development or test, create a dummy client that logs but doesn't send
      if (process.env.NODE_ENV !== 'production') {
        this.isDummyClient = true;
        logger.warn('No Resend API key provided. Using dummy client that will not send emails.');
        // Initialize with empty string for dummy client
        this.resend = new Resend('');
      } else {
        // In production, still create the client but log a warning
        logger.error('No Resend API key provided in production. Set RESEND_API_KEY in your environment variables.');
        // We'll initialize with an empty string which will cause API calls to fail gracefully
        this.resend = new Resend('');
      }
    } else {
      // Initialize with valid API key
      this.resend = new Resend(key);
    }
    
    // Initialize rate limiter
    this.limiter = new Bottleneck({
      maxConcurrent: resendConfig.maxConcurrentRequests,
      minTime: 1000 / resendConfig.maxRequestsPerSecond, // Distribute requests evenly
    });
    
    // Initialize tracking
    this.totalSent = 0;
    this.totalFailed = 0;
    this.lastResetTime = new Date();
  }
  
  /**
   * Send an email using the Resend API
   * @param message The email message to send
   * @param options Optional sending options
   * @returns Email send result
   */
  async sendEmail(message: EmailMessage, options: SendEmailOptions = {}): Promise<EmailSendResult> {
    const requestId = options.requestId || uuidv4();
    const abortController = new TimeoutAbortController();
    const timeout = options.timeout || resendConfig.timeout;
    
    // Set timeout if specified
    if (timeout) {
      abortController.setTimeout(timeout);
    }
    
    // Prepare email parameters
    const emailParams = this.prepareEmailParams(message);
    
    // Track start time for metrics
    const startTime = Date.now();
    
    try {
      // If this is a dummy client, just log and return a fake success
      if (this.isDummyClient) {
        logger.info(`[DUMMY] Would send email to ${emailParams.to}`, {
          subject: message.subject,
          requestId
        });
        
        // Simulate a delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Return a fake success response
        return {
          id: `dummy-${uuidv4()}`,
          to: Array.isArray(emailParams.to) ? emailParams.to : [emailParams.to],
          success: true
        };
      }
      
      // Use the rate limiter to control request rate
      return await this.limiter.schedule(async () => {
        // Use retry logic for resilience
        return await executeWithRetry(
          async () => {
            // Clone the email params to avoid modifying the original
            const emailOptions = { ...emailParams };
            
            // Add detailed logging of the exact request body for diagnosing validation errors
            if (emailOptions.tags) {
              logger.debug('Tags being sent to Resend API:', {
                tags: emailOptions.tags,
                tagsType: typeof emailOptions.tags,
                isArray: Array.isArray(emailOptions.tags),
                tagsSample: Array.isArray(emailOptions.tags) ? emailOptions.tags.slice(0, 3).map(tag => ({ value: tag, type: typeof tag })) : null,
                requestId
              });
            }
            
            // Log the stringified JSON to see exactly what's being sent
            try {
              const jsonBody = JSON.stringify(emailOptions);
              logger.debug(`Request body JSON: ${jsonBody}`, { requestId });
            } catch (jsonError) {
              logger.error(`Error stringifying request body: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`, { requestId });
            }
            
            try {
              // Log the request
              logger.debug('Sending email with options:', { 
                ...emailOptions,
                html: emailOptions.html ? '(HTML content)' : undefined,
                text: emailOptions.text ? '(Text content)' : undefined,
                requestId
              });
              
              // Type assertion to handle potential type mismatch with Resend API
              const response = await this.resend.emails.send(emailOptions as any);
              
              // Log the raw response for debugging
              logger.debug('Resend API response:', { response, requestId });
              
              // More robust response handling
              if (!response) {
                throw createExternalApiError('Failed to send email: Empty response from Resend API', {
                  response
                }, true, requestId);
              }
              
              // Handle case where response exists but doesn't have expected structure
              if (!response.data || !response.data.id) {
                // If we have an error in the response, use that
                if (response.error) {
                  throw createExternalApiError(`Failed to send email: ${response.error.message || 'Unknown error'}`, {
                    response,
                    errorCode: response.error.message ? response.error.message : 'unknown'
                  }, true, requestId);
                }
                
                // Otherwise, generic error
                throw createExternalApiError('Failed to send email: No ID returned', {
                  response
                }, true, requestId);
              }
              
              // Track successful send
              this.totalSent++;
              
              // Record email sent metric with correct signature
              safeRecordEmailSent(
                'email_send',
                Array.isArray(emailParams.to) ? emailParams.to[0] : emailParams.to,
                true,
                { duration: `${Date.now() - startTime}`, subject: emailParams.subject || '' }
              );
              
              // Return success result
              return {
                id: response.data.id,
                to: Array.isArray(emailParams.to) ? emailParams.to : [emailParams.to],
                success: true
              };
            } catch (err) {
              // Handle API errors
              if (err instanceof ApiError) {
                throw err;
              }
              
              // Convert other errors to ApiError
              throw createExternalApiError(`Failed to send email: ${err instanceof Error ? err.message : 'Unknown error'}`, {
                originalError: err
              }, true, requestId);
            }
          },
          'email-service',
          options.retry || DefaultRetryConfig,
          options.circuitBreaker || DefaultCircuitBreakerConfig
        );
      });
    } catch (error) {
      // Track failed send
      this.totalFailed++;
      
      // Record email failure metric with correct signature
      safeRecordEmailSent(
        'email_send',
        Array.isArray(emailParams.to) ? emailParams.to[0] : emailParams.to,
        false,
        { 
          duration: `${Date.now() - startTime}`, 
          subject: emailParams.subject || '',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      // Normalize and log error
      const normalizedError = this.normalizeError(error, requestId);
      logger.error(`Failed to send email: ${normalizedError.message}`, {
        error: normalizedError,
        subject: message.subject,
        to: emailParams.to,
        requestId
      });
      
      // Return failure result
      return {
        to: Array.isArray(emailParams.to) ? emailParams.to : [emailParams.to],
        success: false,
        error: normalizedError
      };
    }
  }
  
  /**
   * Get email usage statistics
   * @returns Email usage statistics
   */
  getUsage(): EmailUsage {
    return {
      totalSent: this.totalSent,
      totalFailed: this.totalFailed,
      lastReset: this.lastResetTime
    };
  }
  
  /**
   * Reset usage statistics
   */
  resetUsage(): void {
    this.totalSent = 0;
    this.totalFailed = 0;
    this.lastResetTime = new Date();
  }
  
  /**
   * Verify an email address
   * @param email Email address to verify
   * @returns Verification result
   */
  async verifyEmail(email: string): Promise<EmailVerificationResult> {
    // TODO: Implement email verification using Resend API
    // This is a placeholder for future implementation
    return {
      email,
      isValid: true,
      reason: undefined
    };
  }
  
  /**
   * Prepares email parameters for sending, ensuring all required fields are present
   * @param message The email message
   * @returns Properly formatted email parameters
   */
  private prepareEmailParams(message: EmailMessage): Record<string, any> {
    const params: Record<string, any> = {
      from: message.from || resendConfig.defaultFrom,
      to: this.formatRecipients(message.to),
      subject: message.subject
    };
    
    // Format reply_to as a string as required by Resend API
    if (message.replyTo) {
      params.reply_to = message.replyTo;
    } else if (resendConfig.defaultReplyTo) {
      params.reply_to = resendConfig.defaultReplyTo;
    }
    
    // Add optional parameters
    if (message.html) params.html = message.html;
    if (message.text) params.text = message.text;
    
    // Format tags according to Resend API requirements
    // Tags must be an array of objects with name and value properties
    // Both name and value can only contain ASCII letters, numbers, underscores, or dashes
    if (message.tags) {
      // Sanitize function to ensure tags only contain valid characters
      const sanitizeTagValue = (value: string): string => {
        // Replace any character that's not a letter, number, underscore, or dash with an underscore
        return value.replace(/[^a-zA-Z0-9_-]/g, '_');
      };
      
      // Ensure we have an array of tags
      const tagsArray = Array.isArray(message.tags) ? message.tags : [message.tags];
      
      // Convert all tags to the required format with name and value properties
      params.tags = tagsArray.map(tag => {
        // If tag is already an object with name and value, sanitize both
        if (tag && typeof tag === 'object' && 'name' in tag && 'value' in tag) {
          return {
            name: sanitizeTagValue(String(tag.name)),
            value: sanitizeTagValue(String(tag.value))
          };
        }
        
        // If tag is an object with only name, use name as value too
        if (tag && typeof tag === 'object' && 'name' in tag) {
          const sanitizedName = sanitizeTagValue(String(tag.name));
          return {
            name: sanitizedName,
            value: sanitizedName
          };
        }
        
        // For string tags or any other type, convert to string and use as both name and value
        const sanitizedTag = sanitizeTagValue(String(tag));
        return {
          name: sanitizedTag,
          value: sanitizedTag
        };
      });
      
      // Log the sanitized tags for debugging
      logger.debug('Sanitized email tags:', { tags: params.tags });
    }
    
    // Add CC and BCC if present
    if (message.cc) params.cc = this.formatRecipients(message.cc);
    if (message.bcc) params.bcc = this.formatRecipients(message.bcc);
    
    // Add attachments if present
    if (message.attachments && message.attachments.length > 0) {
      params.attachments = message.attachments.map(attachment => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      }));
    }
    
    return params;
  }
  
  /**
   * Format recipients into string or array format accepted by Resend
   * @param recipients Recipients in various formats
   * @returns Formatted recipients
   */
  private formatRecipients(
    recipients: string | string[] | EmailRecipient | EmailRecipient[]
  ): string | string[] {
    // If already a string, return it
    if (typeof recipients === 'string') {
      return recipients;
    }
    
    // If array, format each item
    if (Array.isArray(recipients)) {
      return recipients.map(recipient => {
        if (typeof recipient === 'string') {
          return recipient;
        }
        
        // Format email recipient object
        if (recipient.name) {
          return `${recipient.name} <${recipient.email}>`;
        }
        
        return recipient.email;
      });
    }
    
    // Single recipient object
    if (recipients.name) {
      return `${recipients.name} <${recipients.email}>`;
    }
    
    return recipients.email;
  }
  
  /**
   * Normalize error for consistent handling
   * @param error Original error
   * @param requestId Request ID for tracking
   * @returns Normalized API error
   */
  private normalizeError(error: unknown, requestId?: string): ApiError {
    // If already an ApiError, return it
    if (error instanceof ApiError) {
      return error;
    }
    
    // If it's a timeout error, create a timeout error
    if (error instanceof DOMException && error.name === 'AbortError') {
      return createTimeoutError('Email sending timed out', {
        originalError: error
      }, requestId);
    }
    
    // Otherwise create a generic API error
    return createExternalApiError(
      `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error },
      true,
      requestId
    );
  }
}

export default ResendClient;
