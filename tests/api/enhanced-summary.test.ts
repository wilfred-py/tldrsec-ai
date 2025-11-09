/**
 * Enhanced Filing Summary API Route Tests
 * Tests SEC filing processing, AI summarization, and error handling
 */

import { POST } from '../../app/api/filings/enhanced-summary/route';
import { NextRequest } from 'next/server';
import { EnhancedClaudeClient } from '../../lib/ai/enhanced-claude-client';
import { secFilingParser } from '../../lib/parsers/sec-filing-parser';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '../../lib/db/prisma';

// Mock dependencies
jest.mock('../../lib/ai/enhanced-claude-client');
jest.mock('../../lib/parsers/sec-filing-parser');
jest.mock('@clerk/nextjs/server');
jest.mock('../../lib/db/prisma');
jest.mock('../../lib/logging');

describe('/api/filings/enhanced-summary', () => {
  let mockRequest: Partial<NextRequest>;
  const mockClaudeClient = {
    sendMessage: jest.fn(),
    processBatch: jest.fn()
  };
  const mockPrisma = {
    user: {
      findUnique: jest.fn()
    },
    secFiling: {
      findUnique: jest.fn()
    },
    summary: {
      create: jest.fn(),
      findUnique: jest.fn()
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    (EnhancedClaudeClient as jest.MockedClass<typeof EnhancedClaudeClient>)
      .mockImplementation(() => mockClaudeClient as any);
    
    (getPrismaClient as jest.Mock).mockResolvedValue(mockPrisma);
    
    (auth as jest.Mock).mockReturnValue({
      userId: 'test-user-id'
    });
    
    mockRequest = {
      json: jest.fn(),
      headers: new Headers(),
      url: 'http://localhost:3000/api/filings/enhanced-summary'
    };
  });

  describe('POST /api/filings/enhanced-summary', () => {
    test('should generate enhanced summary for valid filing', async () => {
      const requestData = {
        filingId: 'test-filing-id',
        enhancementType: 'comprehensive',
        includeCharts: true
      };
      
      (mockRequest.json as jest.Mock).mockResolvedValue(requestData);
      
      // Mock database responses
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      mockPrisma.secFiling.findUnique.mockResolvedValue({
        id: 'test-filing-id',
        documentType: '10-K',
        content: 'SEC filing content for analysis...',
        companyName: 'Test Corporation',
        ticker: 'TEST'
      });
      
      // Mock parser response
      (secFilingParser.parseDocument as jest.Mock).mockResolvedValue({
        extractedSections: {
          'business-overview': 'Business overview content...',
          'risk-factors': 'Risk factors content...',
          'financial-statements': 'Financial data...'
        },
        metadata: {
          documentType: '10-K',
          totalPages: 150,
          wordCount: 45000
        }
      });
      
      // Mock AI response
      const mockAIResponse = {
        content: JSON.stringify({
          executiveSummary: 'Comprehensive analysis of Test Corporation...',
          keyFindings: ['Strong revenue growth', 'Improved margins'],
          riskAssessment: 'Moderate risk profile with stable fundamentals',
          investmentImplications: 'Positive outlook for value investors',
          charts: {
            revenueGrowth: { type: 'line', data: [1, 2, 3, 4, 5] }
          }
        }),
        inputTokens: 15000,
        outputTokens: 2500,
        cost: 0.045
      };
      
      mockClaudeClient.sendMessage.mockResolvedValue(mockAIResponse);
      
      // Mock summary creation
      mockPrisma.summary.create.mockResolvedValue({
        id: 'summary-id',
        content: mockAIResponse.content,
        createdAt: new Date()
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary.executiveSummary).toContain('Test Corporation');
      expect(result.summary.charts).toBeDefined();
      expect(result.metadata.inputTokens).toBe(15000);
      expect(result.metadata.cost).toBe(0.045);
    });

    test('should require user authentication', async () => {
      (auth as jest.Mock).mockReturnValue({ userId: null });
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id'
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(401);
      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication');
    });

    test('should validate subscription tier for enhanced features', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id',
        enhancementType: 'comprehensive'
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'basic' }
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(403);
      expect(result.success).toBe(false);
      expect(result.error).toContain('upgrade required');
    });

    test('should handle non-existent filing gracefully', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'non-existent-filing'
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      mockPrisma.secFiling.findUnique.mockResolvedValue(null);
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(404);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Filing not found');
    });

    test('should handle parser failures with fallback', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id'
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      mockPrisma.secFiling.findUnique.mockResolvedValue({
        id: 'test-filing-id',
        documentType: '10-K',
        content: 'Corrupted filing content',
        companyName: 'Test Corporation'
      });
      
      // Mock parser failure
      (secFilingParser.parseDocument as jest.Mock).mockRejectedValue(
        new Error('Document parsing failed')
      );
      
      // Mock fallback AI processing
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: 'Basic summary from raw content',
          keyFindings: ['Limited analysis due to parsing issues'],
          parseError: true
        }),
        inputTokens: 5000,
        outputTokens: 1000,
        cost: 0.015
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.summary.parseError).toBe(true);
      expect(result.summary.executiveSummary).toContain('Basic summary');
    });

    test('should implement caching for repeated requests', async () => {
      const requestData = {
        filingId: 'test-filing-id',
        enhancementType: 'standard'
      };
      
      (mockRequest.json as jest.Mock).mockResolvedValue(requestData);
      
      // Mock existing summary
      mockPrisma.summary.findUnique.mockResolvedValue({
        id: 'existing-summary-id',
        content: JSON.stringify({
          executiveSummary: 'Cached summary content',
          keyFindings: ['Cached finding 1', 'Cached finding 2']
        }),
        createdAt: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.summary.executiveSummary).toContain('Cached summary');
      expect(result.fromCache).toBe(true);
      expect(mockClaudeClient.sendMessage).not.toHaveBeenCalled();
    });

    test('should handle large filing documents with chunking', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'large-filing-id'
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      // Mock large filing
      mockPrisma.secFiling.findUnique.mockResolvedValue({
        id: 'large-filing-id',
        documentType: '10-K',
        content: 'Very long filing content...'.repeat(10000), // Simulate large content
        companyName: 'Large Corporation'
      });
      
      (secFilingParser.parseDocument as jest.Mock).mockResolvedValue({
        extractedSections: {
          'business-overview': 'Long business overview...'.repeat(1000),
          'risk-factors': 'Extensive risk factors...'.repeat(1000)
        },
        metadata: { documentType: '10-K', totalPages: 500, wordCount: 150000 }
      });
      
      // Mock batch processing for chunks
      mockClaudeClient.processBatch.mockResolvedValue({
        successes: [
          { content: JSON.stringify({ section: 'business', summary: 'Business summary' }) },
          { content: JSON.stringify({ section: 'risks', summary: 'Risk summary' }) }
        ],
        errors: []
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(mockClaudeClient.processBatch).toHaveBeenCalled();
      expect(result.metadata.chunkingUsed).toBe(true);
    });

    test('should validate enhancement type options', async () => {
      const validTypes = ['standard', 'comprehensive', 'investor-focused', 'risk-analysis'];
      const invalidType = 'crypto-analysis';
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      // Test valid types
      for (const enhancementType of validTypes) {
        (mockRequest.json as jest.Mock).mockResolvedValue({
          filingId: 'test-filing-id',
          enhancementType
        });
        
        mockPrisma.secFiling.findUnique.mockResolvedValue({
          id: 'test-filing-id',
          documentType: '10-K',
          content: 'Test content'
        });
        
        (secFilingParser.parseDocument as jest.Mock).mockResolvedValue({
          extractedSections: { 'business': 'Business content' }
        });
        
        mockClaudeClient.sendMessage.mockResolvedValue({
          content: JSON.stringify({ summary: `${enhancementType} analysis` })
        });
        
        const response = await POST(mockRequest as NextRequest);
        expect(response.status).toBe(200);
      }
      
      // Test invalid type
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id',
        enhancementType: invalidType
      });
      
      const response = await POST(mockRequest as NextRequest);
      expect(response.status).toBe(400);
    });

    test('should track token usage and costs accurately', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id'
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      mockPrisma.secFiling.findUnique.mockResolvedValue({
        id: 'test-filing-id',
        documentType: '10-Q',
        content: 'Filing content',
        companyName: 'Test Corp'
      });
      
      (secFilingParser.parseDocument as jest.Mock).mockResolvedValue({
        extractedSections: { 'financial': 'Financial data' }
      });
      
      const mockAIResponse = {
        content: JSON.stringify({ summary: 'AI analysis' }),
        inputTokens: 8500,
        outputTokens: 1800,
        cost: 0.028,
        model: 'claude-3-haiku-20240307'
      };
      
      mockClaudeClient.sendMessage.mockResolvedValue(mockAIResponse);
      
      mockPrisma.summary.create.mockResolvedValue({
        id: 'summary-id',
        content: mockAIResponse.content
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(result.metadata).toEqual({
        inputTokens: 8500,
        outputTokens: 1800,
        cost: 0.028,
        model: 'claude-3-haiku-20240307',
        userId: 'test-user-id',
        filingId: 'test-filing-id'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle AI service outages gracefully', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id'
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        subscription: { tier: 'pro' }
      });
      
      mockPrisma.secFiling.findUnique.mockResolvedValue({
        id: 'test-filing-id',
        documentType: '10-K',
        content: 'Filing content'
      });
      
      (secFilingParser.parseDocument as jest.Mock).mockResolvedValue({
        extractedSections: { 'business': 'Business content' }
      });
      
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('AI service unavailable'));
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(503);
      expect(result.success).toBe(false);
      expect(result.error).toContain('AI service');
      expect(result.retryAfter).toBeDefined();
    });

    test('should handle database connection failures', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        filingId: 'test-filing-id'
      });
      
      (getPrismaClient as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toContain('database');
    });
  });
});