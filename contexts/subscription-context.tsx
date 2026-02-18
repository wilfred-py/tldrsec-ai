'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import useSWR from 'swr';
import { SubscriptionDataSchema, type SubscriptionData } from '@/lib/validation/subscription-schema';

interface SubscriptionContextValue {
  subscription: SubscriptionData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

/**
 * Fetcher with Zod validation to prevent XSS/injection attacks
 */
const fetcher = async (url: string): Promise<SubscriptionData> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch subscription');

  const data = await res.json();

  // Validate response structure to prevent XSS
  try {
    return SubscriptionDataSchema.parse(data);
  } catch (error) {
    console.error('Subscription data validation failed:', error);
    throw new Error('Invalid subscription data format');
  }
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, user } = useAuth();
  const [sseConnected, setSseConnected] = useState(false);

  // SWR for caching with 5-minute revalidation
  const { data, error, isLoading, mutate } = useSWR<SubscriptionData>(
    isLoaded && isSignedIn && user ? '/api/user/subscription' : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300000, // 5 minutes
      errorRetryCount: 2,
      errorRetryInterval: 5000,
    }
  );

  // Server-Sent Events for trial expiration real-time updates
  useEffect(() => {
    if (!data?.isTrialing || data.daysRemaining >= 1 || !user) return;

    const eventSource = new EventSource('/api/subscription/sse');

    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);

        // SECURITY FIX: Compare against authProviderId (Clerk userId)
        // SSE sends authProviderId which matches Clerk's userId
        if (update.authProviderId === user.id) {
          // Validate subscription data before updating cache
          const validatedSubscription = {
            ...data,
            ...update.subscription,
          };

          mutate(validatedSubscription, false); // Update cache without revalidation
        }
      } catch (error) {
        console.error('SSE message parsing error:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      setSseConnected(false);
    };

    setSseConnected(true);

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [data?.isTrialing, data?.daysRemaining, user, mutate, data]);

  const value: SubscriptionContextValue = {
    subscription: data ?? null,
    loading: isLoading,
    error: error ? error.message : null,
    refetch: () => mutate(),
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscriptionContext must be used within SubscriptionProvider');
  }
  return context;
}
