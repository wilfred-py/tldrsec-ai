import { supabase } from '@/lib/supabase/client';

export async function trackPageAnalytics(
  pageVariant: string,
  action: string,
  utmParams?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
  }
) {
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