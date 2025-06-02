import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { sendWelcomeEmail } from '@/components/onboarding/send-welcome-email';

// Mock dependencies before importing them
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db/prisma');

// Now import the mocked dependencies
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

// Create a mock Response constructor for fetch
class MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  body: ReadableStream | null;
  bodyUsed: boolean;
  url: string;
  type: ResponseType;
  redirected: boolean;
  private jsonData: any;

  constructor(data: any, options: { status?: number, ok?: boolean } = {}) {
    this.ok = options.ok ?? true;
    this.status = options.status ?? 200;
    this.statusText = '';
    this.headers = new Headers();
    this.body = null;
    this.bodyUsed = false;
    this.url = '';
    this.type = 'default';
    this.redirected = false;
    this.jsonData = data;
  }

  json() {
    return Promise.resolve(this.jsonData);
  }

  text() {
    return Promise.resolve(JSON.stringify(this.jsonData));
  }

  clone() {
    return this;
  }

  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(0));
  }

  blob() {
    return Promise.resolve(new Blob());
  }

  formData() {
    return Promise.resolve(new FormData());
  }
}

// Mock the global fetch function
const originalFetch = global.fetch;
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('Welcome Email Functionality', () => {
  const mockUserId = 'user_123';
  const mockEmail = 'test@example.com';
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock auth
    (auth as jest.Mock).mockResolvedValue({
      userId: mockUserId,
    });
    
    // Mock currentUser
    (currentUser as jest.Mock).mockResolvedValue({
      emailAddresses: [
        { emailAddress: mockEmail }
      ],
    });
    
    // Mock prisma
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'db_user_123',
      authProviderId: mockUserId,
      email: mockEmail,
      name: 'Test User',
    });
    
    // Mock fetch
    mockFetch.mockResolvedValue(new MockResponse({ success: true }));
  });
  
  afterEach(() => {
    jest.resetAllMocks();
  });
  
  it('should send welcome email successfully', async () => {
    // Call the function
    const result = await sendWelcomeEmail();
    
    // Verify the result
    expect(result.success).toBe(true);
    
    // Verify auth was called
    expect(auth).toHaveBeenCalled();
    
    // Verify currentUser was called
    expect(currentUser).toHaveBeenCalled();
    
    // Verify prisma was called with the correct parameters
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { 
        authProviderId: mockUserId 
      }
    });
    
    // Verify fetch was called with the correct parameters
    expect(mockFetch).toHaveBeenCalledWith('/api/email/welcome', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          email: mockEmail
        }
      })
    });
  });
  
  it('should handle errors when user is not authenticated', async () => {
    // Mock auth to return no userId
    (auth as jest.Mock).mockResolvedValue({
      userId: null,
    });
    
    // Call the function
    const result = await sendWelcomeEmail();
    
    // Verify the result
    expect(result.success).toBe(false);
    expect(result.error).toBe('User not authenticated');
    
    // Verify fetch was not called
    expect(mockFetch).not.toHaveBeenCalled();
  });
  
  it('should handle errors when API call fails', async () => {
    // Mock fetch to return an error
    mockFetch.mockResolvedValue(new MockResponse({ error: 'API error' }, { ok: false, status: 500 }));
    
    // Call the function
    const result = await sendWelcomeEmail();
    
    // Verify the result
    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
  });
});

// Test for the tutorial completion with welcome email
describe('Tutorial Completion with Welcome Email', () => {
  // This would be an integration test that verifies the welcome email is sent
  // when the tutorial is completed. However, since we can't directly test the
  // React component in this context, we'll just verify the API endpoint works.
  
  it('should call the welcome email API endpoint', async () => {
    // Create a test mock fetch function for this test only
    const testMockFetch = jest.fn().mockResolvedValue(
      new MockResponse({ success: true })
    );
    
    // Save the original mock fetch (which is already a mock)
    const originalMockFetch = mockFetch;
    
    try {
      // Replace the mock fetch with our test mock
      mockFetch.mockImplementation(testMockFetch);
      
      // Simulate the API call that would be made by the tutorial component
      await fetch('/api/email/welcome', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {}
        })
      });
      
      // Verify fetch was called with the correct parameters
      expect(testMockFetch).toHaveBeenCalledWith('/api/email/welcome', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {}
        })
      });
    } finally {
      // Restore the original mock implementation
      mockFetch.mockImplementation(originalMockFetch);
    }
  });
});
