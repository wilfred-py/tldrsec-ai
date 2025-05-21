import { NextRequest, NextResponse } from 'next/server';
import { PreferenceService } from '@/lib/user/preference-service';
import { currentUser } from '@clerk/nextjs/server';
import { NotificationPreference } from '@/lib/email/notification-service';
import { TickerSubscription } from '@/lib/user/preference-types';
import { GET, POST, PATCH, DELETE } from '@/app/api/user/subscriptions/route';

// Mock the currentUser function from Clerk
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn()
}));

// Mock the PreferenceService
jest.mock('@/lib/user/preference-service', () => ({
  PreferenceService: {
    getUserSubscriptions: jest.fn(),
    addSubscription: jest.fn(),
    updateSubscription: jest.fn(),
    removeSubscription: jest.fn()
  }
}));

// Mock the logger
jest.mock('@/lib/logging', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    })
  }
}));

// Mock the monitoring module
jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn()
  }
}));

// Mock NextRequest
class MockNextRequest extends NextRequest {
  private _body: any;
  
  constructor(body = {}, method = 'POST') {
    super(new Request(`https://example.com/api/user/subscriptions`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    this._body = body;
  }
  
  json() {
    return this._body;
  }
}

describe('User Subscriptions API', () => {
  const mockUserId = 'user-123';
  
  const mockSubscriptions: TickerSubscription[] = [
    {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      overridePreferences: false
    },
    {
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      overridePreferences: true,
      notificationPreferences: {
        emailFrequency: NotificationPreference.DAILY,
        filingTypes: {
          form10K: true,
          form10Q: true,
          form8K: true,
          form4: false,
          otherFilings: false
        },
        contentPreferences: {
          includeSummary: true,
          includeFilingDetails: false,
          includeAnalysis: false
        }
      }
    }
  ];
  
  beforeEach(() => {
    jest.resetAllMocks();
    // Setup default mock returns
    (currentUser as jest.Mock).mockResolvedValue({ id: mockUserId });
    (PreferenceService.getUserSubscriptions as jest.Mock).mockResolvedValue(mockSubscriptions);
    (PreferenceService.addSubscription as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Subscription added successfully',
      subscriptions: [...mockSubscriptions, {
        symbol: 'GOOG',
        companyName: 'Alphabet Inc.',
        overridePreferences: false
      }]
    });
    (PreferenceService.updateSubscription as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Subscription updated successfully',
      subscriptions: mockSubscriptions
    });
    (PreferenceService.removeSubscription as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Subscription removed successfully',
      subscriptions: mockSubscriptions.slice(1)
    });
  });
  
  describe('GET /api/user/subscriptions', () => {
    it('should return user subscriptions for authenticated user', async () => {
      // Mock request
      const request = new NextRequest(new Request('https://example.com/api/user/subscriptions'));
      
      // Call handler
      const response = await GET(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.subscriptions).toEqual(mockSubscriptions);
      
      // Verify mock calls
      expect(currentUser).toHaveBeenCalled();
      expect(PreferenceService.getUserSubscriptions).toHaveBeenCalledWith(mockUserId);
    });
    
    it('should return 401 if user is not authenticated', async () => {
      // Setup mock
      (currentUser as jest.Mock).mockResolvedValue(null);
      
      // Mock request
      const request = new NextRequest(new Request('https://example.com/api/user/subscriptions'));
      
      // Call handler
      const response = await GET(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Unauthorized');
    });
  });
  
  describe('POST /api/user/subscriptions', () => {
    it('should add a new subscription', async () => {
      // Mock request
      const request = new MockNextRequest({
        symbol: 'GOOG',
        companyName: 'Alphabet Inc.'
      });
      
      // Call handler
      const response = await POST(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Subscription added successfully');
      expect(data.subscriptions).toHaveLength(3);
      
      // Verify mock calls
      expect(currentUser).toHaveBeenCalled();
      expect(PreferenceService.addSubscription).toHaveBeenCalledWith(
        mockUserId,
        'GOOG',
        'Alphabet Inc.',
        false,
        undefined
      );
    });
    
    it('should validate required fields', async () => {
      // Mock request with missing fields
      const request = new MockNextRequest({
        // Missing companyName
        symbol: 'GOOG'
      });
      
      // Call handler
      const response = await POST(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toContain('Missing required fields');
    });
    
    it('should handle invalid JSON', async () => {
      // Mock request with invalid JSON
      const request = new NextRequest(new Request('https://example.com/api/user/subscriptions', {
        method: 'POST'
      }));
      
      // Override json method to throw error
      jest.spyOn(request, 'json').mockImplementation(() => {
        throw new Error('Invalid JSON');
      });
      
      // Call handler
      const response = await POST(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid JSON in request body');
    });
  });
  
  describe('PATCH /api/user/subscriptions', () => {
    it('should update an existing subscription', async () => {
      // Mock request
      const request = new MockNextRequest({
        symbol: 'AAPL',
        overridePreferences: true,
        notificationPreferences: {
          emailFrequency: NotificationPreference.IMMEDIATE
        }
      }, 'PATCH');
      
      // Call handler
      const response = await PATCH(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Verify mock calls
      expect(currentUser).toHaveBeenCalled();
      expect(PreferenceService.updateSubscription).toHaveBeenCalledWith(
        mockUserId,
        'AAPL',
        true,
        { emailFrequency: NotificationPreference.IMMEDIATE }
      );
    });
    
    it('should validate required fields', async () => {
      // Mock request with missing fields
      const request = new MockNextRequest({
        // Missing overridePreferences
        symbol: 'AAPL'
      }, 'PATCH');
      
      // Call handler
      const response = await PATCH(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toContain('Missing required fields');
    });
  });
  
  describe('DELETE /api/user/subscriptions', () => {
    it('should remove a subscription', async () => {
      // Mock URL with query parameter
      const url = new URL('https://example.com/api/user/subscriptions');
      url.searchParams.set('symbol', 'AAPL');
      
      // Mock request
      const request = new NextRequest(new Request(url, {
        method: 'DELETE'
      }));
      
      // Call handler
      const response = await DELETE(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Verify mock calls
      expect(currentUser).toHaveBeenCalled();
      expect(PreferenceService.removeSubscription).toHaveBeenCalledWith(
        mockUserId,
        'AAPL'
      );
    });
    
    it('should validate required query parameters', async () => {
      // Mock request without symbol parameter
      const request = new NextRequest(new Request('https://example.com/api/user/subscriptions', {
        method: 'DELETE'
      }));
      
      // Call handler
      const response = await DELETE(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toContain('Missing required parameter');
    });
    
    it('should handle not found subscription', async () => {
      // Setup mock to return not found
      (PreferenceService.removeSubscription as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Subscription not found for symbol: NONEXISTENT',
        subscriptions: mockSubscriptions
      });
      
      // Mock URL with query parameter
      const url = new URL('https://example.com/api/user/subscriptions');
      url.searchParams.set('symbol', 'NONEXISTENT');
      
      // Mock request
      const request = new NextRequest(new Request(url, {
        method: 'DELETE'
      }));
      
      // Call handler
      const response = await DELETE(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.message).toContain('not found');
    });
  });
}); 