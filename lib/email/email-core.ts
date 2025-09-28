/**
 * Email Core Module
 * 
 * Core email functionality extracted to break circular dependencies
 */

import { ResendClient } from './resend-client';
import { EmailMessage, EmailSendResult } from './types';
// resendConfig not used in this file

// Create the default client with API key from environment
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Verify if we have a Resend API key
if (!RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set in environment variables. Email sending will not work.');
} else {
  console.log('Resend client initialized with API key');
}

// Create the client with the API key
export const emailClient = new ResendClient(RESEND_API_KEY);

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

// Re-export types
export * from './types';
export { resendConfig } from './config';
