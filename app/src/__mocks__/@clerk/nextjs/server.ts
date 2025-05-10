export interface ClerkUser {
  id: string;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
  }>;
  primaryEmailAddressId: string;
}

// User data that will be returned by currentUser
let mockUserData: ClerkUser | null = {
  id: 'test-clerk-id',
  emailAddresses: [
    {
      id: 'email-id-1',
      emailAddress: 'test@example.com'
    }
  ],
  primaryEmailAddressId: 'email-id-1'
};

// Function to set mock user data for tests
export const __setMockUser = (user: ClerkUser | null) => {
  mockUserData = user;
};

// Function to reset mock user data to default
export const __resetMockUser = () => {
  mockUserData = {
    id: 'test-clerk-id',
    emailAddresses: [
      {
        id: 'email-id-1',
        emailAddress: 'test@example.com'
      }
    ],
    primaryEmailAddressId: 'email-id-1'
  };
};

// Mock implementation of currentUser
export const currentUser = jest.fn().mockImplementation(async () => {
  return mockUserData;
});

// Mock implementation of auth
export const auth = jest.fn().mockImplementation(() => ({
  userId: mockUserData?.id || null,
  sessionId: mockUserData ? 'test-session-id' : null,
  getToken: jest.fn().mockResolvedValue(mockUserData ? 'test-token' : null),
}));

// Mock implementation of clerkClient
export const clerkClient = {
  users: {
    getUser: jest.fn().mockImplementation(async (userId: string) => {
      if (!mockUserData || mockUserData.id !== userId) {
        return null;
      }
      return mockUserData;
    }),
  },
  sessions: {
    getSession: jest.fn().mockImplementation(async (sessionId: string) => {
      if (!mockUserData) {
        return null;
      }
      return {
        id: 'test-session-id',
        userId: mockUserData.id,
        status: 'active',
      };
    }),
    verifySession: jest.fn().mockImplementation(async (sessionId: string, sessionToken: string) => {
      if (!mockUserData) {
        return null;
      }
      return {
        id: 'test-session-id',
        userId: mockUserData.id,
        status: 'active',
      };
    }),
  },
};

export const getAuth = jest.fn().mockImplementation(() => ({
  userId: mockUserData?.id || null,
  sessionId: mockUserData ? 'test-session-id' : null,
  getToken: jest.fn().mockResolvedValue(mockUserData ? 'test-token' : null),
})); 