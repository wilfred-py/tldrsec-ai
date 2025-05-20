/**
 * Email module for sending notifications using Resend
 */

// Import client
import { resendClient } from './resend-client';

// Export types
export * from './types';

// Export core client
export { ResendClient, ResendErrorCode } from './resend-client';
export { resendClient };

// Export config
export { resendConfig } from './config';

/**
 * Main export for convenience - use this to send emails
 * @param message Email message to send
 * @returns Result of the email send operation
 */
export const sendEmail = resendClient.sendEmail.bind(resendClient); 