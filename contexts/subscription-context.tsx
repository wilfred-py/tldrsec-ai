'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import useSWR from 'swr';

interface SubscriptionData {
  planType: 'FREE' | 'PRO' | 'MAX';
  isActive: boolean;
  isTrialing: boolean;
  daysRemaining: number;
  trialEndsAt: string | null;
  isGrandfathered: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  limits: {
    monthlyFilings: number;
    usedFilings: number;
    remainingFilings: number;
  };
}

interface SubscriptionContextValue {
  subscription: SubscriptionData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch subscription');
  return res.json();
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
    if (!data?.isTrialing || data.daysRemaining >= 1) return;

    const eventSource = new EventSource('/api/subscription/sse');

    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (update.userId === user?.id) {
        mutate(update.subscription, false); // Update cache without revalidation
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
      setSseConnected(false);
    };

    setSseConnected(true);

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [data?.isTrialing, data?.daysRemaining, user?.id, mutate]);

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
