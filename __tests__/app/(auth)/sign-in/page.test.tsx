import React from 'react';
import { render, screen } from '@testing-library/react';
import SignInPage from '@/app/(auth)/sign-in/[[...sign-in]]/page';

// Mock the Clerk SignIn component
jest.mock('@clerk/nextjs', () => ({
  SignIn: () => <div data-testid="clerk-sign-in">Clerk SignIn Component</div>
}));

describe('SignInPage', () => {
  it('renders the Clerk SignIn component', () => {
    render(<SignInPage />);
    
    // Verify the Clerk SignIn component is rendered
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    
    // Verify the component is rendered within a container with expected styling
    const container = screen.getByTestId('clerk-sign-in').parentElement;
    expect(container).toHaveClass('flex', 'min-h-screen', 'items-center', 'justify-center');
  });
}); 