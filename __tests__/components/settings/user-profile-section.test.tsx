import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import UserProfileSection from '@/components/settings/UserProfileSection';

const mockUser = {
  id: 'test-user-id',
  firstName: 'Test',
  lastName: 'User',
  emailAddresses: [{ emailAddress: 'test@example.com' }],
  createdAt: new Date('2025-01-01').getTime(),
} as any;

describe('UserProfileSection', () => {
  it('should display subscription tier dynamically (defaults to free)', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByText('free')).toBeInTheDocument();
    expect(screen.getByText('$0/month')).toBeInTheDocument();
  });

  it('should display PRO tier when passed', () => {
    render(<UserProfileSection user={mockUser} subscriptionTier="PRO" tickerCount={10} />);

    expect(screen.getByText('pro')).toBeInTheDocument();
    expect(screen.getByText('$29/month')).toBeInTheDocument();
    expect(screen.getByText(/Tracking 10 companies/)).toBeInTheDocument();
  });

  it('should render user profile information', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
  });

  it('should show subscription section with upgrade and billing buttons', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByText('Subscription')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    expect(screen.getByText('Manage Billing')).toBeInTheDocument();
  });

  it('should show delete and export account buttons', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByText('Export Account Data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Account/i })).toBeInTheDocument();
  });

  it('should not show upgrade button for MAX tier', () => {
    render(<UserProfileSection user={mockUser} subscriptionTier="MAX" />);

    expect(screen.queryByText('Upgrade to Pro')).not.toBeInTheDocument();
    expect(screen.queryByText('Upgrade to Max')).not.toBeInTheDocument();
    expect(screen.getByText('Manage Billing')).toBeInTheDocument();
  });
});
