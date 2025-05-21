import { NextRequest, NextResponse } from 'next/server';
import { PreferenceService } from '@/lib/user/preference-service';
import { currentUser } from '@clerk/nextjs/server';
import { NotificationPreference } from '@/lib/email/notification-service';
import { UserPreferences } from '@/lib/user/preference-types';
import { GET, PATCH } from '@/app/api/user/preferences/route';

// Mock the currentUser function from Clerk
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn()
}));

// Mock the PreferenceService
jest.mock('@/lib/user/preference-service', () => ({
  PreferenceService: {
    getUserPreferences: jest.fn(),
    updateUserPreferences: jest.fn()
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
  
  constructor(body = {}) {
    super(new Request('https://example.com/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    this._body = body;
  }
  
  json() {
    return this._body;
  }
}

describe('User Preferences API', () => {
  const mockUserId = 'user-123';
  
  const mockPreferences: UserPreferences = {
    notifications: {
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
    },
    ui: {
      theme: 'light',
      dashboardLayout: 'compact'
    },
    subscriptions: [
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        overridePreferences: false
      }
    ]
  };
  
  beforeEach(() => {
    jest.resetAllMocks();
    // Setup default mock returns
    (currentUser as jest.Mock).mockResolvedValue({ id: mockUserId });
    (PreferenceService.getUserPreferences as jest.Mock).mockResolvedValue(mockPreferences);
    (PreferenceService.updateUserPreferences as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Preferences updated successfully',
      preferences: mockPreferences
    });
  });
  
  describe('GET /api/user/preferences', () => {
    it('should return user preferences for authenticated user', async () => {
      // Mock request
      const request = new NextRequest(new Request('https://example.com/api/user/preferences'));
      
      // Call handler
      const response = await GET(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.preferences).toEqual(mockPreferences);
      
      // Verify mock calls
      expect(currentUser).toHaveBeenCalled();
      expect(PreferenceService.getUserPreferences).toHaveBeenCalledWith(mockUserId);
    });
    
    it('should return 401 if user is not authenticated', async () => {
      // Setup mock
      (currentUser as jest.Mock).mockResolvedValue(null);
      
      // Mock request
      const request = new NextRequest(new Request('https://example.com/api/user/preferences'));
      
      // Call handler
      const response = await GET(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Unauthorized');
    });
    
    it('should handle errors from PreferenceService', async () => {
      // Setup mock
      (PreferenceService.getUserPreferences as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      // Mock request
      const request = new NextRequest(new Request('https://example.com/api/user/preferences'));
      
      // Call handler
      const response = await GET(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Database error');
    });
  });
  
  describe('PATCH /api/user/preferences', () => {
    it('should update user preferences', async () => {
      // Setup update data
      const updates = {
        notifications: {
          emailFrequency: NotificationPreference.IMMEDIATE
        }
      };
      
      // Mock request with update body
      const request = new MockNextRequest(updates);
      
      // Call handler
      const response = await PATCH(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Verify mock calls
      expect(currentUser).toHaveBeenCalled();
      expect(PreferenceService.updateUserPreferences).toHaveBeenCalledWith(mockUserId, updates);
    });
    
    it('should return 401 if user is not authenticated', async () => {
      // Setup mock
      (currentUser as jest.Mock).mockResolvedValue(null);
      
      // Mock request
      const request = new MockNextRequest();
      
      // Call handler
      const response = await PATCH(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Unauthorized');
    });
    
    it('should handle invalid JSON in request body', async () => {
      // Mock request with invalid JSON body
      const request = new NextRequest(new Request('https://example.com/api/user/preferences', {
        method: 'PATCH'
      }));
      
      // Override json method to throw error
      jest.spyOn(request, 'json').mockImplementation(() => {
        throw new Error('Invalid JSON');
      });
      
      // Call handler
      const response = await PATCH(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid JSON in request body');
    });
    
    it('should handle errors from PreferenceService', async () => {
      // Setup mock
      (PreferenceService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Invalid preference format'
      });
      
      // Mock request
      const request = new MockNextRequest({ invalid: 'data' });
      
      // Call handler
      const response = await PATCH(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid preference format');
    });
  });
}); 