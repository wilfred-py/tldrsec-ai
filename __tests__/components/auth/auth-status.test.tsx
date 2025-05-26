import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthStatus } from '@/components/auth/auth-status';
import { mockAuthContext, mockAuthContextUnauthenticated, mockAuthContextLoading } from '../../mocks/auth-provider-mock';

// Mock useAuthContext hook
jest.mock('@/lib/context/auth-context', () => ({
  useAuthContext: jest.fn(),
}));

describe('AuthStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display authenticated state', () => {
    // Set the mock to return authenticated state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContext);

    render(<AuthStatus />);

    // Should show authenticated state
    expect(screen.getByText('Authenticated')).toBeInTheDocument();
    
    // Should show user info
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    
    // Should show sign out button
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    
    // Should not show sign in/up buttons
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up/i })).not.toBeInTheDocument();
  });

  it('should display unauthenticated state', () => {
    // Set the mock to return unauthenticated state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContextUnauthenticated);

    render(<AuthStatus />);

    // Should show unauthenticated state
    expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
    
    // Should not show user info
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
    
    // Should show sign in/up buttons
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
    
    // Should not show sign out button
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('should display loading state', () => {
    // Set the mock to return loading state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContextLoading);

    render(<AuthStatus />);

    // Should show loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should handle sign out button click', async () => {
    // Set the mock to return authenticated state
    const authContextMock = { ...mockAuthContext, signOut: jest.fn() };
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(authContextMock);
    
    const user = userEvent.setup();
    render(<AuthStatus />);

    // Click sign out button
    const signOutButton = screen.getByRole('button', { name: /sign out/i });
    await user.click(signOutButton);

    // Should call signOut function
    expect(authContextMock.signOut).toHaveBeenCalledTimes(1);
  });

  it('should handle sign in button click', async () => {
    // Set the mock to return unauthenticated state
    const authContextMock = { ...mockAuthContextUnauthenticated, redirectToSignIn: jest.fn() };
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(authContextMock);
    
    const user = userEvent.setup();
    render(<AuthStatus />);

    // Click sign in button
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(signInButton);

    // Should call redirectToSignIn function
    expect(authContextMock.redirectToSignIn).toHaveBeenCalledTimes(1);
  });

  it('should handle sign up button click', async () => {
    // Set the mock to return unauthenticated state
    const authContextMock = { ...mockAuthContextUnauthenticated, redirectToSignUp: jest.fn() };
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(authContextMock);
    
    const user = userEvent.setup();
    render(<AuthStatus />);

    // Click sign up button
    const signUpButton = screen.getByRole('button', { name: /sign up/i });
    await user.click(signUpButton);

    // Should call redirectToSignUp function
    expect(authContextMock.redirectToSignUp).toHaveBeenCalledTimes(1);
  });
}); 