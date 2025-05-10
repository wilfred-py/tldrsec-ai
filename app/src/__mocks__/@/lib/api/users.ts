// Mock implementation of users API
// Define the User type based on schema.prisma
export type User = {
  id: string;
  email: string;
  name: string | null;
  authProvider: string;
  authProviderId: string;
  createdAt: Date;
  updatedAt: Date;
  notificationPreference: string;
  theme: string;
  role: string;
  emailVerified: boolean;
};

// Default mock user
const defaultMockUser: User = {
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

// Mock user database
let mockUsers: Record<string, User> = {
  'test-user-id': { ...defaultMockUser }
};

// Function to reset mock users to default
export const __resetMockUsers = () => {
  mockUsers = {
    'test-user-id': { ...defaultMockUser }
  };
};

// Function to set a mock user
export const __setMockUser = (user: User) => {
  mockUsers[user.id] = user;
};

// Mock implementations for user API functions
export const getUserById = jest.fn().mockImplementation(async (id: string): Promise<User | null> => {
  return mockUsers[id] || null;
});

export const getUserByEmail = jest.fn().mockImplementation(async (email: string): Promise<User | null> => {
  const user = Object.values(mockUsers).find(user => user.email === email);
  return user || null;
});

export const updateUser = jest.fn().mockImplementation(async (id: string, data: Partial<User>): Promise<User> => {
  if (!mockUsers[id]) {
    throw new Error(`User with ID ${id} not found`);
  }
  
  const updatedUser = {
    ...mockUsers[id],
    ...data,
    updatedAt: new Date()
  };
  
  mockUsers[id] = updatedUser;
  return updatedUser;
});

export const createUser = jest.fn().mockImplementation(async (data: Partial<User>): Promise<User> => {
  const id = data.id || `user-${Date.now()}`;
  const newUser: User = {
    id,
    email: data.email || 'new@example.com',
    name: data.name || 'New User',
    notificationPreference: data.notificationPreference || 'immediate',
    theme: data.theme || 'light',
    authProvider: data.authProvider || 'clerk',
    authProviderId: data.authProviderId || 'new-clerk-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: data.role || 'user',
    emailVerified: data.emailVerified || false
  };
  
  mockUsers[id] = newUser;
  return newUser;
}); 