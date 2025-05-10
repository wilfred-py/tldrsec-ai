// Mock implementation of auth-utils.ts
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

export type AuthenticatedUser = {
  userId: string;
  dbUserId: string;
  userEmail: string;
  hasDbAccount: boolean;
};

// Default mock authenticated user
let mockAuthenticatedUser: AuthenticatedUser | null = {
  userId: 'test-clerk-id',
  dbUserId: 'test-user-id',
  userEmail: 'test@example.com',
  hasDbAccount: true,
};

// Function to set mock authenticated user for tests
export const __setMockAuthenticatedUser = (user: AuthenticatedUser | null) => {
  mockAuthenticatedUser = user;
};

// Function to reset mock authenticated user to default
export const __resetMockAuthenticatedUser = () => {
  mockAuthenticatedUser = {
    userId: 'test-clerk-id',
    dbUserId: 'test-user-id',
    userEmail: 'test@example.com',
    hasDbAccount: true,
  };
};

// Mock implementations for auth-utils functions
export const getAuthenticatedUser = jest.fn().mockImplementation(async () => {
  return mockAuthenticatedUser;
});

export const verifyToken = jest.fn().mockImplementation(async (token: string) => {
  if (token === 'valid-token') {
    return { valid: true, uid: 'test-user-id' };
  }
  return { valid: false, error: 'Invalid token' };
});

export const getCsrfToken = jest.fn().mockImplementation(() => {
  return 'mock-csrf-token';
});

export const generateCsrfToken = jest.fn().mockImplementation(() => {
  return 'mock-csrf-token';
});

export const validateCsrfToken = jest.fn().mockImplementation((request: Request, token: string) => {
  return token === 'mock-csrf-token';
});

export const getSessionData = jest.fn().mockImplementation((cookies: ReadonlyRequestCookies) => {
  return {
    sessionId: 'mock-session-id',
    sessionToken: 'mock-session-token',
  };
});

export const needsSessionRefresh = jest.fn().mockImplementation(() => {
  return false;
});

export const getSessionTimeout = jest.fn().mockImplementation(() => {
  return 3600;
}); 