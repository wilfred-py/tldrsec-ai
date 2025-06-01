// Mock implementation of Clerk for testing
export const auth = jest.fn().mockResolvedValue({
  userId: 'test-user-id',
});

export const currentUser = jest.fn().mockResolvedValue({
  id: 'test-user-id',
  firstName: 'Test',
  lastName: 'User',
  emailAddresses: [{ emailAddress: 'test@example.com' }],
});

export const clerkClient = {
  users: {
    getUser: jest.fn().mockResolvedValue({
      id: 'test-user-id',
      firstName: 'Test',
      lastName: 'User',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    }),
  },
};
