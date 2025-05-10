export const createClerkClient = jest.fn().mockReturnValue({
  users: {
    getUser: jest.fn().mockResolvedValue({
      id: 'mock-user-id',
      emailAddresses: [
        {
          id: 'mock-email-id',
          emailAddress: 'test@example.com',
          verification: {
            status: 'verified',
          },
        }
      ],
      primaryEmailAddressId: 'mock-email-id',
    }),
  },
  sessions: {
    getSessionList: jest.fn().mockResolvedValue([
      {
        id: 'mock-session-id',
        userId: 'mock-user-id',
        expireAt: new Date(Date.now() + 3600000).toISOString(),
      }
    ])
  }
}); 