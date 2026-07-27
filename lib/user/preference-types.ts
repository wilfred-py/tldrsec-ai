/**
 * Email delivery cadence for [Subscription] notifications. Absorbed from
 * the deleted `lib/email/notification-types.ts` — its sole role was to
 * carry this enum, and the enum's real owner is the user-preferences
 * module that persists it on `User.preferences.notifications.emailFrequency`.
 * The prior location produced an inverted dependency (`lib/user` → `lib/email`)
 * for a value that describes the [Subscription] shape, not email plumbing.
 */
export enum NotificationPreference {
  IMMEDIATE = 'immediate',
  DAILY = 'daily',
  NONE = 'none',
}

/**
 * Notification preferences for annual report filings
 */
export interface AnnualReportFilingPreferences {
  /** Annual Reports (10-K) */
  form10K: boolean;
  /** Annual Report Amendment (10-K/A) */
  form10KA: boolean;
  /** Annual Report for Foreign Issuers (20-F) */
  form20F: boolean;
  /** Annual Report for Canadian Issuers (40-F) */
  form40F: boolean;
  /** Investment Company Annual Report (N-CSR) */
  formNCSR: boolean;
  /** Investment Company Semi-Annual Report (N-CSRS) */
  formNCSRS: boolean;
  /** Transition Reports (NT 10-K) */
  formNT10K: boolean;
}

/**
 * Notification preferences for quarterly report filings
 */
export interface QuarterlyReportFilingPreferences {
  /** Quarterly Reports (10-Q) */
  form10Q: boolean;
  /** Quarterly Report Amendment (10-Q/A) */
  form10QA: boolean;
  /** Foreign Issuer Current Report (6-K) */
  form6K: boolean;
  /** Transition Reports (NT 10-Q) */
  formNT10Q: boolean;
}

/**
 * Notification preferences for current event filings
 */
export interface CurrentEventFilingPreferences {
  /** Material Events (8-K) */
  form8K: boolean;
  /** Material Events Amendment (8-K/A) */
  form8KA: boolean;
}

/**
 * Notification preferences for proxy filings
 */
export interface ProxyFilingPreferences {
  /** Definitive Additional Proxy Materials (DEFA14A) */
  formDEFA14A: boolean;
  /** Definitive Proxy Statement (DEF 14A) */
  formDEF14A: boolean;
  /** Preliminary Proxy Statements (PRE 14A) */
  formPRE14A: boolean;
  /** Information Statements (DEF 14C) */
  formDEF14C: boolean;
}

/**
 * Notification preferences for insider trading filings
 */
export interface InsiderTradingFilingPreferences {
  /** Statement of Changes in Beneficial Ownership (Form 4) */
  form4: boolean;
  /** Initial Statement of Beneficial Ownership (Form 3) */
  form3: boolean;
  /** Annual Statement of Beneficial Ownership (Form 5) */
  form5: boolean;
  /** Notice of Sale of Securities (Form 144) */
  form144: boolean;
}

/**
 * Notification preferences for beneficial ownership filings
 */
export interface BeneficialOwnershipFilingPreferences {
  /** Beneficial Ownership Report (Schedule 13D) */
  formSC13D: boolean;
  /** Amendment to Schedule 13D (SC 13D/A) */
  formSC13DA: boolean;
  /** Short-form Beneficial Ownership Report (Schedule 13G) */
  formSC13G: boolean;
  /** Amendment to Schedule 13G (SC 13G/A) */
  formSC13GA: boolean;
  /** Institutional Investment Manager Holdings Report (13F) */
  form13F: boolean;
}

/**
 * Notification preferences for registration filings
 */
export interface RegistrationFilingPreferences {
  /** Registration Statement (S-1) */
  formS1: boolean;
  /** Simplified Registration Statement (S-3) */
  formS3: boolean;
  /** Registration Statement for Foreign Issuers (F-1) */
  formF1: boolean;
  /** Foreign Issuer Simplified Registration Statement (F-3) */
  formF3: boolean;
  /** Post-Effective Amendment to Registration Statement (POS AM) */
  formPOSAM: boolean;
  /** Prospectus Filing (424B2) */
  form424B2: boolean;
  /** Prospectus Filing (424B3) */
  form424B3: boolean;
  /** Prospectus Filing (424B5) */
  form424B5: boolean;
  /** Free Writing Prospectus (FWP) */
  formFWP: boolean;
}

/**
 * Notification preferences for other filings
 */
export interface OtherFilingPreferences {
  /** Registration Statement for Closed-End Funds (N-2) */
  formN2: boolean;
  /** Money Market Fund Portfolio Holdings (N-MFP) */
  formNMFP: boolean;
  /** Notice of Exempt Offering of Securities (Form D) */
  formD: boolean;
  /** Investment Company Filings (497) */
  form497: boolean;
  /** Specialized Disclosure Report (SD) */
  formSD: boolean;
  /** Annual Report to Shareholders (ARS) */
  formARS: boolean;
}

/**
 * Notification preferences for what types of filings to receive
 */
export interface FilingTypePreferences {
  /** Annual report filings (10-K, 20-F, etc.) */
  annualReports: AnnualReportFilingPreferences;
  /** Quarterly report filings (10-Q, 6-K, etc.) */
  quarterlyReports: QuarterlyReportFilingPreferences;
  /** Current event filings (8-K, etc.) */
  currentEvents: CurrentEventFilingPreferences;
  /** Insider trading filings (Forms 3, 4, 5, 144) */
  insiderTrading: InsiderTradingFilingPreferences;
  /** Beneficial ownership filings (SC 13D, SC 13G, 13F, etc.) */
  beneficialOwnership: BeneficialOwnershipFilingPreferences;
  /** Proxy filings (DEF 14A, PRE 14A, etc.) */
  proxyFilings: ProxyFilingPreferences;
  /** Registration filings (S-1, F-1, etc.) */
  registrationFilings: RegistrationFilingPreferences;
  /** Other filing types not specifically categorized */
  otherFilings: OtherFilingPreferences;
}

/**
 * Notification content preferences
 */
export interface NotificationContentPreferences {
  /** Include AI-generated summary in notifications */
  includeSummary: boolean;
  /** Include filing details in notifications */
  includeFilingDetails: boolean;
  /** Include AI analysis in notifications */
  includeAnalysis: boolean;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  /** Email notification frequency */
  emailFrequency: NotificationPreference;
  /** Filing types to receive */
  filingTypes: FilingTypePreferences;
  /** Content preferences */
  contentPreferences: NotificationContentPreferences;
}

/**
 * User interface preferences
 */
export interface UIPreferences {
  /** Theme preference */
  theme: 'light' | 'dark' | 'system';
  /** Dashboard layout preference */
  dashboardLayout: 'compact' | 'detailed';
}

/**
 * Ticker subscription with notification overrides
 */
export interface TickerSubscription {
  /** Stock symbol */
  symbol: string;
  /** Company name */
  companyName: string;
  /** Whether to override global notification preferences */
  overridePreferences: boolean;
  /** Notification preferences specific to this ticker */
  notificationPreferences?: NotificationPreferences;
}

/**
 * User preferences structure
 */
export interface UserPreferences {
  /** Notification preferences */
  notifications: NotificationPreferences;
  /** UI preferences */
  ui: UIPreferences;
  /** Ticker subscriptions */
  subscriptions?: TickerSubscription[];
}

/**
 * Default notification preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailFrequency: NotificationPreference.IMMEDIATE,
  filingTypes: {
    annualReports: {
      form10K: true,
      form10KA: true,
      form20F: true,
      form40F: true,
      formNCSR: true,
      formNCSRS: true,
      formNT10K: true
    },
    quarterlyReports: {
      form10Q: true,
      form10QA: true,
      form6K: true,
      formNT10Q: true
    },
    currentEvents: {
      form8K: true,
      form8KA: true
    },
    insiderTrading: {
      form4: true,
      form3: true,
      form5: true,
      form144: true
    },
    beneficialOwnership: {
      formSC13D: true,
      formSC13DA: true,
      formSC13G: true,
      formSC13GA: true,
      form13F: true
    },
    proxyFilings: {
      formDEFA14A: true,
      formDEF14A: true,
      formPRE14A: true,
      formDEF14C: true
    },
    registrationFilings: {
      formS1: true,
      formS3: true,
      formF1: true,
      formF3: true,
      formPOSAM: true,
      form424B2: true,
      form424B3: true,
      form424B5: true,
      formFWP: true
    },
    otherFilings: {
      formN2: true,
      formNMFP: true,
      formD: true,
      form497: true,
      formSD: true,
      formARS: true
    }
  },
  contentPreferences: {
    includeSummary: true,
    includeFilingDetails: true,
    includeAnalysis: true
  }
};

/**
 * Default UI preferences
 */
export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  theme: 'system',
  dashboardLayout: 'detailed'
};

/**
 * Default user preferences
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  ui: DEFAULT_UI_PREFERENCES,
  subscriptions: []
};

/**
 * Response format for preference update operations
 */
export interface PreferenceUpdateResponse {
  success: boolean;
  message?: string;
  preferences?: UserPreferences;
  subscriptions?: TickerSubscription[];
}

/**
 * Response format specifically for subscription operations
 */
export interface SubscriptionUpdateResponse {
  success: boolean;
  message?: string;
  subscriptions?: TickerSubscription[];
} 