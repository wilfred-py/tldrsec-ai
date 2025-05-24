// Mock currentUser function for Clerk auth
export const currentUser = jest.fn();

// Mock auth function
export const auth = jest.fn();

// Reset mocks before each test
beforeEach(() => {
  currentUser.mockReset();
  auth.mockReset();
}); 