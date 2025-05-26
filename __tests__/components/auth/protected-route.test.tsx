import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { mockAuthContext, mockAuthContextUnauthenticated, mockAuthContextLoading } from '../../mocks/auth-provider-mock';

// Mock useAuthContext hook
jest.mock('@/lib/context/auth-context', () => ({
  useAuthContext: jest.fn(),
}));

// Mock next/navigation redirect
const redirectMock = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: jest.fn(path => {
    redirectMock(path);
    // When redirect is called, we should prevent rendering of children
    return null;
  }),
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children when authenticated', () => {
    // Set the mock to return authenticated state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContext);

    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should render loading state when checking auth', () => {
    // Set the mock to return loading state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContextLoading);

    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Protected content should not be shown during loading
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    
    // Should show some kind of loading UI
    // Since we're using Skeleton in the component, we can't easily test for it
    // So we're just checking that the children aren't rendered
  });

  it('should redirect when not authenticated', () => {
    // Set the mock to return unauthenticated state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContextUnauthenticated);
    
    // We need to mock the component behavior since redirect doesn't actually navigate in tests
    // Override the useEffect in the component to simulate the redirect
    const originalUseEffect = React.useEffect;
    const mockUseEffect = jest.spyOn(React, 'useEffect').mockImplementationOnce((callback) => {
      callback();
      return () => {};
    });

    render(
      <ProtectedRoute>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Should redirect to sign-in by default
    expect(redirectMock).toHaveBeenCalledWith('/sign-in');
    
    // Since we're mocking redirect, React doesn't actually stop rendering
    // In a real app, redirect would prevent rendering of children
    // So we just verify the redirect was called with the right path
    
    // Restore original useEffect
    mockUseEffect.mockRestore();
  });

  it('should redirect to custom URL when not authenticated', () => {
    // Set the mock to return unauthenticated state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContextUnauthenticated);
    
    // We need to mock the component behavior since redirect doesn't actually navigate in tests
    // Override the useEffect in the component to simulate the redirect
    const mockUseEffect = jest.spyOn(React, 'useEffect').mockImplementationOnce((callback) => {
      callback();
      return () => {};
    });

    render(
      <ProtectedRoute redirectTo="/custom-login">
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Should redirect to custom URL
    expect(redirectMock).toHaveBeenCalledWith('/custom-login');
    
    // Restore original useEffect
    mockUseEffect.mockRestore();
  });

  it('should render custom fallback when loading', () => {
    // Set the mock to return loading state
    require('@/lib/context/auth-context').useAuthContext.mockReturnValue(mockAuthContextLoading);

    render(
      <ProtectedRoute fallback={<div data-testid="custom-loader">Custom Loading...</div>}>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Should show custom fallback
    expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
    
    // Protected content should not be shown
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
}); 