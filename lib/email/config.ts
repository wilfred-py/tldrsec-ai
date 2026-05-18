/**
 * Resend email service configuration
 */
import type { ResendConfig } from './types';

/**
 * Founder reply-to address. Single source of truth — referenced from:
 *   - resendConfig.defaultReplyTo fallback
 *   - lib/email/welcome-service.ts (explicit override on welcome emails)
 *   - app/api/admin/campaign/send/route.ts (reply_to on every batch send)
 */
export const FOUNDER_REPLY_TO = 'wilf@tldrsec.app';

/**
 * Loads and validates required environment variables
 * @param key The environment variable key
 * @param defaultValue Optional default value
 * @returns The value or default
 */
function getEnvVar(key: string, defaultValue?: string): string {
  // In test environment, provide mock values for safe testing
  if (process.env.NODE_ENV === 'test' && key === 'RESEND_API_KEY') {
    return 're_test_123456789';
  }
  
  const value = process.env[key];
  
  if (!value && defaultValue === undefined) {
    // Only warn about missing value in development and production
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`Warning: Environment variable ${key} is not set.`);
    }
    return '';
  }
  
  return value || defaultValue || '';
}

/**
 * Resend API configuration
 */
export const resendConfig: ResendConfig = {
  apiKey: getEnvVar('RESEND_API_KEY', ''),
  defaultFrom: getEnvVar('EMAIL_DEFAULT_FROM', 'tldrSEC <notifications@tldrsec.app>'),
  // Reply-to defaults to the founder address so replies land in a real inbox.
  // Override via EMAIL_DEFAULT_REPLY_TO env var (e.g. for staging or transactional
  // categories that shouldn't accept replies).
  defaultReplyTo: getEnvVar('EMAIL_DEFAULT_REPLY_TO', FOUNDER_REPLY_TO),
  timeout: parseInt(getEnvVar('EMAIL_TIMEOUT_MS', '30000'), 10),
  retryAttempts: parseInt(getEnvVar('EMAIL_RETRY_ATTEMPTS', '3'), 10),
  maxConcurrentRequests: parseInt(getEnvVar('EMAIL_MAX_CONCURRENT', '10'), 10),
  maxRequestsPerSecond: parseInt(getEnvVar('EMAIL_MAX_REQUESTS_PER_SECOND', '10'), 10),
}; 