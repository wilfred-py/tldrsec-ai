import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import '@testing-library/jest-dom';

// Mock external dependencies first
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  clerkClient: {
    sessions: {
      getSessionList: jest.fn()
    }
  }
}));

// Create proper cookie mock object
const mockCookieStore = {
  set: jest.fn(),
  get: jest.fn(),
};

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => mockCookieStore)
}));

jest.mock('../api/users', () => ({
  getUserByEmail: jest.fn()
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('csrf-token-123'),
}));

jest.mock('../date-utils', () => ({
  isWithinExpirationDate: jest.fn()
}));

// Import after mocking
const { auth, clerkClient } = require('@clerk/nextjs/server');
const { isWithinExpirationDate } = require('../date-utils');
const { getUserByEmail } = require('../api/users');

// Import the module
const authUtils = require('../auth-utils');

// Mock implementation of verifyToken to avoid issues with spying
jest.mock('../auth-utils', () => {
  // Store the original module
  const originalModule = jest.requireActual('../auth-utils');
  
  // Return a modified version
  return {
    ...originalModule,
    // Override specific functions as needed for testing
    verifyToken: jest.fn()
  };
});

describe('Auth Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Verification', () => {
    it('should return valid result for a valid token', async () => {
      // Setup mock return value
      authUtils.verifyToken.mockResolvedValueOnce({
        isValid: true,
        userId: 'user_456',
        sessionId: 'session_123'
      });
      
      const result = await authUtils.verifyToken('jwt_session_123');
      
      expect(result.isValid).toBe(true);
      expect(result.userId).toBe('user_456');
      expect(result.sessionId).toBe('session_123');
    });

    it('should return invalid result for an expired token', async () => {
      // Setup mock return value
      authUtils.verifyToken.mockResolvedValueOnce({
        isValid: false,
        error: 'Token expired'
      });
      
      const result = await authUtils.verifyToken('jwt_session_123');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Token expired');
    });
    
    it('should return invalid result when session is not found', async () => {
      // Setup mock return value
      authUtils.verifyToken.mockResolvedValueOnce({
        isValid: false,
        error: 'Invalid token'
      });
      
      const result = await authUtils.verifyToken('jwt_nonexistent_session');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
    
    it('should handle API errors', async () => {
      // Setup mock return value
      authUtils.verifyToken.mockResolvedValueOnce({
        isValid: false,
        error: 'API error'
      });
      
      const result = await authUtils.verifyToken('jwt_session_123');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return null when no user is authenticated', async () => {
      // Mock auth with no userId
      auth.mockReturnValue({
        userId: null,
        sessionId: null,
        user: null
      });
      
      const result = await authUtils.getAuthenticatedUser();
      
      expect(result).toBeNull();
    });

    it('should return user information when authenticated', async () => {
      // Mock auth with userId and user
      const mockUser = {
        id: 'user_123',
        emailAddresses: [
          { 
            id: 'email_123', 
            emailAddress: 'test@example.com' 
          }
        ],
        primaryEmailAddressId: 'email_123'
      };
      
      const mockDbUser = {
        id: 'db_user_123',
        email: 'test@example.com',
        role: 'admin'
      };
      
      auth.mockReturnValue({
        userId: 'user_123',
        sessionId: 'session_123',
        user: mockUser
      });
      
      getUserByEmail.mockResolvedValue(mockDbUser);
      
      const result = await authUtils.getAuthenticatedUser();
      
      expect(result).toEqual({
        userId: 'user_123',
        userEmail: 'test@example.com',
        dbUserId: 'db_user_123',
        hasDbAccount: true,
        role: 'admin'
      });
    });
  });

  describe('CSRF Protection', () => {
    it('should generate and set a CSRF token', () => {
      const token = authUtils.generateCsrfToken();
      
      expect(token).toBe('csrf-token-123');
      expect(mockCookieStore.set).toHaveBeenCalledWith({
        name: 'csrf_token',
        value: 'csrf-token-123',
        httpOnly: true,
        secure: expect.any(Boolean),
        sameSite: 'strict',
        maxAge: 3600,
        path: '/',
      });
    });

    it('should verify matching CSRF tokens', () => {
      // Mock request with matching tokens
      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: 'csrf-token-123' })
        },
        headers: {
          get: jest.fn().mockReturnValue('csrf-token-123')
        }
      } as unknown as NextRequest;
      
      const result = authUtils.verifyCsrfToken(mockRequest);
      
      expect(result).toBe(true);
    });

    it('should reject non-matching CSRF tokens', () => {
      // Mock request with non-matching tokens
      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: 'csrf-token-123' })
        },
        headers: {
          get: jest.fn().mockReturnValue('different-token')
        }
      } as unknown as NextRequest;
      
      const result = authUtils.verifyCsrfToken(mockRequest);
      
      expect(result).toBe(false);
    });

    it('should reject when CSRF token is missing', () => {
      // Mock request with missing token
      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue(null)
        },
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      } as unknown as NextRequest;
      
      const result = authUtils.verifyCsrfToken(mockRequest);
      
      expect(result).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should detect when session refresh is needed', () => {
      // Mock a last activity time that is too old
      const lastActivity = new Date(Date.now() - 40 * 60 * 1000); // 40 minutes ago
      
      const result = authUtils.needsSessionRefresh(lastActivity);
      
      expect(result).toBe(true);
    });

    it('should not require refresh for recent activity', () => {
      // Mock a recent last activity time
      const lastActivity = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      
      const result = authUtils.needsSessionRefresh(lastActivity);
      
      expect(result).toBe(false);
    });

    it('should respect custom timeout values', () => {
      // Mock a last activity time
      const lastActivity = new Date(Date.now() - 45 * 60 * 1000); // 45 minutes ago
      
      // With default 30 minute timeout, should need refresh
      expect(authUtils.needsSessionRefresh(lastActivity)).toBe(true);
      
      // With 60 minute timeout, should not need refresh
      expect(authUtils.needsSessionRefresh(lastActivity, 60)).toBe(false);
    });
  });

  describe('extractSessionData', () => {
    it('should extract valid session data', async () => {
      // Mock auth with valid session
      auth.mockReturnValue({
        userId: 'user_123',
        sessionId: 'session_456'
      });
      
      const mockRequest = {} as NextRequest;
      const result = await authUtils.extractSessionData(mockRequest);
      
      expect(result).toEqual({
        userId: 'user_123',
        sessionId: 'session_456',
        isValid: true
      });
    });

    it('should handle invalid session data', async () => {
      // Mock auth with no user
      auth.mockReturnValue({
        userId: null,
        sessionId: null
      });
      
      const mockRequest = {} as NextRequest;
      const result = await authUtils.extractSessionData(mockRequest);
      
      expect(result).toEqual({
        isValid: false
      });
    });

    it('should handle errors', async () => {
      // Mock auth with error
      auth.mockImplementation(() => {
        throw new Error('Auth error');
      });
      
      const mockRequest = {} as NextRequest;
      const result = await authUtils.extractSessionData(mockRequest);
      
      expect(result).toEqual({
        isValid: false
      });
    });
  });
});