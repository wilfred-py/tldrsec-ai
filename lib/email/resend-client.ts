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
import { monitoring } from '../monitoring';
import { resendConfig } from './config';
import type { 
  EmailMessage, 
  EmailSendResult, 
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
}

/**
 * Options for sending an email
 */
export interface SendEmailOptions {
  requestId?: string;
  timeout?: number;
  tags?: string[];
  retryConfig?: Partial<RetryConfig>;
}

/**
 * Resend email client with advanced error handling, retries, and monitoring
 */
export class ResendClient {
  private resend: Resend | null = null;
  private limiter: Bottleneck;
  private totalSent: number;
  private totalFailed: number;
  private lastResetTime: Date;
  private serviceName = 'resend-email';
  private isDummyClient = false;

  /**
   * Create a new ResendClient instance
   * @param apiKey Optional API key (defaults to environment variable)
   */
  constructor(apiKey?: string) {
    const key = apiKey || resendConfig.apiKey;
    
    // Handle missing API key
    if (!key) {
      // In development or test, create a dummy client that logs but doesn't send
      if (process.env.NODE_ENV !== 'production') {
        this.isDummyClient = true;
        logger.warn('No Resend API key provided. Using dummy client that will not send emails.');
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
    
    // Start monitoring timing
    const startTime = Date.now();
    // Temporarily comment out the monitoring calls that are causing issues
    // monitoring.startTimer('email.send');
    
    // Validate the message has required fields
    this.validateEmailMessage(message);
    
    // Prepare email parameters - ensure we have from address
    const emailParams = this.prepareEmailParams(message);
    
    logger.info(`Sending email to ${Array.isArray(message.to) ? message.to.length + ' recipients' : message.to}`, {
      subject: message.subject,
      requestId
    });
    
    // If we're using a dummy client in non-production, log and return success without sending
    if (this.isDummyClient) {
      logger.info(`[DUMMY] Would send email to ${Array.isArray(message.to) ? message.to : [message.to]}`, {
        subject: message.subject,
        html: message.html?.substring(0, 100) + '...',
        text: message.text?.substring(0, 100) + '...',
        requestId
      });
      
      // Return a dummy successful result
      return {
        id: `dummy_${requestId}`,
        to: emailParams.to,
        success: true
      };
    }
    
    try {
      // If we have no client at all, throw a meaningful error
      if (!this.resend) {
        throw createExternalApiError(
          'Resend client not initialized. Missing API key.',
          { code: ResendErrorCode.MISSING_API_KEY },
          false,
          requestId
        );
      }
      
      // Configure retry behavior
      const retryConfig: RetryConfig = {
        ...DefaultRetryConfig,
        ...options.retryConfig,
        maxRetries: options.retryConfig?.maxRetries || resendConfig.retryAttempts,
        onRetry: (error, attempt, delay) => {
          logger.warn(`Retry attempt ${attempt} for Resend API after ${delay}ms delay`, {
            error: error.message,
            attempt,
            delay,
            requestId
          });
          
          monitoring.incrementCounter('email.retry', 1);
        }
      };
      
      // Configure circuit breaker
      const circuitBreakerConfig: CircuitBreakerConfig = {
        ...DefaultCircuitBreakerConfig
      };
      
      // Use the retry system with circuit breaker
      const result = await this.limiter.schedule(() => 
        executeWithRetry(
          async () => {
            // Use standard AbortController for fetch API
            const fetchController = new AbortController();
            // Setup abort forwarding from our TimeoutAbortController
            abortController.signal.addEventListener('abort', () => {
              fetchController.abort(abortController.signal.reason);
            });
            
            // This check was already added above but ensuring it's here for safety
            if (!this.resend) {
              throw createExternalApiError(
                'Resend client not initialized. Missing API key.',
                { code: ResendErrorCode.MISSING_API_KEY },
                false,
                requestId
              );
            }
            
            const response = await this.resend.emails.send({
              from: emailParams.from,
              to: emailParams.to,
              subject: emailParams.subject,
              html: emailParams.html,
              text: emailParams.text,
              replyTo: emailParams.reply_to,
              cc: emailParams.cc,
              bcc: emailParams.bcc,
              attachments: emailParams.attachments,
              tags: emailParams.tags
            });
            
            if (!response.data || !response.data.id) {
              throw createExternalApiError('Failed to send email: No ID returned', {
                response
              }, true, requestId);
            }
            
            return response;
          },
          this.serviceName,
          retryConfig,
          circuitBreakerConfig
        )
      );
      
      // Record timing metrics
      // monitoring.stopTimer('email.send');
      // monitoring.recordValue('email.send.duration', Date.now() - startTime, {
      //   success: 'true'
      // });
      
      // Increment success counter
      this.totalSent++;
      // monitoring.incrementCounter('email.sent', 1);
      
      // Return success result
      return {
        id: result.data!.id,
        to: emailParams.to,
        success: true
      };
    } catch (error) {
      // Record timing metrics for failure
      // monitoring.stopTimer('email.send');
      // monitoring.recordValue('email.send.duration', Date.now() - startTime, {
      //   success: 'false',
      //   error: error instanceof Error ? error.message : 'Unknown error'
      // });
      
      // Increment failure counter
      this.totalFailed++;
      // monitoring.incrementCounter('email.failed', 1);
      
      // Normalize and log error
      const normalizedError = this.normalizeError(error, requestId);
      logger.error(`Failed to send email: ${normalizedError.message}`, normalizedError, {
        subject: message.subject,
        to: emailParams.to,
        requestId
      });
      
      // Return failure result
      return {
        to: emailParams.to,
        success: false,
        error: {
          message: normalizedError.message,
          code: normalizedError.code
        }
      };
    } finally {
      // Clean up the timeout to prevent memory leaks and test hanging
      abortController.clearTimeout();
    }
  }
  
  /**
   * Validates that an email message has the required fields
   * @param message The email message to validate
   * @throws ApiError if message is invalid
   */
  private validateEmailMessage(message: EmailMessage): void {
    if (!message.to) {
      throw createExternalApiError(
        'Missing recipient in email message',
        { code: ResendErrorCode.MISSING_TO }
      );
    }
    
    if (!message.subject) {
      throw createExternalApiError(
        'Missing subject in email message', 
        { code: ResendErrorCode.INVALID_PAYLOAD }
      );
    }
    
    if (!message.html && !message.text) {
      throw createExternalApiError(
        'Email must contain either HTML or text content',
        { code: ResendErrorCode.INVALID_PAYLOAD }
      );
    }
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
    
    // Format tags as objects with name and value properties as required by Resend API
    // Sanitize tag names to only contain ASCII letters, numbers, underscores, or dashes
    if (message.tags) {
      params.tags = message.tags.map(tag => ({
        name: tag.replace(/[^a-zA-Z0-9_-]/g, '_'),
        value: 'true'
      }));
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
    
    // If array of strings, return as is
    if (Array.isArray(recipients) && typeof recipients[0] === 'string') {
      return recipients as string[];
    }
    
    // If single EmailRecipient
    if (!Array.isArray(recipients) && (recipients as EmailRecipient).email) {
      const recipient = recipients as EmailRecipient;
      return recipient.name 
        ? `${recipient.name} <${recipient.email}>`
        : recipient.email;
    }
    
    // If array of EmailRecipient
    if (Array.isArray(recipients)) {
      return (recipients as EmailRecipient[]).map(r => 
        r.name ? `${r.name} <${r.email}>` : r.email
      );
    }
    
    // Fallback to string representation
    return String(recipients);
  }
  
  /**
   * Normalize errors from the Resend API into ApiError format
   * @param error Original error from Resend
   * @param requestId Optional request ID for tracking
   * @returns Normalized ApiError
   */
  private normalizeError(error: any, requestId?: string): ApiError {
    // If it's already an ApiError, just return it
    if (error instanceof ApiError) {
      return error;
    }
    
    // Handle timeout errors
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return createTimeoutError(
        'Email sending timed out',
        { originalError: error },
        requestId
      );
    }
    
    // Handle Resend API errors
    if (error.statusCode && error.name === 'ResendError') {
      const details = {
        statusCode: error.statusCode,
        body: error.body,
        originalError: error
      };
      
      // Map to specific error types
      switch (error.code) {
        case ResendErrorCode.RATE_LIMIT_EXCEEDED:
          return createExternalApiError(
            'Rate limit exceeded for Resend API',
            details,
            true, // retryable
            requestId
          );
        
        case ResendErrorCode.INVALID_API_KEY:
        case ResendErrorCode.MISSING_API_KEY:
          return createExternalApiError(
            'Invalid or missing API key for Resend',
            details,
            false, // not retryable
            requestId
          );
        
        case ResendErrorCode.DOMAIN_NOT_VERIFIED:
          // Extract domain from error message if possible
          const domainMatch = error.message?.match(/The ([\w.-]+) domain is not verified/);
          const domain = domainMatch ? domainMatch[1] : 'your email domain';
          
          return createExternalApiError(
            `The domain ${domain} is not verified in Resend. Please verify it at https://resend.com/domains`,
            details,
            false, // not retryable
            requestId
          );
        
        case ResendErrorCode.SENDER_NOT_AUTHORIZED:
          return createExternalApiError(
            'Not authorized to send from this email address',
            details,
            false, // not retryable
            requestId
          );
        
        default:
          return createExternalApiError(
            `Resend API error: ${error.message || 'Unknown error'}`,
            details,
            true, // generically retryable
            requestId
          );
      }
    }
    
    // Generic error case
    return createExternalApiError(
      `Email sending failed: ${error.message || 'Unknown error'}`,
      { originalError: error },
      true, // generic errors are retryable
      requestId
    );
  }
  
  /**
   * Get current usage statistics
   * @returns Email usage statistics
   */
  getUsage(): EmailUsage {
    return {
      totalSent: this.totalSent,
      totalFailed: this.totalFailed,
      lastReset: new Date(this.lastResetTime)
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
}

// Export singleton instance with default configuration
export const resendClient = new ResendClient(); 