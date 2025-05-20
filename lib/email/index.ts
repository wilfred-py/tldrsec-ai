/**
 * Email client module
 * 
 * Provides functionality for sending emails
 */

import { ResendClient } from './resend-client';
import { EmailMessage, EmailSendResult } from './types';
import { resendConfig } from './config';

// Re-export types
export * from './types';
export { resendConfig } from './config';

// Export notification components
export * from './notification-service';
export * from './notification-processor';
export * from './notification-integration';

// Create the default client
export const emailClient = new ResendClient();

/**
 * Send an email using the default client
 */
export async function sendEmail(
  message: EmailMessage, 
  options = {}
): Promise<EmailSendResult> {
  return emailClient.sendEmail(message, options);
}

// Export the ResendClient class
export { ResendClient }; 