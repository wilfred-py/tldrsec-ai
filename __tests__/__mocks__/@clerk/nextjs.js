// Mock for @clerk/nextjs to avoid ES module and App Router issues
module.exports = {
  // App Router server functions - ensure they're proper jest mocks
  auth: jest.fn(),
  currentUser: jest.fn(() => Promise.resolve({
    id: 'mock-user-id',
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    firstName: 'Test',
    lastName: 'User',
  })),
  clerkClient: {
    users: {
      getUser: jest.fn(),
      getUserList: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
    },
    organizations: {
      getOrganization: jest.fn(),
      getOrganizationList: jest.fn(),
    },
    sessions: {
      getSession: jest.fn(),
      getSessionList: jest.fn(),
    },
  },
  
  // Pages Router functions
  getAuth: jest.fn(() => ({
    userId: 'mock-user-id',
    sessionId: 'mock-session-id',
    orgId: null,
    getToken: jest.fn(),
  })),
  
  // Client components
  ClerkProvider: ({ children }) => children,
  SignIn: jest.fn(() => null),
  SignUp: jest.fn(() => null),
  UserButton: jest.fn(() => null),
  useUser: jest.fn(() => ({
    user: {
      id: 'mock-user-id',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
    isLoaded: true,
    isSignedIn: true,
  })),
  useAuth: jest.fn(() => ({
    userId: 'mock-user-id',
    sessionId: 'mock-session-id',
    isLoaded: true,
    isSignedIn: true,
    getToken: jest.fn(),
  })),
  useClerk: jest.fn(() => ({
    signOut: jest.fn(),
    openSignIn: jest.fn(),
    openSignUp: jest.fn(),
  })),
  
  // Middleware
  authMiddleware: jest.fn(() => jest.fn()),
  clerkMiddleware: jest.fn(() => jest.fn()),
  
  // Webhook
  Webhook: jest.fn(),
  WebhookEvent: jest.fn(),
  
  // Types and interfaces (for TypeScript compatibility)
  User: jest.fn(),
  Session: jest.fn(),
  Organization: jest.fn(),
};