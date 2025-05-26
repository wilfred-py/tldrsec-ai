import React from 'react';
import { render, screen } from '@testing-library/react';
import VerifyEmailPage from '@/app/(auth)/verify-email/[[...verify-email]]/page';

// Mock the Clerk components
jest.mock('@clerk/nextjs', () => ({
  SignUp: () => <div data-testid="clerk-sign-up">Clerk SignUp Component</div>
}));

describe('VerifyEmailPage', () => {
  it('renders the Clerk SignUp component', () => {
    render(<VerifyEmailPage />);
    
    // Verify the SignUp component is rendered
    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    
    // Verify the component is rendered within a container with expected styling
    const container = screen.getByTestId('clerk-sign-up').parentElement;
    expect(container).toHaveClass('flex', 'min-h-screen', 'items-center', 'justify-center');
  });
}); 