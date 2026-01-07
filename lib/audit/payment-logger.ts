import { getPrismaClient } from '@/lib/db/prisma';

export enum PaymentEventType {
  CHECKOUT_STARTED = 'checkout_started',
  CHECKOUT_COMPLETED = 'checkout_completed', 
  CHECKOUT_FAILED = 'checkout_failed',
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',
  WEBHOOK_RECEIVED = 'webhook_received',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
}

export interface PaymentEvent {
  type: PaymentEventType;
  userId?: string;
  email?: string;
  amount?: number;
  currency?: string;
  stripeEventId?: string;
  subscriptionId?: string;
  customerId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
}

export async function logPaymentEvent(event: PaymentEvent): Promise<void> {
  const prisma = getPrismaClient();
  
  try {
    // Log to console for immediate monitoring
    console.log(`[Payment Audit] ${event.type}`, {
      timestamp: new Date().toISOString(),
      userId: event.userId,
      email: event.email,
      amount: event.amount,
      stripeEventId: event.stripeEventId,
      subscriptionId: event.subscriptionId,
      error: event.error,
    });
    
    // Store in database for audit trail
    await prisma.securityAuditLog.create({
      data: {
        eventType: event.type,
        userId: event.userId,
        details: JSON.stringify({
          email: event.email,
          amount: event.amount,
          currency: event.currency,
          stripeEventId: event.stripeEventId,
          subscriptionId: event.subscriptionId,
          customerId: event.customerId,
          metadata: event.metadata,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          error: event.error,
        }),
        severity: event.error ? 'HIGH' : event.type.includes('failed') ? 'MEDIUM' : 'LOW',
        source: 'PAYMENT_SYSTEM',
        timestamp: new Date(),
      },
    });
  } catch (error) {
    // Don't let audit logging failures break the main flow
    console.error('[Payment Audit] Failed to log event:', error);
  }
}

// Helper functions for common events
export const PaymentLogger = {
  async checkoutStarted(data: { email: string; planType: string; amount?: number; ipAddress?: string; userAgent?: string }) {
    await logPaymentEvent({
      type: PaymentEventType.CHECKOUT_STARTED,
      email: data.email,
      amount: data.amount,
      currency: 'USD',
      metadata: { planType: data.planType },
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });
  },

  async checkoutCompleted(data: { userId?: string; email: string; amount: number; subscriptionId?: string; customerId?: string }) {
    await logPaymentEvent({
      type: PaymentEventType.CHECKOUT_COMPLETED,
      userId: data.userId,
      email: data.email,
      amount: data.amount,
      currency: 'USD',
      subscriptionId: data.subscriptionId,
      customerId: data.customerId,
    });
  },

  async checkoutFailed(data: { email: string; error: string; amount?: number; ipAddress?: string }) {
    await logPaymentEvent({
      type: PaymentEventType.CHECKOUT_FAILED,
      email: data.email,
      amount: data.amount,
      error: data.error,
      ipAddress: data.ipAddress,
    });
  },

  async webhookReceived(data: { stripeEventId: string; type: string; customerId?: string; subscriptionId?: string }) {
    await logPaymentEvent({
      type: PaymentEventType.WEBHOOK_RECEIVED,
      stripeEventId: data.stripeEventId,
      customerId: data.customerId,
      subscriptionId: data.subscriptionId,
      metadata: { webhookType: data.type },
    });
  },

  async subscriptionUpdated(data: { userId: string; subscriptionId: string; oldTier?: string; newTier: string }) {
    await logPaymentEvent({
      type: PaymentEventType.SUBSCRIPTION_UPDATED,
      userId: data.userId,
      subscriptionId: data.subscriptionId,
      metadata: { oldTier: data.oldTier, newTier: data.newTier },
    });
  },

  async rateLimitExceeded(data: { ipAddress: string; endpoint: string; userAgent?: string }) {
    await logPaymentEvent({
      type: PaymentEventType.RATE_LIMIT_EXCEEDED,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: { endpoint: data.endpoint },
      error: 'Rate limit exceeded',
    });
  },
};