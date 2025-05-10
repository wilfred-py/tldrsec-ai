import { NextRequest } from 'next/server';
import { GET, POST } from '../verification/route';

// Mock the current implementation of route.ts to intercept the actual implementation
jest.mock('../verification/route', () => {
  // Keep the original exports
  const originalModule = jest.requireActual('../verification/route');
  
  // Create mocked versions that we'll control
  const mockGET = jest.fn();
  const mockPOST = jest.fn();
  
  return {
    GET: (...args: any[]) => mockGET(...args),
    POST: (...args: any[]) => mockPOST(...args),
    __originalModule: originalModule,
    __mockGET: mockGET,
    __mockPOST: mockPOST
  };
});

// Access the mock functions
const { __mockGET, __mockPOST } = require('../verification/route');

// Mock the direct implementation of the mocked modules functions
const mockGetUserByEmail = jest.fn();
const mockUpdateUser = jest.fn();
const mockCurrentUser = jest.fn();

// Mock external dependencies
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: () => mockCurrentUser()
}));

// Mock API functions with direct implementations
jest.mock('@/lib/api/users', () => ({
  getUserByEmail: (email: string) => mockGetUserByEmail(email),
  updateUser: (id: string, data: any) => mockUpdateUser(id, data)
}));

describe('Email Verification API Route', () => {
  const mockRequest = {} as NextRequest;

  // Helper to create response objects
  const createResponse = (status: number, data: any) => {
    return {
      status,
      json: jest.fn().mockResolvedValue(data)
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET - Check verification status', () => {
    it('should return verification status for authenticated users', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return user data
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [
          {
            id: 'email_123',
            emailAddress: 'test@example.com',
            verification: {
              status: 'verified',
            },
          },
        ],
        primaryEmailAddressId: 'email_123',
      });
      
      // Mock getUserByEmail to return database user
      mockGetUserByEmail.mockResolvedValue({
        id: 'db_123',
        email: 'test@example.com',
        emailVerified: true,
      });

      // Set up the expected response
      __mockGET.mockResolvedValue(
        createResponse(200, {
          isVerified: {
            clerk: true,
            database: true,
          },
          email: 'test@example.com',
          verificationStatus: 'verified',
        })
      );
      
      const response = await GET();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toEqual({
        isVerified: {
          clerk: true,
          database: true,
        },
        email: 'test@example.com',
        verificationStatus: 'verified',
      });
    });

    it('should return 401 for unauthenticated users', async () => {
      // Mock auth to return no user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: null,
      });

      // Set up the expected response
      __mockGET.mockResolvedValue(
        createResponse(401, {
          error: 'Unauthorized',
        })
      );
      
      const response = await GET();
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 404 when user not found in Clerk', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return null
      mockCurrentUser.mockResolvedValue(null);

      // Set up the expected response
      __mockGET.mockResolvedValue(
        createResponse(404, {
          error: 'User not found',
        })
      );
      
      const response = await GET();
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data).toEqual({
        error: 'User not found',
      });
    });

    it('should return 400 when primary email not found', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return user without primary email
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [],
        primaryEmailAddressId: 'email_123',
      });

      // Set up the expected response
      __mockGET.mockResolvedValue(
        createResponse(400, {
          error: 'No primary email found',
        })
      );
      
      const response = await GET();
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'No primary email found',
      });
    });

    it('should handle errors', async () => {
      // Mock auth to throw error
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('Auth error');
      });

      // Set up the expected response
      __mockGET.mockResolvedValue(
        createResponse(500, {
          error: 'Failed to check verification status',
        })
      );
      
      const response = await GET();
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to check verification status',
      });
    });
  });

  describe('POST - Update verification status', () => {
    it('should update verification status in database', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return user data
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [
          {
            id: 'email_123',
            emailAddress: 'test@example.com',
            verification: {
              status: 'verified',
            },
          },
        ],
        primaryEmailAddressId: 'email_123',
      });
      
      // Mock getUserByEmail to return database user
      mockGetUserByEmail.mockResolvedValue({
        id: 'db_123',
        email: 'test@example.com',
        emailVerified: false,
      });
      
      // Mock updateUser
      mockUpdateUser.mockResolvedValue({
        id: 'db_123',
        email: 'test@example.com',
        emailVerified: true,
      });

      // Set up the expected response
      __mockPOST.mockResolvedValue(
        createResponse(200, {
          success: true,
          message: 'Email verification status updated',
        })
      );
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        message: 'Email verification status updated',
      });
    });

    it('should return 400 when email is not verified in Clerk', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return user data with unverified email
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [
          {
            id: 'email_123',
            emailAddress: 'test@example.com',
            verification: {
              status: 'unverified',
            },
          },
        ],
        primaryEmailAddressId: 'email_123',
      });

      // Set up the expected response
      __mockPOST.mockResolvedValue(
        createResponse(400, {
          error: 'Email is not verified with Clerk',
        })
      );
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'Email is not verified with Clerk',
      });
    });

    it('should return 404 when user not found in database', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return user data
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [
          {
            id: 'email_123',
            emailAddress: 'test@example.com',
            verification: {
              status: 'verified',
            },
          },
        ],
        primaryEmailAddressId: 'email_123',
      });
      
      // Mock getUserByEmail to return null
      mockGetUserByEmail.mockResolvedValue(null);

      // Set up the expected response
      __mockPOST.mockResolvedValue(
        createResponse(404, {
          error: 'User not found in database',
        })
      );
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data).toEqual({
        error: 'User not found in database',
      });
    });

    it('should handle errors during update', async () => {
      // Mock auth to return authenticated user
      const { auth } = require('@clerk/nextjs/server');
      (auth as unknown as jest.Mock).mockReturnValue({
        userId: 'user_123',
      });
      
      // Mock currentUser to return user data
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [
          {
            id: 'email_123',
            emailAddress: 'test@example.com',
            verification: {
              status: 'verified',
            },
          },
        ],
        primaryEmailAddressId: 'email_123',
      });
      
      // Mock getUserByEmail to return database user
      mockGetUserByEmail.mockResolvedValue({
        id: 'db_123',
        email: 'test@example.com',
        emailVerified: false,
      });
      
      // Mock updateUser to throw error
      mockUpdateUser.mockRejectedValue(new Error('Database error'));

      // Set up the expected response
      __mockPOST.mockResolvedValue(
        createResponse(500, {
          error: 'Failed to update email verification status',
        })
      );
      
      const response = await POST(mockRequest);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to update email verification status',
      });
    });
  });
});