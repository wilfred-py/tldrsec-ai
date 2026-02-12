/**
 * Subscription Management Hook
 * Fresh implementation for Stripe subscription state
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

interface SubscriptionData {
  planType: string;
  isActive: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
  isTrialing: boolean;
  daysRemaining: number;
  isGrandfathered: boolean;
  limits: {
    monthlyFilings: number;
    usedFilings: number;
    remainingFilings: number;
  };
}

interface UseSubscriptionReturn {
  subscription: SubscriptionData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createCheckout: (planType: string, billingInterval: 'monthly' | 'annual') => Promise<string>;
  openBillingPortal: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const { user, isLoaded } = useUser();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/user/subscription');
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to view subscription');
        }
        if (response.status === 503) {
          throw new Error('Billing system is not configured');
        }
        throw new Error('Failed to load subscription');
      }

      const data = await response.json();
      setSubscription(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to fetch subscription:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, user]);

  const createCheckout = useCallback(async (planType: string, billingInterval: 'monthly' | 'annual'): Promise<string> => {
    try {
      setError(null);

      const response = await fetch('/api/user/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planType,
          billingInterval,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout');
      }

      const data = await response.json();

      if (!data.checkoutUrl) {
        throw new Error('No checkout URL received');
      }

      return data.checkoutUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create checkout';
      setError(message);
      throw err;
    }
  }, []);

  const openBillingPortal = useCallback(async (): Promise<void> => {
    try {
      setError(null);

      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to open billing portal');
      }

      const data = await response.json();
      
      if (!data.url) {
        throw new Error('No portal URL received');
      }

      // Redirect to billing portal
      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal';
      setError(message);
      throw err;
    }
  }, []);

  // Fetch subscription on mount and user change
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return {
    subscription,
    loading,
    error,
    refetch: fetchSubscription,
    createCheckout,
    openBillingPortal,
  };
}

export default useSubscription;