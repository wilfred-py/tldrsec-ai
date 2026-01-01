/**
 * Tests for the EmailStep component in the onboarding flow
 * This is Step 3 of the passwordless onboarding (sectors → equities → email)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailStep } from '@/components/onboarding/email-step';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

describe('EmailStep', () => {
  const mockOnEmailSubmit = jest.fn();
  const mockOnBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render email input field', () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL', 'TSLA']}
      />
    );

    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('should show validation error for empty email', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(mockOnEmailSubmit).not.toHaveBeenCalled();
  });

  it('should show validation error for invalid email format', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email/i);
    // Use email-like format that passes browser validation but fails our regex (no TLD)
    await userEvent.type(emailInput, 'user@domain');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    // The component shows "Please enter a valid email address"
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    });
    expect(mockOnEmailSubmit).not.toHaveBeenCalled();
  });

  it('should call onEmailSubmit with valid email', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email/i);
    await userEvent.type(emailInput, 'valid@example.com');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnEmailSubmit).toHaveBeenCalledWith('valid@example.com');
    });
  });

  it('should display selected tickers summary', () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL', 'TSLA', 'MSFT']}
      />
    );

    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    expect(screen.getByText(/TSLA/)).toBeInTheDocument();
    expect(screen.getByText(/MSFT/)).toBeInTheDocument();
  });

  it('should call onBack when back button clicked', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const backButton = screen.getByRole('button', { name: /back/i });
    await userEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should normalize email to lowercase and trim whitespace', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email/i);
    await userEvent.type(emailInput, '  Test@Example.COM  ');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnEmailSubmit).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('should show loading state when submitting', async () => {
    // Make onEmailSubmit return a promise that doesn't resolve immediately
    mockOnEmailSubmit.mockImplementation(() => new Promise(() => {}));

    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email/i);
    await userEvent.type(emailInput, 'test@example.com');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it('should disable inputs while loading', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
        isLoading={true}
      />
    );

    expect(screen.getByPlaceholderText(/email/i)).toBeDisabled();
    // When isLoading=true, button shows "Processing..." not "Continue"
    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });
});
