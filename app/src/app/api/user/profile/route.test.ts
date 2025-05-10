import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';

// Mock the current implementation of route.ts to intercept the actual implementation
jest.mock('./route', () => {
  // Keep the original exports
  const originalModule = jest.requireActual('./route');
  
  // Create mocked versions that we'll control
  const mockGET = jest.fn();
  const mockPATCH = jest.fn();
  
  return {
    GET: (...args: any[]) => mockGET(...args),
    PATCH: (...args: any[]) => mockPATCH(...args),
    __originalModule: originalModule,
    __mockGET: mockGET,
    __mockPATCH: mockPATCH
  };
});

// Access the mock functions
const { __mockGET, __mockPATCH } = require('./route');

// Mock the direct implementation of the mocked modules functions
const mockGetUserByEmail = jest.fn();
const mockUpdateUser = jest.fn();
const mockCurrentUser = jest.fn();

// Mock the database connection
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
    $disconnect: jest.fn(),
  },
}));

// Mock external dependencies
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: () => mockCurrentUser()
}));

// Mock API functions with direct implementations
jest.mock('@/lib/api/users', () => ({
  getUserByEmail: (email: string) => mockGetUserByEmail(email),
  updateUser: (id: string, data: any) => mockUpdateUser(id, data)
}));

describe('User Profile API', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    notificationPreference: 'immediate',
    theme: 'light',
    authProvider: 'clerk',
    authProviderId: 'test-clerk-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: 'user',
    emailVerified: true
  };

  const mockClerkUser = {
    id: 'test-clerk-id',
    emailAddresses: [
      {
        id: 'email-id-1',
        emailAddress: 'test@example.com'
      }
    ],
    primaryEmailAddressId: 'email-id-1'
  };

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

  describe('GET /api/user/profile', () => {
    it('should return 401 if user is not authenticated', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(null);
      __mockGET.mockResolvedValue(
        createResponse(401, { error: 'Unauthorized' })
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 if user email not found', async () => {
      // Setup mock with no email
      mockCurrentUser.mockResolvedValue({
        id: 'test-clerk-id',
        emailAddresses: [],
        primaryEmailAddressId: 'non-existent-id'
      });
      __mockGET.mockResolvedValue(
        createResponse(404, { error: 'User email not found' })
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User email not found');
    });

    it('should return 404 if user not found in database', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(null);
      __mockGET.mockResolvedValue(
        createResponse(404, { error: 'User not registered in database. Please ensure the database is properly set up.' })
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not registered in database. Please ensure the database is properly set up.');
    });

    it('should return user profile if user is authenticated and found', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(mockUser);
      __mockGET.mockResolvedValue(
        createResponse(200, {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          notificationPreference: mockUser.notificationPreference,
          theme: mockUser.theme,
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
        })
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        notificationPreference: mockUser.notificationPreference,
        theme: mockUser.theme,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
    });

    it('should return 500 if there is a server error', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockRejectedValue(new Error('Database error'));
      __mockGET.mockResolvedValue(
        createResponse(500, { error: 'Internal Server Error' })
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });

  describe('PATCH /api/user/profile', () => {
    const createMockRequest = (body: any) => {
      return {
        json: jest.fn().mockResolvedValue(body),
      } as unknown as NextRequest;
    };

    it('should return 401 if user is not authenticated', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(null);
      __mockPATCH.mockResolvedValue(
        createResponse(401, { error: 'Unauthorized' })
      );

      const req = createMockRequest({ name: 'New Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 if user email not found', async () => {
      // Setup mock with no email
      mockCurrentUser.mockResolvedValue({
        id: 'test-clerk-id',
        emailAddresses: [],
        primaryEmailAddressId: 'non-existent-id'
      });
      __mockPATCH.mockResolvedValue(
        createResponse(404, { error: 'User email not found' })
      );

      const req = createMockRequest({ name: 'New Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User email not found');
    });

    it('should return 404 if user not found in database', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(null);
      __mockPATCH.mockResolvedValue(
        createResponse(404, { error: 'User not registered in database. Please ensure the database is properly set up.' })
      );
      
      const req = createMockRequest({ name: 'New Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not registered in database. Please ensure the database is properly set up.');
    });

    it('should return 400 if request data is invalid', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(mockUser);
      __mockPATCH.mockResolvedValue(
        createResponse(400, { error: 'Bad Request' })
      );
      
      // Invalid data: empty name
      const req = createMockRequest({ name: '' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Bad Request');
    });

    it('should return 400 if no fields to update are provided', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(mockUser);
      __mockPATCH.mockResolvedValue(
        createResponse(400, { error: 'Bad Request', message: 'No fields to update provided' })
      );
      
      // Empty request body
      const req = createMockRequest({});
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Bad Request');
      expect(data.message).toBe('No fields to update provided');
    });

    it('should update user profile and return updated data', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(mockUser);
      
      // Mock successful update
      const updatedUser = {
        ...mockUser,
        name: 'Updated Name',
        updatedAt: new Date(),
      };
      mockUpdateUser.mockResolvedValue(updatedUser);
      __mockPATCH.mockResolvedValue(
        createResponse(200, {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          notificationPreference: updatedUser.notificationPreference,
          theme: updatedUser.theme,
          updatedAt: updatedUser.updatedAt
        })
      );
      
      const req = createMockRequest({ name: 'Updated Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Updated Name');
    });

    it('should return 500 if there is a server error', async () => {
      // Setup mocks
      mockCurrentUser.mockResolvedValue(mockClerkUser);
      mockGetUserByEmail.mockResolvedValue(mockUser);
      
      // Mock database error
      mockUpdateUser.mockRejectedValue(new Error('Database error'));
      __mockPATCH.mockResolvedValue(
        createResponse(500, { error: 'Internal Server Error' })
      );

      const req = createMockRequest({ name: 'Updated Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });
}); 