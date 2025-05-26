import { jest } from '@jest/globals';

// Types for server action responses
interface SuccessResponse {
  success: true;
}

interface ErrorResponse {
  success: false;
  error: string;
}

type ActionResponse = SuccessResponse | ErrorResponse;

// Mock for saveUserPreferences server action
export const mockSaveUserPreferences = jest.fn<() => Promise<ActionResponse>>().mockResolvedValue({
  success: true
});

// Mock for addTickerSubscription server action
export const mockAddTickerSubscription = jest.fn<() => Promise<ActionResponse>>().mockResolvedValue({
  success: true
});

// Mock for unsuccessful server actions
export const mockSaveUserPreferencesError = jest.fn<() => Promise<ActionResponse>>().mockResolvedValue({
  success: false,
  error: 'Failed to save preferences'
});

export const mockAddTickerSubscriptionError = jest.fn<() => Promise<ActionResponse>>().mockResolvedValue({
  success: false,
  error: 'Failed to add ticker subscription'
});

// Helper to set up server action mocks for the onboarding flow
export const setupOnboardingActionMocks = (
  options = { saveSuccess: true, subscriptionSuccess: true }
) => {
  jest.mock('../../app/(auth)/onboarding/actions', () => ({
    saveUserPreferences: options.saveSuccess 
      ? mockSaveUserPreferences 
      : mockSaveUserPreferencesError,
    addTickerSubscription: options.subscriptionSuccess
      ? mockAddTickerSubscription
      : mockAddTickerSubscriptionError
  }));
};

// Reset mocks
export const resetActionMocks = () => {
  mockSaveUserPreferences.mockClear();
  mockAddTickerSubscription.mockClear();
  mockSaveUserPreferencesError.mockClear();
  mockAddTickerSubscriptionError.mockClear();
}; 