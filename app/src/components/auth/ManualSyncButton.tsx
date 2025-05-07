'use client';

import React, { useState } from 'react';

/**
 * A simple button that administrators can use to manually trigger 
 * synchronization of the authenticated user with the database
 */
export default function ManualSyncButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const handleSync = async () => {
    try {
      setIsLoading(true);
      setResult(null);
      
      const response = await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setResult({ 
          success: false, 
          error: data.error || 'Failed to sync user'
        });
        return;
      }
      
      setResult({ 
        success: true, 
        message: `Sync successful. Action: ${data.action}` 
      });
    } catch (error) {
      setResult({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-4 p-4 border rounded-lg bg-background">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">User Synchronization</h3>
        <p className="text-sm text-muted-foreground">
          If you&apos;re having issues with missing user data, you can manually trigger a synchronization.
        </p>
      </div>
      
      <button
        onClick={handleSync}
        disabled={isLoading}
        className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
      >
        {isLoading ? 'Syncing...' : 'Sync User Data'}
      </button>
      
      {result && (
        <div className={`mt-2 p-3 text-sm rounded-md ${
          result.success 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {result.success 
            ? result.message
            : `Error: ${result.error}`
          }
        </div>
      )}
    </div>
  );
} 