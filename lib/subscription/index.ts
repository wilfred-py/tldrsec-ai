/**
 * Subscription services for tldrsec-ai
 * 
 * This module provides services for managing user subscriptions and 
 * ticker-based subscription information for filing processing prioritization.
 */

export {
  getTickerSubscriptionInfo,
  getBatchTickerSubscriptionInfo,
  getFilingPriority,
  estimateTokenUsage,
  type TickerSubscriptionInfo
} from './tickerSubscriptionInfo';

// Re-export existing subscription service for convenience
export {
  getUserSubscription,
  canProcessFiling,
  getOptimizationLevelForUser,
  recordFilingUsage,
  getSubscriptionTierInfo,
  hasFeatureAccess,
  updateUserSubscription,
  getSubscriptionAnalytics,
  formatSubscriptionInfo,
  SUBSCRIPTION_FEATURES,
  type UserSubscription
} from '../../services/filings/enhanced/subscriptionService';