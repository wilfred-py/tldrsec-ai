import { Resend, CreateEmailOptions } from 'resend';

// Default values for rate limiting
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

// Email interface
export interface EmailMessage {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
  }>;
}

// Response interface
export interface EmailResponse {
  id?: string;
  error?: string;
  success: boolean;
}

// Error normalization
function normalizeError(error: unknown): string {
  if (error?.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error sending email';
}

export class ResendClient {
  private client: Resend;
  private defaultFrom: string;
  private maxRetries: number;
  private retryDelayMs: number;
  private verifiedDomain: string;

  constructor(
    apiKey?: string,
    defaultFrom?: string,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  ) {
    // Use environment variable if apiKey not provided
    this.client = new Resend(apiKey || process.env.RESEND_API_KEY);
    
    // Set default from address - using verified domain tldrsec.app
    this.defaultFrom = defaultFrom || process.env.EMAIL_FROM || 'notifications@tldrsec.app';
    
    // Extract domain from default from address
    this.verifiedDomain = this.defaultFrom.split('@')[1];
    
    // Set rate limiting parameters
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
  }

  /**
   * Send an email with retry logic for rate limiting
   */
  async sendEmail(message: EmailMessage): Promise<EmailResponse> {
    // Validate message
    if (!message.to) {
      return { success: false, error: 'Recipient email is required' };
    }
    
    if (!message.subject) {
      return { success: false, error: 'Email subject is required' };
    }
    
    if (!message.html) {
      return { success: false, error: 'Email content is required' };
    }
    
    // Ensure from address uses verified domain
    const from = message.from || this.defaultFrom;
    if (!from.endsWith(`@${this.verifiedDomain}`)) {
      console.warn(`Warning: From address ${from} doesn't use verified domain ${this.verifiedDomain}. Using default.`);
      message.from = this.defaultFrom;
    }
    
    // Initialize retry counter
    let retries = 0;
    
    // Retry loop
    while (retries <= this.maxRetries) {
      try {
        const result = await this.client.emails.send({
          from: message.from || this.defaultFrom,
          to: message.to,
          subject: message.subject,
          html: message.html,
          cc: message.cc,
          bcc: message.bcc,
          replyTo: message.replyTo,
          attachments: message.attachments,
        } as CreateEmailOptions);
        
        return { id: (result as { id: string }).id, success: true };
      } catch (error: unknown) {
        // Check if we should retry (rate limit or temporary error)
        const errorMessage = normalizeError(error);
        const isRateLimit = errorMessage.includes('rate limit') || 
                           errorMessage.includes('too many requests');
        const isTemporary = errorMessage.includes('timeout') || 
                           errorMessage.includes('temporary');
        
        // If we should retry and haven't exceeded max retries
        if ((isRateLimit || isTemporary) && retries < this.maxRetries) {
          retries++;
          console.log(`Email send attempt ${retries} failed. Retrying in ${this.retryDelayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
          // Exponential backoff
          this.retryDelayMs *= 2;
          continue;
        }
        
        // Otherwise return the error
        return { 
          success: false, 
          error: normalizeError(error)
        };
      }
    }
    
    // If we've exhausted retries
    return { 
      success: false, 
      error: `Failed to send email after ${this.maxRetries} retries`
    };
  }
}
