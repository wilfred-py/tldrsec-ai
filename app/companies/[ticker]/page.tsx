import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { getCompanyPageData } from '@/lib/seo/company-page';
import { getCompanyMeta, COMPANIES } from '@/lib/seo/company-metadata';

// 24h ISR — matches the existing `/s/` preview pages. Use revalidateTag('company:TICKER')
// in the new-filings cron for instant refreshes when data changes.
export const revalidate = 86400;

interface Props {
  params: Promise<{ ticker: string }>;
}

// Pre-render the 15 known tickers at build time (no DB call needed — metadata is static).
// Unknown tickers fall through to runtime, where notFound() guards them.
// Use dynamicParams=true (default) because generateStaticParams + DB would fail at build time.
export async function generateStaticParams() {
  return Object.keys(COMPANIES).map((ticker) => ({ ticker }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const meta = getCompanyMeta(ticker);
  if (!meta) return {};

  const title = `${meta.name} (${meta.ticker}) SEC Filings — AI Summaries`;
  const description = `AI-generated summaries of ${meta.name}'s SEC filings: 10-K, 10-Q, 8-K, Form 4, and more. Track ${meta.ticker} filings delivered to your inbox.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://tldrsec.app/companies/${meta.ticker}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://tldrsec.app/companies/${meta.ticker}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function CompanyHubPage({ params }: Props) {
  const { ticker } = await params;
  const data = await getCompanyPageData(ticker);
  if (!data) notFound();

  const { meta, totalFilings, recentFilings, filingTypeCounts, relatedTickers } = data;

  // Corporation JSON-LD — distinct @id from the global Organization in structured-data.tsx
  const corpJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Corporation',
    '@id': `https://tldrsec.app/companies/${meta.ticker}#corp`,
    name: meta.name,
    tickerSymbol: meta.ticker,
    url: `https://tldrsec.app/companies/${meta.ticker}`,
    sameAs: meta.cik
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${meta.cik}`
      : undefined,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tldrsec.app' },
      { '@type': 'ListItem', position: 2, name: 'Companies', item: 'https://tldrsec.app/companies' },
      { '@type': 'ListItem', position: 3, name: meta.name, item: `https://tldrsec.app/companies/${meta.ticker}` },
    ],
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(corpJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="max-w-4xl mx-auto py-12 px-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          {' \u203a '}
          <Link href="/companies" className="hover:underline">Companies</Link>
          {' \u203a '}
          <span className="text-gray-700">{meta.ticker}</span>
        </nav>

        {/* Hero */}
        <header className="mb-10">
          <h1 className="text-4xl font-bold mb-2">
            {meta.name} <span className="text-gray-400">({meta.ticker})</span>
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            {meta.sector} &middot; {meta.industry}
          </p>
          <p className="text-gray-700">
            We have AI-summarized {totalFilings} SEC filing{totalFilings === 1 ? '' : 's'} for {meta.name}.
            Get new summaries delivered to your inbox as they&apos;re filed.
          </p>
          <div className="mt-4">
            <Link
              href={`/sign-up?ticker=${meta.ticker}`}
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              Track {meta.ticker} filings
            </Link>
          </div>
        </header>

        {/* Filing type breakdown */}
        {filingTypeCounts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Filings by type</h2>
            <div className="flex flex-wrap gap-2">
              {filingTypeCounts.map((t) => (
                <Link
                  key={t.formType}
                  href={`/filings/${t.formType.toLowerCase().replace(/\s+/g, '-')}`}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <span className="font-medium">{t.formType}</span>
                  <span className="text-gray-500">{t.count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recent filings */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">
            Recent {meta.ticker} filings
          </h2>
          <ul className="space-y-4">
            {recentFilings.map((f) => (
              <li key={f.accessionNumber} className="border-b border-gray-100 pb-4">
                <Link
                  href={`/s/${meta.ticker}/${f.formType}/${f.accessionNumber}`}
                  className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="font-medium">{f.formType}</span>
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                      {format(new Date(f.filingDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{f.previewText}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Related companies */}
        {relatedTickers.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">
              Other {meta.sector} companies
            </h2>
            <div className="flex flex-wrap gap-2">
              {relatedTickers.map((t) => (
                <Link
                  key={t}
                  href={`/companies/${t}`}
                  className="inline-flex rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {t}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="bg-blue-50 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">
            Don&apos;t miss a {meta.ticker} filing
          </h2>
          <p className="text-gray-600 mb-4">
            Get AI-generated summaries of every new {meta.name} SEC filing in your inbox.
          </p>
          <Link
            href={`/sign-up?ticker=${meta.ticker}`}
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Start free trial
          </Link>
        </section>
      </div>
    </main>
  );
}
