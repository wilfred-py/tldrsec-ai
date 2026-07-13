/**
 * Payment Audit Logger.
 *
 * Deep module behind two helpers — `PaymentLogger.checkoutStarted` and
 * `PaymentLogger.checkoutFailed` — that the checkout API
 * (`app/api/checkout/route.ts`) calls to persist Stripe Checkout
 * lifecycle events to the `SecurityAuditLog` table. The helpers carry
 * the per-event-type shape (severity, source, metadata layout) so
 * callers never assemble those fields by hand.
 *
 * Previously the same namespace exported six additional helpers —
 * `checkoutCompleted`, `webhookReceived`, `subscriptionUpdated`,
 * `rateLimitExceeded` — plus six unused `PaymentEventType` enum entries
 * (`CHECKOUT_COMPLETED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`,
 * `SUBSCRIPTION_CANCELLED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`,
 * `WEBHOOK_RECEIVED`, `RATE_LIMIT_EXCEEDED`). None had a production
 * caller; they were a speculative "common events" catalogue. Stripe
 * webhook handlers and rate-limit middleware in this repo do not funnel
 * through this module. Removing them concentrates the seam on the
 * checkout-lifecycle events the system actually ships.
 *
 * Per LANGUAGE.md "one adapter = hypothetical seam": each removed
 * helper had zero adapters. The remaining surface is the real seam.
 */

import { getPrismaClient } from '@/lib/db/prisma';

export enum PaymentEventType {
  CHECKOUT_STARTED = 'checkout_started',
  CHECKOUT_FAILED = 'checkout_failed',
}

interface PaymentEvent {
  type: PaymentEventType;
  userId?: string;
  email?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
}

async function logPaymentEvent(event: PaymentEvent): Promise<void> {
  const prisma = getPrismaClient();

  try {
    console.log(`[Payment Audit] ${event.type}`, {
      timestamp: new Date().toISOString(),
      userId: event.userId,
      email: event.email,
      amount: event.amount,
      error: event.error,
    });

    await prisma.securityAuditLog.create({
      data: {
        eventType: event.type,
        userId: event.userId,
        details: JSON.stringify({
          email: event.email,
          amount: event.amount,
          currency: event.currency,
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
    // Audit logging failures must never break the checkout flow.
    console.error('[Payment Audit] Failed to log event:', error);
  }
}

export const PaymentLogger = {
  async checkoutStarted(data: {
    email: string;
    planType: string;
    amount?: number;
    ipAddress?: string;
    userAgent?: string;
  }) {
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

  async checkoutFailed(data: {
    email: string;
    error: string;
    amount?: number;
    ipAddress?: string;
  }) {
    await logPaymentEvent({
      type: PaymentEventType.CHECKOUT_FAILED,
      email: data.email,
      amount: data.amount,
      error: data.error,
      ipAddress: data.ipAddress,
    });
  },
};
