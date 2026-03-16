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
  it('should display "Trial" not "Free Plan" in subscription section', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.queryByText('Free Plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });

  it('should render user profile information', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
  });

  it('should show subscription section with upgrade button', () => {
    render(<UserProfileSection user={mockUser} />);

    expect(screen.getByText('Subscription')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    expect(screen.getByText('View Plans')).toBeInTheDocument();
  });
});
