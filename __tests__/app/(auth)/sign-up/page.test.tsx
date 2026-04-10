import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SignUpPage from '@/app/(auth)/sign-up/[[...sign-up]]/page';

const mockAuthenticateWithRedirect = jest.fn();

// Mock the Clerk SignUp component and useSignUp hook
jest.mock('@clerk/nextjs', () => ({
  SignUp: ({ appearance }: { appearance?: Record<string, unknown> }) => (
    <div data-testid="clerk-sign-up" data-appearance={JSON.stringify(appearance)}>
      Clerk SignUp Component
    </div>
  ),
  useSignUp: () => ({
    signUp: { authenticateWithRedirect: mockAuthenticateWithRedirect },
    isLoaded: true,
  }),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    mockAuthenticateWithRedirect.mockClear();
  });

  it('renders the Clerk SignUp component and Google button', () => {
    render(<SignUpPage />);

    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('calls authenticateWithRedirect with oidcPrompt and onboarding redirect', async () => {
    render(<SignUpPage />);

    fireEvent.click(screen.getByText('Continue with Google'));

    expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: '/sign-up/sso-callback',
      redirectUrlComplete: '/onboarding',
      oidcPrompt: 'select_account',
    });
  });

  it('hides social buttons via appearance prop', () => {
    render(<SignUpPage />);

    const signUp = screen.getByTestId('clerk-sign-up');
    const appearance = JSON.parse(signUp.getAttribute('data-appearance') || '{}');
    expect(appearance.elements.socialButtons).toEqual({ display: 'none' });
    expect(appearance.elements.dividerRow).toEqual({ display: 'none' });
  });

  it('shows error message when Google auth fails', async () => {
    mockAuthenticateWithRedirect.mockRejectedValueOnce(new Error('Network error'));

    render(<SignUpPage />);
    fireEvent.click(screen.getByText('Continue with Google'));

    expect(await screen.findByText('Unable to connect to Google. Please try again.')).toBeInTheDocument();
  });
});
