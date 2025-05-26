import React from 'react';
import { render, screen } from '@testing-library/react';
import SignUpPage from '@/app/(auth)/sign-up/[[...sign-up]]/page';

// Mock the Clerk SignUp component
jest.mock('@clerk/nextjs', () => ({
  SignUp: () => <div data-testid="clerk-sign-up">Clerk SignUp Component</div>
}));

describe('SignUpPage', () => {
  it('renders the Clerk SignUp component', () => {
    render(<SignUpPage />);
    
    // Verify the Clerk SignUp component is rendered
    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    
    // Verify the component is rendered within a container with expected styling
    const container = screen.getByTestId('clerk-sign-up').parentElement;
    expect(container).toHaveClass('flex', 'min-h-screen', 'items-center', 'justify-center');
  });
}); 