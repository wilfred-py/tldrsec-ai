import { MetadataRoute } from 'next';
import { getRecentFilingsForSitemap } from '@/lib/seo/summary-preview';
import { getTickersWithSummaries } from '@/lib/seo/company-page';
import { getAllFilingTypeGuides } from '@/lib/seo/filing-type-content';

// Fixed date for static routes — bump on each deploy that changes sitemap structure.
// Using new Date() causes crawlers to see a different lastModified every request,
// which wastes crawl budget and signals false freshness.
const STATIC_LAST_MODIFIED = '2026-04-21';

/**
 * Sitemap priority hierarchy:
 *   1.0  homepage
 *   0.8  company hub pages (most unique content per page)
 *   0.7  filing-type guide pages, /companies directory
 *   0.6  individual /s/ preview pages (templated)
 *   0.3  privacy, terms
 *
 * Auth and transactional routes (/sign-up, /sign-in, /subscribe, /waitlist) are
 * intentionally excluded — they remain crawlable (not in robots.txt disallow)
 * but are not promoted to Google. They have no unique SEO content and would
 * only compete with content pages for crawl budget.
 *
 * Growth note: When the total URL count exceeds ~45k, split into a sitemap
 * index with sub-sitemaps (sitemap-companies.xml, sitemap-filings.xml,
 * sitemap-previews.xml). Today we're well under the 50k hard cap.
 */
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
      url: `${baseUrl}/companies`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.7,
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

  // Company hub pages — priority 0.8 (outrank filing-type guides)
  let companyRoutes: MetadataRoute.Sitemap = [];
  try {
    const tickers = await getTickersWithSummaries();
    companyRoutes = tickers.map((t) => ({
      url: `${baseUrl}/companies/${t}`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    // Sitemap still works if DB is unreachable
  }

  // Filing-type guide pages — static, priority 0.7
  const filingTypeRoutes: MetadataRoute.Sitemap = getAllFilingTypeGuides().map((g) => ({
    url: `${baseUrl}/filings/${g.slug}`,
    lastModified: STATIC_LAST_MODIFIED,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Individual filing preview pages (capped at 500) — priority 0.6
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

  return [
    ...staticRoutes,
    ...companyRoutes,
    ...filingTypeRoutes,
    ...previewRoutes,
  ];
}
