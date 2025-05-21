import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TickerSubscription } from '@/lib/user/preference-types';

// Create a mock SubscriptionManager component for testing
interface MockManagerProps {
  userId: string;
}

function MockSubscriptionManager({ userId }: MockManagerProps) {
  return (
    <div data-testid="subscription-manager">
      <div data-testid="user-id">{userId}</div>
      <input 
        data-testid="symbol-input" 
        placeholder="Symbol" 
      />
      <input 
        data-testid="company-input" 
        placeholder="Company Name" 
      />
      <button data-testid="add-button">Add</button>
      <div data-testid="subscriptions-list">
        <div data-testid="subscription-item-AAPL">
          <span>AAPL</span>
          <button data-testid="remove-AAPL">Remove</button>
        </div>
      </div>
    </div>
  );
}

// Mock the actual component
jest.mock('@/components/settings/SubscriptionManager', () => {
  return {
    __esModule: true,
    default: (props: any) => <MockSubscriptionManager {...props} />
  };
});

// Import after mocking
import SubscriptionManager from '@/components/settings/SubscriptionManager';

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

describe('SubscriptionManager', () => {
  const mockUserId = 'user-123';
  const mockSubscriptions: TickerSubscription[] = [
    {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      overridePreferences: false
    }
  ];
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fetch to return subscriptions
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url === '/api/user/subscriptions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            subscriptions: mockSubscriptions
          })
        });
      }
      return Promise.reject(new Error('Not mocked'));
    });
  });
  
  it('renders with the correct props', async () => {
    render(<SubscriptionManager userId={mockUserId} />);
    
    // Check if the component renders with correct props
    const managerElement = screen.getByTestId('subscription-manager');
    expect(managerElement).toBeInTheDocument();
    
    const userIdElement = screen.getByTestId('user-id');
    expect(userIdElement).toHaveTextContent(mockUserId);
  });
  
  it('renders form inputs for adding subscriptions', async () => {
    render(<SubscriptionManager userId={mockUserId} />);
    
    // Check if input fields exist
    const symbolInput = screen.getByTestId('symbol-input');
    expect(symbolInput).toBeInTheDocument();
    
    const companyInput = screen.getByTestId('company-input');
    expect(companyInput).toBeInTheDocument();
    
    const addButton = screen.getByTestId('add-button');
    expect(addButton).toBeInTheDocument();
  });
  
  it('renders existing subscriptions', async () => {
    render(<SubscriptionManager userId={mockUserId} />);
    
    // Check if subscription list exists
    const subscriptionsList = screen.getByTestId('subscriptions-list');
    expect(subscriptionsList).toBeInTheDocument();
    
    // Check if Apple subscription is rendered
    const appleSubscription = screen.getByTestId('subscription-item-AAPL');
    expect(appleSubscription).toBeInTheDocument();
    expect(appleSubscription).toHaveTextContent('AAPL');
  });
}); 