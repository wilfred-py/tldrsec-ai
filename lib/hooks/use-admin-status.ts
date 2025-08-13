import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

interface AdminStatusResponse {
  isAdmin: boolean;
  timestamp: string;
}

/**
 * Custom hook to securely fetch admin status from server
 * Replaces client-side environment variable exposure
 */
export function useAdminStatus() {
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchAdminStatus = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/user/admin-status', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: AdminStatusResponse = await response.json();
        
        if (isMounted) {
          setIsAdmin(data.isAdmin);
        }
      } catch (err) {
        console.error('Failed to fetch admin status:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsAdmin(false); // Default to no admin access on error
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id]); // Re-fetch if user changes

  return {
    isAdmin,
    loading,
    error,
  };
}