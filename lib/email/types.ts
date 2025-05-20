/**
 * Email service type definitions
 */

/**
 * Configuration for the Resend email client
 */
export interface ResendConfig {
  apiKey: string;
  defaultFrom: string;
  defaultReplyTo?: string;
  timeout: number;
  retryAttempts: number;
  maxConcurrentRequests: number;
  maxRequestsPerSecond: number;
}

/**
 * Types of email notifications supported
 */
export enum EmailType {
  IMMEDIATE = 'immediate',
  DIGEST = 'digest',
  ALERT = 'alert',
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password-reset',
  VERIFICATION = 'verification',
}

/**
 * Basic email recipient
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Base email message structure
 */
export interface EmailMessage {
  from?: string;
  to: string | string[] | EmailRecipient | EmailRecipient[];
  subject: string;
  replyTo?: string;
  cc?: string | string[] | EmailRecipient | EmailRecipient[];
  bcc?: string | string[] | EmailRecipient | EmailRecipient[];
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  tags?: string[];
}

/**
 * Successful email send response
 */
export interface EmailSendSuccess {
  id: string;
  to: string | string[];
  success: true;
}

/**
 * Failed email send response
 */
export interface EmailSendFailure {
  to: string | string[];
  success: false;
  error: {
    message: string;
    code: string;
  };
}

/**
 * Combined email send response type
 */
export type EmailSendResult = EmailSendSuccess | EmailSendFailure;

/**
 * Email service usage statistics
 */
export interface EmailUsage {
  totalSent: number;
  totalFailed: number;
  lastReset: Date;
}

/**
 * Email verification response
 */
export interface EmailVerificationResult {
  email: string;
  isValid: boolean;
  reason?: string;
  suggestions?: string[];
} 