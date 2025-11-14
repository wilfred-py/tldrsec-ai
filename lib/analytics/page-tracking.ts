import { supabase } from '@/lib/supabase/client';

export async function trackPageAnalytics(
  pageVariant: string,
  action: string,
  utmParams?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    [key: string]: string | null | undefined; // Allow additional parameters for flexibility
  }
) {
  // Skip analytics in test or CI environments
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    console.log(`[Analytics] ${pageVariant}:${action}`, utmParams);
    return;
  }

  try {
    await supabase.from('page_analytics').insert({
      page_variant: pageVariant,
      visitor_id: generateVisitorId(),
      action,
      utm_source: utmParams?.utm_source,
      utm_medium: utmParams?.utm_medium,
      utm_campaign: utmParams?.utm_campaign,
      user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
      referrer: typeof window !== 'undefined' ? document.referrer : null,
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);

    // Track analytics failures in production
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      // Send error to monitoring service (e.g., Sentry, LogRocket)
      // This helps detect RLS policy or connectivity issues
      try {
        fetch('/api/monitoring/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            context: 'page_analytics_insert',
            pageVariant,
            action,
            timestamp: new Date().toISOString()
          })
        }).catch(() => {
          // Silently fail - don't break user experience
        });
      } catch {
        // Double-catch to ensure no error breaks the page
      }
    }
  }
}

function generateVisitorId(): string {
  if (typeof window !== 'undefined') {
    let visitorId = localStorage.getItem('visitor_id');
    if (!visitorId) {
      visitorId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('visitor_id', visitorId);
    }
    return visitorId;
  }
  return 'server-' + Math.random().toString(36).substring(2);
}