import { NotificationPreference } from '@/lib/email/notification-service';

/**
 * Notification preferences for what types of filings to receive
 */
export interface FilingTypePreferences {
  /** Annual Reports (10-K) */
  form10K: boolean;
  /** Quarterly Reports (10-Q) */
  form10Q: boolean;
  /** Material Events (8-K) */
  form8K: boolean;
  /** Insider Trading (Form 4) */
  form4: boolean;
  /** Other filing types */
  otherFilings: boolean;
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
    form10K: true,
    form10Q: true,
    form8K: true,
    form4: true,
    otherFilings: true
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