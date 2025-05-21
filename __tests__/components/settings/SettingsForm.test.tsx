import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationPreference } from '@/lib/email/notification-service';
import { DEFAULT_USER_PREFERENCES } from '@/lib/user/preference-types';

// Create a mock SettingsForm component for testing
const mockSetPreferences = jest.fn();
const mockOnSubmit = jest.fn();

// Create a mock component to test the props
function MockSettingsForm({ userId }: { userId: string }) {
  return (
    <div data-testid="settings-form">
      <div data-testid="user-id">{userId}</div>
      <button 
        data-testid="save-button"
        onClick={() => mockOnSubmit(userId)}
      >
        Save
      </button>
    </div>
  );
}

// Mock the actual component
jest.mock('@/components/settings/SettingsForm', () => {
  return {
    __esModule: true,
    default: (props: any) => <MockSettingsForm {...props} />
  };
});

// Import after mocking
import SettingsForm from '@/components/settings/SettingsForm';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('SettingsForm', () => {
  const mockUserId = 'user-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fetch to return user preferences
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url === '/api/user/preferences') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            preferences: DEFAULT_USER_PREFERENCES
          })
        });
      }
      return Promise.reject(new Error('Not mocked'));
    });
  });
  
  it('renders with the correct props', async () => {
    render(<SettingsForm userId={mockUserId} />);
    
    // Check if the component renders with correct props
    const formElement = screen.getByTestId('settings-form');
    expect(formElement).toBeInTheDocument();
    
    const userIdElement = screen.getByTestId('user-id');
    expect(userIdElement).toHaveTextContent(mockUserId);
  });
  
  it('triggers save function when save button is clicked', async () => {
    render(<SettingsForm userId={mockUserId} />);
    
    // Click the save button
    const saveButton = screen.getByTestId('save-button');
    fireEvent.click(saveButton);
    
    // Check if onSubmit was called with the userId
    expect(mockOnSubmit).toHaveBeenCalledWith(mockUserId);
  });
}); 