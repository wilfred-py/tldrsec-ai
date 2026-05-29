/**
 * Email module — public interface.
 *
 * Owns the default Resend-backed singleton and the convenience `sendEmail`
 * wrapper. Callers reach this module via `import { emailClient, sendEmail }
 * from '@/lib/email'`. The `ResendClient` class is re-exported for tests
 * and for callers that need a fresh instance with explicit config.
 */

import { ResendClient } from './resend-client';
import { EmailMessage, EmailSendResult } from './types';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set in environment variables. Email sending will not work.');
} else {
  console.log('Resend client initialized with API key');
}

export const emailClient = new ResendClient(RESEND_API_KEY);

export async function sendEmail(
  message: EmailMessage,
  options = {}
): Promise<EmailSendResult> {
  return emailClient.sendEmail(message, options);
}

export { ResendClient };

export * from './types';
export { resendConfig } from './config';
export { NotificationPreference } from './notification-types';
