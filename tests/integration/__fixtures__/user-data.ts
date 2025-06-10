import type { SECFilingType } from '../../../lib/ai/prompts/prompt-types';
import type { NotificationPreference } from '../../../types/user';

export const mockUser = {
  id: 'mock-user-id',
  name: 'Mock User',
  email: 'mock@example.com',
  preferences: {
    emailNotificationPreference: 'DAILY' as NotificationPreference,
    watchedTickers: [],
    watchedFormTypes: ['10-K', '10-Q', '8-K'] as SECFilingType[],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockUserDigestData = {
  userId: mockUser.id,
  email: mockUser.email,
  name: mockUser.name,
  emailNotificationPreference: mockUser.preferences.emailNotificationPreference,
  watchedTickers: mockUser.preferences.watchedTickers,
  watchedFormTypes: mockUser.preferences.watchedFormTypes,
};
