import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';
import * as authUtils from '@/lib/auth-utils';
import * as usersApi from '@/lib/api/users';

// Mock the auth-utils and users API modules
jest.mock('@/lib/auth-utils');
jest.mock('@/lib/api/users');

describe('User Profile API', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    notificationPreference: 'immediate',
    theme: 'light',
    authProvider: 'clerk',
    authProviderId: 'clerk-id',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAuthInfo = {
    userId: 'clerk-user-id',
    dbUserId: 'test-user-id',
    userEmail: 'test@example.com',
    hasDbAccount: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/user/profile', () => {
    it('should return 401 if user is not authenticated', async () => {
      // Mock getAuthenticatedUser to return null (not authenticated)
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 if user does not have a DB account', async () => {
      // Mock user has auth but no DB account
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        ...mockAuthInfo,
        hasDbAccount: false,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });

    it('should return 404 if user not found in database', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      // Mock user not found in database
      (usersApi.getUserById as jest.Mock).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });

    it('should return user profile if user is authenticated and found', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      // Mock user found in database
      (usersApi.getUserById as jest.Mock).mockResolvedValue(mockUser);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        notificationPreference: mockUser.notificationPreference,
        theme: mockUser.theme,
        createdAt: mockUser.createdAt.toISOString(),
        updatedAt: mockUser.updatedAt.toISOString(),
      });
    });

    it('should return 500 if there is a server error', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      // Mock database error
      (usersApi.getUserById as jest.Mock).mockRejectedValue(new Error('Database error'));

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
      // Mock getAuthenticatedUser to return null (not authenticated)
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest({ name: 'New Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 if user does not have a DB account', async () => {
      // Mock user has auth but no DB account
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue({
        ...mockAuthInfo,
        hasDbAccount: false,
      });

      const req = createMockRequest({ name: 'New Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });

    it('should return 400 if request data is invalid', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      
      // Invalid data: empty name
      const req = createMockRequest({ name: '' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Bad Request');
    });

    it('should return 400 if no fields to update are provided', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      
      // Empty request body
      const req = createMockRequest({});
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Bad Request');
      expect(data.message).toBe('No fields to update provided');
    });

    it('should update user profile and return updated data', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      
      // Mock successful update
      const updatedUser = {
        ...mockUser,
        name: 'Updated Name',
        updatedAt: new Date(),
      };
      (usersApi.updateUser as jest.Mock).mockResolvedValue(updatedUser);
      
      const req = createMockRequest({ name: 'Updated Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(usersApi.updateUser).toHaveBeenCalledWith('test-user-id', { name: 'Updated Name' });
      expect(data.name).toBe('Updated Name');
    });

    it('should return 500 if there is a server error', async () => {
      // Mock authenticated user
      (authUtils.getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthInfo);
      // Mock database error
      (usersApi.updateUser as jest.Mock).mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({ name: 'Updated Name' });
      const response = await PATCH(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });
}); 