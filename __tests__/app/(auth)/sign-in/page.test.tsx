import React from 'react';
import { render, screen } from '@testing-library/react';
import SignInPage from '@/app/(auth)/sign-in/[[...sign-in]]/page';

jest.mock('@clerk/nextjs', () => ({
  SignIn: () => <div data-testid="clerk-sign-in">Clerk SignIn Component</div>,
}));

describe('SignInPage', () => {
  it('renders the Clerk SignIn component', () => {
    render(<SignInPage />);

    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
  });
});
