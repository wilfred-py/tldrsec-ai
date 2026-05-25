export async function trackPageAnalytics(
  pageVariant: string,
  action: string,
  utmParams?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    [key: string]: string | null | undefined;
  }
) {
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    console.log(`[Analytics] ${pageVariant}:${action}`, utmParams);
    return;
  }

  if (typeof window === 'undefined') return;

  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        page_variant: pageVariant,
        visitor_id: generateVisitorId(),
        action,
        utm_source: utmParams?.utm_source ?? null,
        utm_medium: utmParams?.utm_medium ?? null,
        utm_campaign: utmParams?.utm_campaign ?? null,
        referrer: document.referrer || null,
      }),
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
