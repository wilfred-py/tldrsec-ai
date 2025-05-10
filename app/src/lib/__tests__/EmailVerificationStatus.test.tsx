// File: app/src/components/auth/__tests__/EmailVerificationStatus.test.tsx

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EmailVerificationStatus from '@/components/auth/EmailVerificationStatus';
import { useUser } from '@clerk/nextjs';
import { useAuth } from '@/hooks/useAuth';

// Mock hooks
jest.mock('@clerk/nextjs', () => ({
  useUser: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('EmailVerificationStatus Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading state initially', () => {
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: false,
    });
    
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: null,
      refetch: jest.fn(),
    });

    const { container } = render(<EmailVerificationStatus />);
    
    // Check for the skeleton loading UI using the animate-pulse class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('should show error state when verification check fails', async () => {
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: {
        id: 'user_123',
        primaryEmailAddress: {
          emailAddress: 'test@example.com',
        },
      },
    });
    
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'test@example.com',
      },
      refetch: jest.fn(),
    });

    // Mock fetch to return error
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<EmailVerificationStatus />);
    
    // Wait for fetch to complete
    await waitFor(() => {
      const errorElement = screen.getByText(/error/i);
      expect(errorElement).toBeInTheDocument();
    });
  });

  it('should show verified state when email is verified', async () => {
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: {
        id: 'user_123',
        primaryEmailAddress: {
          emailAddress: 'test@example.com',
        },
      },
    });
    
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'test@example.com',
      },
      refetch: jest.fn(),
    });

    // Mock fetch to return verified status
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        isVerified: {
          clerk: true,
          database: true,
        },
      }),
    });

    render(<EmailVerificationStatus />);
    
    // Wait for fetch to complete
    await waitFor(() => {
      const verifiedElement = screen.getByText(/email verified/i);
      expect(verifiedElement).toBeInTheDocument();
    });
  });

  it('should show sync required state when clerk verified but not database', async () => {
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: {
        id: 'user_123',
        primaryEmailAddress: {
          emailAddress: 'test@example.com',
        },
      },
    });
    
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'test@example.com',
      },
      refetch: jest.fn(),
    });

    // Mock fetch to return partially verified status
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        isVerified: {
          clerk: true,
          database: false,
        },
      }),
    });

    render(<EmailVerificationStatus />);
    
    // Wait for fetch to complete
    await waitFor(() => {
      const syncElement = screen.getByText(/sync required/i);
      expect(syncElement).toBeInTheDocument();
      
      const syncButton = screen.getByRole('button', { name: /sync verification status/i });
      expect(syncButton).toBeInTheDocument();
    });
  });

  it('should show verification required state when not verified', async () => {
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: {
        id: 'user_123',
        primaryEmailAddress: {
          emailAddress: 'test@example.com',
          prepareVerification: jest.fn().mockResolvedValue({}),
        },
      },
    });
    
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'test@example.com',
      },
      refetch: jest.fn(),
    });

    // Mock fetch to return unverified status
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        isVerified: {
          clerk: false,
          database: false,
        },
      }),
    });

    render(<EmailVerificationStatus />);
    
    // Wait for fetch to complete
    await waitFor(() => {
      const verificationButton = screen.getByText(/send verification email/i);
      expect(verificationButton).toBeInTheDocument();
    });
  });
  
  it('should call prepareVerification when Send Verification Email is clicked', async () => {
    // Mock the prepareVerification function
    const mockPrepareVerification = jest.fn().mockResolvedValue({});
    
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: {
        id: 'user_123',
        primaryEmailAddress: {
          emailAddress: 'test@example.com',
          prepareVerification: mockPrepareVerification,
        },
      },
    });
    
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'test@example.com',
      },
      refetch: jest.fn(),
    });

    // Mock fetch to return unverified status
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        isVerified: {
          clerk: false,
          database: false,
        },
      }),
    });

    render(<EmailVerificationStatus />);
    
    // Wait for fetch to complete
    await waitFor(() => {
      const verificationButton = screen.getByText(/send verification email/i);
      expect(verificationButton).toBeInTheDocument();
    });
    
    // Click the verification button
    fireEvent.click(screen.getByRole('button', { name: /send verification email/i }));
    
    // Check that prepareVerification was called
    await waitFor(() => {
      expect(mockPrepareVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      });
    });
  });

  it('should call sync endpoint when Sync Verification Status is clicked', async () => {
    // Mock hooks
    (useUser as unknown as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: {
        id: 'user_123',
        primaryEmailAddress: {
          emailAddress: 'test@example.com',
        },
      },
    });
    
    const mockRefetch = jest.fn();
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: {
        userId: 'user_123',
        userEmail: 'test@example.com',
      },
      refetch: mockRefetch,
    });

    // Mock initial fetch to return partially verified status
    (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        isVerified: {
          clerk: true,
          database: false,
        },
      }),
    });

    // Mock the sync endpoint
    (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
      }),
    });

    // Mock the verification check after sync
    (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        isVerified: {
          clerk: true,
          database: true,
        },
      }),
    });

    render(<EmailVerificationStatus />);
    
    // Wait for fetch to complete
    await waitFor(() => {
      const syncButton = screen.getByRole('button', { name: /sync verification status/i });
      expect(syncButton).toBeInTheDocument();
    });
    
    // Click the sync button
    fireEvent.click(screen.getByRole('button', { name: /sync verification status/i }));
    
    // Check that fetch was called with POST method
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/verification', {
        method: 'POST',
      });
    });
    
    // Check that refetch was called
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
    
    // Check that the status was updated
    await waitFor(() => {
      const verifiedElement = screen.getByText(/email verified/i);
      expect(verifiedElement).toBeInTheDocument();
    });
  });
});