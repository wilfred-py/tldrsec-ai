import type { Metadata } from 'next';
import Link from 'next/link';
import { getCompanyDirectory } from '@/lib/seo/company-page';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'SEC Filing Summaries by Company — tldrSEC',
  description:
    'Browse AI-generated summaries of SEC filings for publicly traded companies: Apple, NVIDIA, Tesla, Microsoft, and more.',
  alternates: { canonical: 'https://tldrsec.app/companies' },
  openGraph: {
    title: 'SEC Filing Summaries by Company — tldrSEC',
    description: 'Browse AI summaries of SEC filings by company.',
    type: 'website',
    url: 'https://tldrsec.app/companies',
  },
  robots: { index: true, follow: true },
};

export default async function CompaniesDirectoryPage() {
  const entries = await getCompanyDirectory();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tldrsec.app' },
      { '@type': 'ListItem', position: 2, name: 'Companies', item: 'https://tldrsec.app/companies' },
    ],
  };

  // Group by sector for a cleaner hierarchy
  const bySector = new Map<string, typeof entries>();
  for (const e of entries) {
    const sector = e.meta.sector;
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector)!.push(e);
  }

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="max-w-4xl mx-auto py-12 px-6">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          {' \u203a '}
          <span className="text-gray-700">Companies</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-4xl font-bold mb-2">SEC Filings by Company</h1>
          <p className="text-lg text-gray-600">
            Browse AI summaries of SEC filings for {entries.length} publicly traded companies.
          </p>
        </header>

        {Array.from(bySector.entries()).map(([sector, items]) => (
          <section key={sector} className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{sector}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map(({ meta, filingCount }) => (
                <Link
                  key={meta.ticker}
                  href={`/companies/${meta.ticker}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-sm transition"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-semibold">{meta.name}</h3>
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                      {meta.ticker}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{meta.industry}</p>
                  <p className="text-xs text-gray-500">
                    {filingCount} summarized filing{filingCount === 1 ? '' : 's'}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="bg-blue-50 rounded-lg p-6 text-center mt-8">
          <h2 className="text-xl font-semibold mb-2">Track your portfolio</h2>
          <p className="text-gray-600 mb-4">
            Get AI summaries of new SEC filings delivered to your inbox.
          </p>
          <Link
            href="/sign-up"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Start free trial
          </Link>
        </section>
      </div>
    </main>
  );
}
