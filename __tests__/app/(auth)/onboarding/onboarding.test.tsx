import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../../test-utils';
import OnboardingPage from '../../../../app/(auth)/onboarding/page';
import { mockRouter, useRouter } from '../../../mocks/next-navigation-mock';
import { toast } from 'sonner';
import { setupOnboardingComponentMocks } from '../../../mocks/onboarding-components-mock';

// Mock the required components
setupOnboardingComponentMocks();

// Mock the server actions
jest.mock('../../../../app/(auth)/onboarding/actions', () => ({
  saveUserPreferences: jest.fn().mockResolvedValue({ success: true }),
  addTickerSubscription: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock the toast notifications
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Onboarding Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to sign-in if user is not authenticated', async () => {
    render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: false,
      isLoading: false,
    });

    // Loading state should be shown initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
    });
  });

  it('shows loading state while checking authentication', () => {
    render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: true,
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays the multi-step form when authenticated', async () => {
    render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    await waitFor(() => {
      expect(screen.getByText('Welcome to tldrSEC')).toBeInTheDocument();
      expect(screen.getByText('Let's set up your account to track SEC filings')).toBeInTheDocument();
    });

    // Check for multi-step form UI elements
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('completes step 1 (user profile) and moves to step 2', async () => {
    const { user } = render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    // Fill out form fields
    await user.type(screen.getByLabelText(/Full Name/i), 'John Doe');
    await user.type(screen.getByLabelText(/Job Title/i), 'Software Engineer');
    await user.type(screen.getByLabelText(/Company/i), 'Acme Corp');
    await user.type(screen.getByLabelText(/Bio/i), 'I am a software engineer interested in SEC filings.');

    // Check theme option
    const darkThemeRadio = screen.getByLabelText(/Dark/i);
    await user.click(darkThemeRadio);

    // Click the next button to go to step 2
    const nextButton = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton);

    // Verify we're now on step 2
    await waitFor(() => {
      expect(screen.getByText('Select companies to track')).toBeInTheDocument();
    });
  });

  it('completes step 2 (ticker selection) and moves to step 3', async () => {
    const { user } = render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    // Move to step 2 first
    const nextButton = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Select companies to track')).toBeInTheDocument();
    });

    // Add a ticker (mocking the behavior since the actual component might have async search)
    const tickerInput = screen.getByPlaceholderText(/Search for companies/i);
    await user.type(tickerInput, 'AAPL');
    
    // Assume the add button appears after typing
    const addButton = screen.getByRole('button', { name: /Add AAPL/i });
    await user.click(addButton);

    // Go to step 3
    const nextButton2 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton2);

    // Verify we're now on step 3
    await waitFor(() => {
      expect(screen.getByText('Set your notification preferences')).toBeInTheDocument();
    });
  });

  it('completes step 3 (notification preferences) and submits the form', async () => {
    const { user } = render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    // Move to step 3
    const nextButton1 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton1);
    
    const nextButton2 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton2);

    await waitFor(() => {
      expect(screen.getByText('Set your notification preferences')).toBeInTheDocument();
    });

    // Select notification preferences
    const immediateOption = screen.getByLabelText(/Immediate/i);
    await user.click(immediateOption);

    // Select filing types
    const form10kCheckbox = screen.getByLabelText(/10-K Annual Reports/i);
    await user.click(form10kCheckbox);

    // Submit the form
    const completeButton = screen.getByRole('button', { name: /Complete/i });
    await user.click(completeButton);

    // Verify server actions were called and user is redirected
    await waitFor(() => {
      // Check saveUserPreferences was called
      expect(require('../../../../app/(auth)/onboarding/actions').saveUserPreferences).toHaveBeenCalled();
      
      // Check we were redirected to dashboard
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows error message when server action fails', async () => {
    // Mock the server action to fail
    require('../../../../app/(auth)/onboarding/actions').saveUserPreferences.mockResolvedValueOnce({
      success: false,
      error: 'Failed to save preferences'
    });

    const { user } = render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    // Move to step 3 and submit
    const nextButton1 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton1);
    
    const nextButton2 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton2);

    const completeButton = screen.getByRole('button', { name: /Complete/i });
    await user.click(completeButton);

    // Check error handling
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to complete onboarding. Please try again.'
      );
    });
  });

  it('handles server errors gracefully', async () => {
    // Mock the server action to throw an error
    require('../../../../app/(auth)/onboarding/actions').saveUserPreferences.mockRejectedValueOnce(
      new Error('Server error')
    );

    const { user } = render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    // Move to step 3 and submit
    const nextButton1 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton1);
    
    const nextButton2 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton2);

    const completeButton = screen.getByRole('button', { name: /Complete/i });
    await user.click(completeButton);

    // Check error handling
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to complete onboarding. Please try again.'
      );
    });
  });

  it('preserves form data between steps', async () => {
    const { user } = render(<OnboardingPage />, { 
      withAuth: true, 
      isAuthenticated: true,
      isLoading: false,
    });

    // Fill step 1
    await user.type(screen.getByLabelText(/Full Name/i), 'John Doe');
    
    // Go to step 2
    const nextButton1 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton1);
    
    // Go to step 3
    const nextButton2 = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton2);
    
    // Go back to step 1
    const backButton1 = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton1);
    
    const backButton2 = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton2);
    
    // Check if data is preserved
    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toHaveValue('John Doe');
    });
  });
}); 