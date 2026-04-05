import { MetadataRoute } from 'next';
import { getRecentFilingsForSitemap } from '@/lib/seo/summary-preview';

// Fixed date for static routes — update on each deploy that changes these pages.
// Using new Date() causes crawlers to see a different lastModified every request,
// which wastes crawl budget and signals false freshness.
const STATIC_LAST_MODIFIED = '2026-04-05';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://tldrsec.app';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/subscribe`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/waitlist`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Dynamic preview routes from database (capped at 500)
  let previewRoutes: MetadataRoute.Sitemap = [];
  try {
    const filings = await getRecentFilingsForSitemap(500);
    previewRoutes = filings.map((f) => ({
      url: `${baseUrl}/s/${f.ticker.symbol}/${f.formType}/${f.accessionNumber}`,
      lastModified: f.createdAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch {
    // Sitemap still works even if DB is temporarily unreachable
  }

  return [...staticRoutes, ...previewRoutes];
}
