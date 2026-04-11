import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SignInPage from '@/app/(auth)/sign-in/[[...sign-in]]/page';

const mockAuthenticateWithRedirect = jest.fn();

// Mock the Clerk SignIn component and useSignIn hook
jest.mock('@clerk/nextjs', () => ({
  SignIn: ({ appearance }: { appearance?: Record<string, unknown> }) => (
    <div data-testid="clerk-sign-in" data-appearance={JSON.stringify(appearance)}>
      Clerk SignIn Component
    </div>
  ),
  useSignIn: () => ({
    signIn: { authenticateWithRedirect: mockAuthenticateWithRedirect },
    isLoaded: true,
  }),
}));

describe('SignInPage', () => {
  beforeEach(() => {
    mockAuthenticateWithRedirect.mockClear();
  });

  it('renders the Clerk SignIn component and Google button', () => {
    render(<SignInPage />);

    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('calls authenticateWithRedirect with oidcPrompt on Google click', async () => {
    render(<SignInPage />);

    fireEvent.click(screen.getByText('Continue with Google'));

    expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: '/sign-in/sso-callback',
      redirectUrlComplete: '/dashboard',
      oidcPrompt: 'select_account',
    });
  });

  it('hides social buttons via appearance prop', () => {
    render(<SignInPage />);

    const signIn = screen.getByTestId('clerk-sign-in');
    const appearance = JSON.parse(signIn.getAttribute('data-appearance') || '{}');
    expect(appearance.elements.socialButtons).toEqual({ display: 'none' });
    expect(appearance.elements.dividerRow).toEqual({ display: 'none' });
  });

  it('shows error message when Google auth fails', async () => {
    mockAuthenticateWithRedirect.mockRejectedValueOnce(new Error('Network error'));

    render(<SignInPage />);
    fireEvent.click(screen.getByText('Continue with Google'));

    expect(await screen.findByText('Unable to connect to Google. Please try again.')).toBeInTheDocument();
  });
});
