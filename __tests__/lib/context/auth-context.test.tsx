import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuthContext } from '@/lib/context/auth-context';
import { mockUseUser, mockUseAuth, mockUseClerk } from '../../mocks/clerk-mock';

// Create mock values that we can modify for specific tests
const mockUserValues = {
  isSignedIn: true,
  user: mockUseUser().user,
  isLoaded: true,
};

const mockAuthValues = {
  signOut: jest.fn().mockResolvedValue(undefined),
};

// Mock the Clerk hooks
jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUserValues,
  useAuth: () => ({
    ...mockUseAuth(),
    signOut: mockAuthValues.signOut,
  }),
  useClerk: () => mockUseClerk(),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

// Create a test component that uses the auth context
const TestComponent = () => {
  const { isAuthenticated, isLoading, userName, signOut } = useAuthContext();
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'Loading' : 'Not Loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</div>
      <div data-testid="user-name">{userName || 'No user'}</div>
      <button data-testid="sign-out-button" onClick={() => signOut()}>
        Sign Out
      </button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock values to default state
    mockUserValues.isSignedIn = true;
    mockUserValues.user = mockUseUser().user;
    mockUserValues.isLoaded = true;
    mockAuthValues.signOut = jest.fn().mockResolvedValue(undefined);
  });

  it('should provide authentication state to children', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
  });

  it('should handle sign out', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const signOutButton = screen.getByTestId('sign-out-button');
    await user.click(signOutButton);

    expect(mockAuthValues.signOut).toHaveBeenCalledTimes(1);
  });

  it('should handle loading state', () => {
    // Set isLoaded to false for this test
    mockUserValues.isLoaded = false;

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('Loading');
  });

  it('should handle unauthenticated state', () => {
    // Set isSignedIn to false and user to null for this test
    mockUserValues.isSignedIn = false;
    mockUserValues.user = null;

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('No user');
  });
}); 