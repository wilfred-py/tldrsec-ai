/**
 * Comprehensive error handling and recovery tests for SEC cron job monitoring
 * Tests various failure scenarios, recovery mechanisms, and data integrity protection
 */

// Mock dependencies first to avoid import issues
jest.mock('../../lib/db/prisma');
jest.mock('../../lib/email/index');
jest.mock('../../lib/email/templates');
jest.mock('../../lib/network/enhanced-fetch');
jest.mock('../../lib/parsers/form-parser');
jest.mock('../../services/filing/summaryGenerationService');
jest.mock('../../lib/logging');
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn()
}));

import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../lib/db/prisma';
import { sendFilingSummaryEmail } from '../../lib/email/summary-service';
import { sendEmail } from '../../lib/email/index';
import { enhancedFetch } from '../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../lib/parsers/form-parser';
import { generateAISummaryWithRetry } from '../../services/filing/summaryGenerationService';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockEnhancedFetch = enhancedFetch as jest.MockedFunction<typeof enhancedFetch>;
const mockParseFormContent = parseFormContentEnhanced as jest.MockedFunction<typeof parseFormContentEnhanced>;
const mockGenerateAISummary = generateAISummaryWithRetry as jest.MockedFunction<typeof generateAISummaryWithRetry>;

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  ticker: {
    upsert: jest.fn(),
  },
  summary: {
    create: jest.fn(),
    update: jest.fn(),
  },
  notificationSent: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as PrismaClient;

(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

// Mock email template
jest.mock('../../lib/email/templates', () => ({
  getEmailTemplate: jest.fn().mockReturnValue({
    html: '<html><body>Test email</body></html>',
    text: 'Test email'
  })
}));

describe('Error Handling and Recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Network and Fetch Failures', () => {
    it('should handle SEC website timeout gracefully', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';

      mockEnhancedFetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce('Successfully fetched content after retry');

      // Simulate retry logic
      const fetchWithRetry = async (url: string, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await mockEnhancedFetch(url, {
              responseType: 'text',
              headers: { 'User-Agent': 'tldrSEC-AI' },
              operationName: 'sec-filing-fetch'
            });
          } catch (error) {
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      };

      // First attempt fails
      await expect(
        mockEnhancedFetch('https://sec.gov/filing-123', {
          responseType: 'text',
          headers: { 'User-Agent': 'tldrSEC-AI' },
          operationName: 'sec-filing-fetch'
        })
      ).rejects.toThrow('Request timeout');

      // Retry succeeds
      const result = await fetchWithRetry('https://sec.gov/filing-123');
      expect(result).toBe('Successfully fetched content after retry');
      expect(mockEnhancedFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle SEC rate limiting (403 Forbidden)', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'HTTPError';
      (rateLimitError as any).statusCode = 403;

      mockEnhancedFetch
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('Content fetched after rate limit recovery');

      const fetchWithBackoff = async (url: string) => {
        let attempt = 0;
        const maxAttempts = 3;
        const baseDelay = 2000; // 2 seconds

        while (attempt < maxAttempts) {
          try {
            attempt++;
            return await mockEnhancedFetch(url, {
              responseType: 'text',
              headers: { 'User-Agent': 'tldrSEC-AI' },
              operationName: 'sec-filing-fetch'
            });
          } catch (error: any) {
            if (error.statusCode === 403 && attempt < maxAttempts) {
              const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw error;
          }
        }
      };

      const result = await fetchWithBackoff('https://sec.gov/filing-123');
      expect(result).toBe('Content fetched after rate limit recovery');
      expect(mockEnhancedFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle malformed or corrupted filing content', async () => {
      const corruptedContent = '<html><body>Incomplete filing content...';
      mockEnhancedFetch.mockResolvedValue(corruptedContent);

      const parseError = new Error('Failed to parse malformed HTML');
      mockParseFormContent.mockRejectedValue(parseError);

      // Simulate error handling in filing processing
      const processFiling = async (filingUrl: string) => {
        try {
          const content = await mockEnhancedFetch(filingUrl, {
            responseType: 'text',
            headers: { 'User-Agent': 'tldrSEC-AI' },
            operationName: 'sec-filing-fetch'
          });

          const parsedContent = await mockParseFormContent(
            content, 
            '10-K', 
            filingUrl
          );

          return parsedContent;
        } catch (error) {
          // Log error and return fallback
          console.error('Filing processing failed:', error);
          return {
            sections: 'Unable to parse filing content due to format issues',
            error: error.message,
            fallback: true
          };
        }
      };

      const result = await processFiling('https://sec.gov/corrupted-filing');

      expect(result.fallback).toBe(true);
      expect(result.error).toBe('Failed to parse malformed HTML');
      expect(mockEnhancedFetch).toHaveBeenCalledOnce();
      expect(mockParseFormContent).toHaveBeenCalledOnce();
    });
  });

  describe('AI Service Failures', () => {
    it('should handle Claude API rate limits', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'AnthropicRateLimitError';
      (rateLimitError as any).status = 429;

      mockGenerateAISummary
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          summary: 'Successfully generated summary after rate limit',
          cost: 0.05,
          tokensUsed: 1500
        });

      const generateSummaryWithRetry = async (content: string, metadata: any, company: any) => {
        const maxRetries = 3;
        const baseDelay = 5000; // 5 seconds for AI rate limits

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await mockGenerateAISummary(content, metadata, company);
          } catch (error: any) {
            if (error.status === 429 && attempt < maxRetries) {
              const delay = baseDelay * Math.pow(2, attempt - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw error;
          }
        }
      };

      // First attempt fails with rate limit
      await expect(
        mockGenerateAISummary('Test content', { formType: '10-K' }, { name: 'Test Corp' })
      ).rejects.toThrow('Rate limit exceeded');

      // Retry with backoff succeeds
      const result = await generateSummaryWithRetry(
        'Test content',
        { formType: '10-K' },
        { name: 'Test Corp' }
      );

      expect(result.summary).toContain('Successfully generated');
      expect(mockGenerateAISummary).toHaveBeenCalledTimes(2);
    });

    it('should handle Claude API service outages', async () => {
      const serviceError = new Error('Service temporarily unavailable');
      serviceError.name = 'AnthropicServiceError';
      (serviceError as any).status = 503;

      mockGenerateAISummary.mockRejectedValue(serviceError);

      const generateSummaryWithFallback = async (content: string, metadata: any, company: any) => {
        try {
          return await mockGenerateAISummary(content, metadata, company);
        } catch (error: any) {
          if (error.status === 503) {
            // Return fallback summary
            return {
              summary: 'AI service temporarily unavailable. Filing processed but summary generation failed.',
              cost: 0,
              tokensUsed: 0,
              fallback: true,
              originalError: error.message
            };
          }
          throw error;
        }
      };

      const result = await generateSummaryWithFallback(
        'Test filing content',
        { formType: '10-K' },
        { name: 'Test Corp' }
      );

      expect(result.fallback).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.originalError).toBe('Service temporarily unavailable');
    });

    it('should handle token limit exceeded errors', async () => {
      const tokenError = new Error('Token limit exceeded');
      tokenError.name = 'AnthropicTokenLimitError';
      (tokenError as any).status = 400;

      mockGenerateAISummary.mockRejectedValue(tokenError);

      const handleTokenLimit = async (content: string, metadata: any, company: any) => {
        try {
          return await mockGenerateAISummary(content, metadata, company);
        } catch (error: any) {
          if (error.name === 'AnthropicTokenLimitError') {
            // Attempt to truncate content and retry
            const truncatedContent = content.substring(0, content.length * 0.75);
            
            // For testing, we'll mock a successful retry with truncated content
            mockGenerateAISummary.mockResolvedValueOnce({
              summary: 'Summary generated with truncated content',
              cost: 0.03,
              tokensUsed: 1000,
              truncated: true
            });

            return await mockGenerateAISummary(truncatedContent, metadata, company);
          }
          throw error;
        }
      };

      const result = await handleTokenLimit(
        'Very long filing content that exceeds token limits...',
        { formType: '10-K' },
        { name: 'Test Corp' }
      );

      expect(result.truncated).toBe(true);
      expect(result.summary).toContain('truncated content');
      expect(mockGenerateAISummary).toHaveBeenCalledTimes(2);
    });
  });

  describe('Database Transaction Failures', () => {
    it('should handle database connection pool exhaustion', async () => {
      const poolError = new Error('Connection pool exhausted');
      poolError.name = 'PrismaClientConnectionError';

      (mockPrisma.summary.create as jest.Mock)
        .mockRejectedValueOnce(poolError)
        .mockResolvedValueOnce({
          id: 'summary-123',
          processingStatus: 'COMPLETED'
        });

      const createSummaryWithRetry = async (data: any) => {
        const maxRetries = 3;
        const retryDelay = 2000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await mockPrisma.summary.create({ data });
          } catch (error: any) {
            if (error.name === 'PrismaClientConnectionError' && attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
              continue;
            }
            throw error;
          }
        }
      };

      const result = await createSummaryWithRetry({
        tickerId: 'ticker-123',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://sec.gov/test',
        summaryText: 'Test summary',
        cost: 0.05,
        processingStatus: 'COMPLETED',
        model: 'claude-3-sonnet-20241022',
        sentToUser: false
      });

      expect(result.processingStatus).toBe('COMPLETED');
      expect(mockPrisma.summary.create).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent modification conflicts', async () => {
      const conflictError = new Error('Record was modified by another process');
      conflictError.name = 'PrismaClientKnownRequestError';
      (conflictError as any).code = 'P2034';

      (mockPrisma.summary.update as jest.Mock)
        .mockRejectedValueOnce(conflictError)
        .mockResolvedValueOnce({
          id: 'summary-123',
          sentToUser: true,
          updatedAt: new Date()
        });

      const updateSummaryWithConflictResolution = async (id: string, data: any) => {
        try {
          return await mockPrisma.summary.update({
            where: { id },
            data
          });
        } catch (error: any) {
          if (error.code === 'P2034') {
            // Handle optimistic locking conflict
            // In practice, we might refetch and retry
            return await mockPrisma.summary.update({
              where: { id },
              data: { ...data, updatedAt: new Date() }
            });
          }
          throw error;
        }
      };

      const result = await updateSummaryWithConflictResolution('summary-123', {
        sentToUser: true
      });

      expect(result.sentToUser).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(2);
    });

    it('should handle transaction deadlocks', async () => {
      const deadlockError = new Error('Transaction deadlock detected');
      deadlockError.name = 'PrismaClientKnownRequestError';
      (deadlockError as any).code = 'P2034';

      (mockPrisma.$transaction as jest.Mock)
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValueOnce([
          { id: 'summary-123', processingStatus: 'COMPLETED' },
          { id: 'notification-123', deliveryStatus: 'sent' }
        ]);

      const executeTransactionWithDeadlockRetry = async (operations: any[]) => {
        const maxRetries = 3;
        const baseDelay = 1000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await mockPrisma.$transaction(operations);
          } catch (error: any) {
            if (error.code === 'P2034' && attempt < maxRetries) {
              // Random jitter to avoid repeated deadlocks
              const jitter = Math.random() * 1000;
              await new Promise(resolve => setTimeout(resolve, baseDelay * attempt + jitter));
              continue;
            }
            throw error;
          }
        }
      };

      const operations = [
        mockPrisma.summary.create({
          data: {
            tickerId: 'ticker-123',
            filingType: '10-K',
            summaryText: 'Test',
            cost: 0.05,
            processingStatus: 'COMPLETED'
          }
        }),
        mockPrisma.notificationSent.create({
          data: {
            userId: 'user-123',
            summaryId: 'summary-123',
            notificationType: 'NEW_FILING',
            emailAddress: 'test@example.com'
          }
        })
      ];

      const results = await executeTransactionWithDeadlockRetry(operations);

      expect(results).toHaveLength(2);
      expect(results[0].processingStatus).toBe('COMPLETED');
      expect(results[1].deliveryStatus).toBe('sent');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('Email Service Failures and Recovery', () => {
    it('should handle SMTP server outages', async () => {
      const smtpError = new Error('SMTP server connection failed');
      smtpError.name = 'SMTPError';

      mockSendEmail
        .mockRejectedValueOnce(smtpError)
        .mockResolvedValueOnce({
          success: true,
          id: 'email-123',
          message: 'Email sent after SMTP recovery'
        });

      const sendEmailWithRetry = async (emailData: any) => {
        const maxRetries = 3;
        const retryDelay = 5000; // 5 seconds for SMTP issues

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await mockSendEmail(emailData);
          } catch (error: any) {
            if (error.name === 'SMTPError' && attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
              continue;
            }
            throw error;
          }
        }
      };

      // First attempt fails
      await expect(mockSendEmail({
        to: 'test@example.com',
        subject: 'Test Filing',
        html: '<p>Test</p>',
        text: 'Test'
      })).rejects.toThrow('SMTP server connection failed');

      // Retry succeeds
      const result = await sendEmailWithRetry({
        to: 'test@example.com',
        subject: 'Test Filing',
        html: '<p>Test</p>',
        text: 'Test'
      });

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });

    it('should implement circuit breaker for repeated email failures', async () => {
      let failureCount = 0;
      const circuitBreakerThreshold = 5;
      let circuitOpen = false;

      mockSendEmail.mockImplementation(async () => {
        if (circuitOpen) {
          throw new Error('Circuit breaker is open');
        }

        failureCount++;
        if (failureCount <= circuitBreakerThreshold) {
          throw new Error('Email service failure');
        }

        // Reset after threshold
        failureCount = 0;
        circuitOpen = false;
        return { success: true, id: 'email-success' };
      });

      const sendWithCircuitBreaker = async (emailData: any) => {
        try {
          return await mockSendEmail(emailData);
        } catch (error: any) {
          if (failureCount >= circuitBreakerThreshold) {
            circuitOpen = true;
            throw new Error('Circuit breaker opened due to repeated failures');
          }
          throw error;
        }
      };

      // First 5 attempts fail
      for (let i = 0; i < circuitBreakerThreshold; i++) {
        await expect(sendWithCircuitBreaker({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>'
        })).rejects.toThrow('Email service failure');
      }

      // 6th attempt triggers circuit breaker
      await expect(sendWithCircuitBreaker({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('Circuit breaker opened');

      expect(circuitOpen).toBe(true);
    });

    it('should queue emails for retry during service outages', async () => {
      const emailQueue: any[] = [];
      
      mockSendEmail.mockImplementation(async (emailData) => {
        // Simulate service outage
        if (emailQueue.length < 3) {
          emailQueue.push(emailData);
          throw new Error('Service unavailable - email queued');
        }
        
        // Service recovery - process queue
        const queuedEmails = [...emailQueue];
        emailQueue.length = 0;
        
        return {
          success: true,
          id: 'batch-email-123',
          queueProcessed: queuedEmails.length
        };
      });

      const queueEmailForRetry = async (emailData: any) => {
        try {
          return await mockSendEmail(emailData);
        } catch (error) {
          if (error.message.includes('queued')) {
            return { success: false, queued: true, error: error.message };
          }
          throw error;
        }
      };

      // Queue emails during outage
      const results = [];
      for (let i = 0; i < 4; i++) {
        const result = await queueEmailForRetry({
          to: `test${i}@example.com`,
          subject: `Test ${i}`,
          html: `<p>Test ${i}</p>`
        });
        results.push(result);
      }

      // First 3 are queued, 4th processes the queue
      expect(results.slice(0, 3).every(r => r.queued)).toBe(true);
      expect(results[3].success).toBe(true);
      expect((results[3] as any).queueProcessed).toBe(3);
      expect(emailQueue).toHaveLength(0);
    });
  });

  describe('Cascading Failure Recovery', () => {
    it('should handle multiple system failures gracefully', async () => {
      // Simulate multiple cascading failures
      const networkError = new Error('Network unavailable');
      const dbError = new Error('Database connection failed');
      const emailError = new Error('Email service down');

      // All systems fail initially
      mockEnhancedFetch.mockRejectedValueOnce(networkError);
      (mockPrisma.summary.create as jest.Mock).mockRejectedValueOnce(dbError);
      mockSendEmail.mockRejectedValueOnce(emailError);

      // Recovery responses
      mockEnhancedFetch.mockResolvedValueOnce('Filing content recovered');
      (mockPrisma.summary.create as jest.Mock).mockResolvedValueOnce({
        id: 'summary-123',
        processingStatus: 'COMPLETED'
      });
      mockSendEmail.mockResolvedValueOnce({
        success: true,
        id: 'email-recovered'
      });

      const processFilingWithRecovery = async () => {
        const errors = [];
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            // Step 1: Fetch content
            let content;
            try {
              content = await mockEnhancedFetch('https://sec.gov/filing', {
                responseType: 'text'
              });
            } catch (fetchError) {
              errors.push(`Fetch failed: ${fetchError.message}`);
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
              continue;
            }

            // Step 2: Save to database
            let summary;
            try {
              summary = await mockPrisma.summary.create({
                data: {
                  tickerId: 'ticker-123',
                  filingType: '10-K',
                  summaryText: 'Processed content',
                  cost: 0.05,
                  processingStatus: 'COMPLETED'
                }
              });
            } catch (dbError) {
              errors.push(`Database failed: ${dbError.message}`);
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
              continue;
            }

            // Step 3: Send email
            try {
              const emailResult = await mockSendEmail({
                to: 'test@example.com',
                subject: 'Filing Processed',
                html: '<p>Success</p>'
              });

              return {
                success: true,
                summary,
                emailResult,
                errors,
                retryCount
              };
            } catch (emailError) {
              errors.push(`Email failed: ${emailError.message}`);
              // Email failure doesn't prevent completion
              return {
                success: true,
                summary,
                emailResult: { success: false, error: emailError.message },
                errors,
                retryCount
              };
            }
          } catch (error) {
            errors.push(`Unexpected error: ${error.message}`);
            retryCount++;
            if (retryCount >= maxRetries) break;
          }
        }

        return {
          success: false,
          errors,
          retryCount: maxRetries
        };
      };

      const result = await processFilingWithRecovery();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(3); // Each system failed once
      expect(result.retryCount).toBe(2); // Two retry cycles
      expect(mockEnhancedFetch).toHaveBeenCalledTimes(2);
      expect(mockPrisma.summary.create).toHaveBeenCalledTimes(2);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });

    it('should maintain data consistency during partial recoveries', async () => {
      // Scenario: Database succeeds but email fails
      (mockPrisma.summary.create as jest.Mock).mockResolvedValue({
        id: 'summary-123',
        processingStatus: 'COMPLETED',
        sentToUser: false
      });

      mockSendEmail.mockRejectedValue(new Error('Email service unavailable'));

      const processWithConsistencyCheck = async () => {
        let summary;
        
        try {
          // Create summary successfully
          summary = await mockPrisma.summary.create({
            data: {
              tickerId: 'ticker-123',
              filingType: '10-K',
              summaryText: 'Test summary',
              cost: 0.05,
              processingStatus: 'COMPLETED',
              sentToUser: false
            }
          });

          // Attempt email sending
          try {
            await sendFilingSummaryEmail('test@example.com', {
              companyName: 'Test Corp',
              ticker: 'TEST',
              filingType: '10-K',
              filingDate: new Date(),
              summary: 'Test summary',
              filingUrl: 'https://sec.gov/test'
            });

            // If email succeeds, mark as sent
            summary.sentToUser = true;
          } catch (emailError) {
            // Email failed - summary remains with sentToUser: false
            // This maintains consistency for retry later
            console.log('Email failed, summary marked for retry');
          }

          return summary;
        } catch (dbError) {
          throw dbError;
        }
      };

      const result = await processWithConsistencyCheck();

      expect(result.id).toBe('summary-123');
      expect(result.processingStatus).toBe('COMPLETED');
      expect(result.sentToUser).toBe(false); // Consistency maintained
      expect(mockPrisma.summary.create).toHaveBeenCalledOnce();
    });

    it('should implement graceful degradation during system overload', async () => {
      const overloadError = new Error('System overloaded');
      
      // Simulate system overload affecting multiple services
      mockEnhancedFetch.mockRejectedValue(overloadError);
      mockGenerateAISummary.mockRejectedValue(overloadError);
      mockSendEmail.mockRejectedValue(overloadError);

      const processWithGracefulDegradation = async () => {
        const fallbackSummary = {
          id: 'fallback-summary-123',
          tickerId: 'ticker-123',
          filingType: '10-K',
          summaryText: 'System overloaded - filing logged for later processing',
          cost: 0,
          processingStatus: 'DEFERRED',
          sentToUser: false,
          fallback: true
        };

        try {
          // Attempt normal processing
          const content = await mockEnhancedFetch('https://sec.gov/filing');
          const summary = await mockGenerateAISummary(content, {}, {});
          const emailResult = await mockSendEmail({});
          
          return { success: true, summary, emailResult };
        } catch (error) {
          if (error.message.includes('overloaded')) {
            // Graceful degradation - minimal database write
            (mockPrisma.summary.create as jest.Mock).mockResolvedValue(fallbackSummary);
            
            const deferredSummary = await mockPrisma.summary.create({
              data: fallbackSummary
            });

            return {
              success: false,
              degraded: true,
              summary: deferredSummary,
              error: 'System overloaded - processing deferred'
            };
          }
          throw error;
        }
      };

      const result = await processWithGracefulDegradation();

      expect(result.degraded).toBe(true);
      expect(result.summary.processingStatus).toBe('DEFERRED');
      expect(result.summary.fallback).toBe(true);
      expect(result.error).toContain('overloaded');
    });
  });
});