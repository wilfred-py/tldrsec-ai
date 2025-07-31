/**
 * Authorization utilities for subscription management
 * Addresses security vulnerability: missing authorization checks
 */

import { currentUser } from '@clerk/nextjs';
import { prisma } from '../db';
import { logger } from '../logging';

const authLogger = logger.child('subscription-auth');

export class SubscriptionAuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SubscriptionAuthError';
  }
}

/**
 * Verify user owns the subscription they're trying to modify
 */
export async function verifySubscriptionOwnership(
  userId: string, 
  subscriptionUserId: string
): Promise<void> {
  if (userId !== subscriptionUserId) {
    authLogger.warn('Unauthorized subscription access attempt', {
      userId,
      targetUserId: subscriptionUserId
    });
    throw new SubscriptionAuthError(
      'Access denied: Cannot modify another user\'s subscription',
      'UNAUTHORIZED_ACCESS'
    );
  }
}

/**
 * Verify user has permission to record usage for a subscription
 */
export async function verifyUsageRecordingPermission(
  userId: string,
  targetUserId: string
): Promise<void> {
  if (userId !== targetUserId) {
    authLogger.warn('Unauthorized usage recording attempt', {
      userId,
      targetUserId
    });
    throw new SubscriptionAuthError(
      'Access denied: Cannot record usage for another user',
      'UNAUTHORIZED_USAGE_RECORDING'
    );
  }
}

/**
 * Get authenticated user ID from Clerk
 */
export async function getAuthenticatedUserId(): Promise<string> {
  const user = await currentUser();
  if (!user) {
    throw new SubscriptionAuthError(
      'Authentication required',
      'UNAUTHENTICATED'
    );
  }
  return user.id;
}

/**
 * Verify user exists and is active
 */
export async function verifyUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    authLogger.warn('User not found for subscription operation', { userId });
    throw new SubscriptionAuthError(
      'User not found',
      'USER_NOT_FOUND'
    );
  }
}

/**
 * Verify user has active subscription for premium features
 */
export async function verifyActiveSubscription(userId: string): Promise<void> {
  const subscription = await prisma.userSubscription.findUnique({
    where: { userId },
    select: { isActive: true, currentPeriodEnd: true }
  });

  if (!subscription || !subscription.isActive) {
    throw new SubscriptionAuthError(
      'Active subscription required',
      'NO_ACTIVE_SUBSCRIPTION'
    );
  }

  if (subscription.currentPeriodEnd < new Date()) {
    throw new SubscriptionAuthError(
      'Subscription expired',
      'SUBSCRIPTION_EXPIRED'
    );
  }
}

/**
 * Rate limiting for subscription operations
 */
const userOperationCounts = new Map<string, { count: number; resetTime: number }>();

export function checkSubscriptionRateLimit(userId: string, maxOperations = 100): void {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  
  const userOps = userOperationCounts.get(userId);
  
  if (!userOps || now > userOps.resetTime) {
    userOperationCounts.set(userId, { count: 1, resetTime: now + windowMs });
    return;
  }
  
  if (userOps.count >= maxOperations) {
    authLogger.warn('Rate limit exceeded for subscription operations', {
      userId,
      count: userOps.count,
      limit: maxOperations
    });
    throw new SubscriptionAuthError(
      'Rate limit exceeded. Too many subscription operations.',
      'RATE_LIMIT_EXCEEDED'
    );
  }
  
  userOps.count++;
}