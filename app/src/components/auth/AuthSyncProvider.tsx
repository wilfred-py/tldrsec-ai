'use client';

import React, { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

/**
 * Component that synchronizes authenticated Clerk users with our database
 * This runs automatically when a user is authenticated
 */
export default function AuthSyncProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  
  useEffect(() => {
    // Only attempt to sync when the user is authenticated
    if (!isLoaded || !isSignedIn) return;
    
    const syncUser = async () => {
      try {
        console.debug('Syncing authenticated user with database...');
        
        const response = await fetch('/api/auth/sync-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Failed to sync user with database:', errorData);
          return;
        }
        
        const result = await response.json();
        console.debug('User sync complete:', result);
      } catch (error) {
        console.error('Error during user sync:', error);
      }
    };
    
    // Sync the user when they sign in
    syncUser();
    
    // We only want to run this once when the user is authenticated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  
  return <>{children}</>;
} 