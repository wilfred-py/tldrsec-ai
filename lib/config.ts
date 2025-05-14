/**
 * Application configuration
 */

export const config = {
  // App info
  appName: 'tldrSEC',
  appDescription: 'AI-Powered SEC Filing Summaries',
  
  // API endpoints
  api: {
    sec: {
      baseUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
      filingFeedsUrl: 'https://www.sec.gov/Archives/edgar/daily-index',
    }
  },
  
  // Feature flags
  features: {
    emailNotifications: true,
    dailyDigest: true,
    realTimeAlerts: true,
  },
  
  // Default pagination
  pagination: {
    defaultLimit: 10,
    maxLimit: 100,
  }
} 