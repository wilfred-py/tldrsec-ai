/**
 * Event Bus Security Tests - Critical Coverage
 * Tests for event bus security features and functionality
 */

import { EventBus, EVENT_TYPES } from '../../lib/services/event-bus';

// Mock dependencies
jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

jest.mock('../../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn()
  }
}));

describe('EventBus Security', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
  });

  describe('Event Security Validation', () => {
    it('should reject events with malicious script content', async () => {
      const maliciousEvent = {
        id: 'test-1',
        type: EVENT_TYPES.AI_PROCESSING_REQUESTED,
        source: 'test-service',
        data: {
          content: '<script>alert("xss")</script>',
          userInput: 'javascript:void(0)'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: 'corr-1',
          version: '3.0.0',
          priority: 'MEDIUM' as const
        },
        routing: {
          broadcast: false,
          retryCount: 0,
          maxRetries: 3
        }
      };

      await expect(eventBus.publish(maliciousEvent)).rejects.toThrow('Event failed security validation');
    });

    it('should sanitize event data', async () => {
      const testEvent = {
        id: 'test-2',
        type: EVENT_TYPES.FILING_REQUESTED,
        source: 'test-service',
        data: {
          filingUrl: 'https://example.com/filing',
          sanitizeMe: '<script>evil</script>normaltext'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: 'corr-2',
          version: '3.0.0',
          priority: 'MEDIUM' as const
        },
        routing: {
          broadcast: false,
          retryCount: 0,
          maxRetries: 3
        }
      };

      // Mock subscriber to verify sanitization
      let sanitizedData: any;
      const subscriptionId = eventBus.subscribe({
        serviceName: 'test-subscriber',
        eventType: EVENT_TYPES.FILING_REQUESTED,
        handler: {
          serviceName: 'test-subscriber',
          eventTypes: [EVENT_TYPES.FILING_REQUESTED],
          handler: async (event) => {
            sanitizedData = event.data;
          },
          options: {
            timeout: 1000
          }
        }
      });

      await eventBus.publish(testEvent);

      // Allow event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sanitizedData?.sanitizeMe).toBe('normaltext');
      expect(sanitizedData?.sanitizeMe).not.toContain('<script>');

      eventBus.unsubscribe(subscriptionId);
    });

    it('should validate event integrity', async () => {
      const invalidEvent = {
        id: '',
        type: '',
        source: '',
        data: {},
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: 'corr-3',
          version: '3.0.0',
          priority: 'MEDIUM' as const
        },
        routing: {
          broadcast: false
        }
      };

      await expect(eventBus.publish(invalidEvent)).rejects.toThrow('Event failed security validation');
    });
  });

  describe('Event Subscription and Delivery', () => {
    it('should handle event subscription and delivery', async () => {
      let receivedEvent: any = null;
      
      const subscriptionId = eventBus.subscribe({
        serviceName: 'test-service',
        eventType: EVENT_TYPES.JOB_COMPLETED,
        handler: {
          serviceName: 'test-service',
          eventTypes: [EVENT_TYPES.JOB_COMPLETED],
          handler: async (event) => {
            receivedEvent = event;
          },
          options: {
            timeout: 1000
          }
        }
      });

      const testEvent = {
        id: 'test-event-1',
        type: EVENT_TYPES.JOB_COMPLETED,
        source: 'job-service',
        data: {
          jobId: 'job-123',
          result: 'success'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: 'corr-1',
          version: '3.0.0',
          priority: 'MEDIUM' as const
        },
        routing: {
          broadcast: false,
          retryCount: 0,
          maxRetries: 3
        }
      };

      await eventBus.publish(testEvent);

      // Allow event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvent).toBeTruthy();
      expect(receivedEvent.id).toBe('test-event-1');
      expect(receivedEvent.data.jobId).toBe('job-123');

      eventBus.unsubscribe(subscriptionId);
    });

    it('should provide event statistics', () => {
      const stats = eventBus.getStatistics();

      expect(stats).toHaveProperty('subscriptions');
      expect(stats).toHaveProperty('eventTypes');
      expect(stats).toHaveProperty('historySize');
      expect(stats).toHaveProperty('totalProcessed');
      expect(stats).toHaveProperty('totalErrors');
    });
  });

  describe('Helper Functions', () => {
    it('should create and publish events using helpers', async () => {
      const { EventBusHelpers } = require('../../lib/services/event-bus');

      const eventId = await EventBusHelpers.publishFilingRequest(
        'https://example.com/filing',
        { ticker: 'TSLA', formType: '10-K' },
        'correlation-123'
      );

      expect(eventId).toBeTruthy();
      expect(typeof eventId).toBe('string');
    });
  });
});