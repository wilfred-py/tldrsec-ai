/**
 * Email module
 *
 * Provides functionality for sending emails.
 */

import { emailClient, sendEmail, ResendClient } from './email-core';

export { emailClient, sendEmail, ResendClient };

export * from './types';
export { resendConfig } from './config';
export { NotificationPreference } from './notification-types';
