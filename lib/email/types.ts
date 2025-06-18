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
  FORM4 = 'form4',
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
  tags?: Array<{name: string; value?: string}>;
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

/**
 * Filing template data structure
 */
export interface FilingTemplateData {
  companyName: string;
  symbol: string;
  filingType: string;
  filingDate: string;
  filingUrl: string;
  summaryData?: {
    // Form 11-K specific
    planName?: string;
    planYear?: string;
    totalParticipants?: number;
    activeParticipants?: number;
    participationRate?: string;
    averageAccountBalance?: number;
    companyMatch?: number;
    newInvestmentOptions?: string;
    planExpenses?: string;
    planAssets?: Array<{
      category: string;
      value2023: number;
      value2022: number;
      change: number;
    }>;
    totalPlanAssets?: number;
    totalPlanAssets2022?: number;
    totalPlanAssetsChange?: number;
    investmentOptions?: Array<{
      name: string;
      return: number;
      assets: number;
    }>;

    // Form 144 specific
    reportingPerson?: string;
    position?: string;
    saleDate?: string;

    // Form DEF 14A specific
    meetingDate?: string;
    meetingLocation?: string;
    boardChanges?: Array<{
      name: string;
      role: string;
      change: string;
    }>;
    proposalSummaries?: Array<{
      title: string;
      description: string;
      boardRecommendation: string;
    }>;

    // Schedule 13D specific
    acquisitionDate?: string;
    purpose?: string;
    sharesBeneficiallyOwned?: number;
    ownershipPercentage?: number;
    soleVotingPower?: number;
    soleDispositivePower?: number;
    aggregatePurchasePrice?: string;
    pricePerShare?: string;
    investmentValue?: number;
  };
} 