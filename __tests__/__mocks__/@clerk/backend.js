// Mock for @clerk/backend to avoid ES module issues
module.exports = {
  // Mock the most commonly used exports
  createClerkClient: jest.fn(() => ({
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
    emailAddresses: {
      getEmailAddress: jest.fn(),
    },
  })),
  verifyToken: jest.fn(),
  SignedInAuthObject: jest.fn(),
  SignedOutAuthObject: jest.fn(),
  User: jest.fn(),
  Session: jest.fn(),
  Organization: jest.fn(),
  EmailAddress: jest.fn(),
  // Add any other exports that might be used
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
    emailAddresses: {
      getEmailAddress: jest.fn(),
    },
  },
};