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
  FILING_NOTIFICATION = 'filing-notification',
  QUARTERLY_EARNINGS = 'quarterly-earnings',
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
  tags?: string[] | Array<{name: string; value?: string}>; // Support both string[] and object format
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
  ticker?: string; // Alternative to symbol
  filingType: string;
  filingDate: string;
  filingUrl: string;
  url?: string; // Alternative to filingUrl
  summaryUrl?: string; // URL to view summary
  summaryText?: string; // Additional summary text
  summaryData?: {
    // Common fields for 10-K/10-Q
    period?: string;
    financials?: Array<{
      label: string;
      value: string;
      growth?: string;
    }>;
    insights?: string[];

    // Common fields for 8-K
    eventType?: string;
    summary?: string;
    sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed' | string;
    keyHighlights?: string[];
    financialImpact?: string;
    managementCommentary?: string;
    forwardGuidance?: string;
    positiveHighlights?: string;
    negativeHighlights?: string;
    itemNumbers?: string[];

    // Form 4 specific
    filerName?: string;
    relationship?: string;
    percentageChange?: string;
    newStake?: string;

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
    transactionDate?: string;
    securityType?: string;
    shareAmount?: string;
    amount?: string;
    priceRange?: string;
    price?: string;
    totalValue?: string;
    broker?: string;
    tradingPlan?: string;
    percentOwnership?: string;
    transactionType?: string;
    sharesOwned?: string;
    sharesSold?: string;
    sharesRemaining?: string;
    percentOwnershipAfter?: string;
    plannedSaleNote?: string;
    tradingPlanNote?: string;
    transactionContext?: string;
    transparencyNote?: string;

    // Form DEF 14A specific
    meetingDate?: string;
    meetingLocation?: string;
    boardIndependence?: string;
    boardDiversity?: string;
    committeeChanges?: string;
    termLimits?: string;
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
    timeline?: string;
    marketImpact?: string;
    investmentContext?: string;

    // General summary data fields
    changeDirection?: 'increase' | 'decrease';
    changeAmount?: string;
    changePercent?: string;
    footnote?: string;
  };
} 