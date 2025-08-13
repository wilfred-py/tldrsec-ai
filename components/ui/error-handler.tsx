"use client";

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

const ERROR_MESSAGES = {
  access_denied: {
    monitoring: 'Access denied: Monitoring dashboard requires administrator privileges',
    default: 'Access denied: You don\'t have permission to access this resource'
  },
  session_expired: 'Your session has expired. Please sign in again',
  network_error: 'Network error occurred. Please try again',
  default: 'An error occurred. Please try again'
};

/**
 * Client-side error handler component that displays toast notifications
 * based on URL search parameters. Useful for showing errors after redirects.
 */
export function ErrorHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get('error');
    const resource = searchParams.get('resource');

    if (error) {
      let message = ERROR_MESSAGES.default;

      // Get specific error message based on error type and resource
      if (error === 'access_denied') {
        message = resource && resource in ERROR_MESSAGES.access_denied 
          ? ERROR_MESSAGES.access_denied[resource as keyof typeof ERROR_MESSAGES.access_denied]
          : ERROR_MESSAGES.access_denied.default;
      } else if (error in ERROR_MESSAGES) {
        message = ERROR_MESSAGES[error as keyof typeof ERROR_MESSAGES];
      }

      // Show error toast
      toast.error(message, {
        duration: 5000,
        action: {
          label: 'Dismiss',
          onClick: () => toast.dismiss()
        }
      });

      // Clean up URL parameters after showing the error
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('error');
      newSearchParams.delete('resource');
      
      const newUrl = newSearchParams.toString() 
        ? `${window.location.pathname}?${newSearchParams.toString()}`
        : window.location.pathname;

      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, router]);

  return null; // This component doesn't render anything visible
}