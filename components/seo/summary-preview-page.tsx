import Link from 'next/link';
import { format } from 'date-fns';
import type { SummaryPreview } from '@/lib/seo/summary-preview';

export function SummaryPreviewPage({ preview }: { preview: SummaryPreview }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${preview.companyName} ${preview.filingType} Summary`,
    datePublished: preview.filingDate,
    publisher: {
      '@type': 'Organization',
      name: 'tldrSEC',
      url: 'https://tldrsec.app',
    },
    description: preview.previewText,
  };

  return (
    <article className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto py-12 px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {preview.companyName} {preview.filingType} Summary
          </h1>
          <p className="text-gray-500">
            Filed {format(new Date(preview.filingDate), 'MMMM d, yyyy')}{' '}
            &middot; {preview.ticker}
          </p>
          <a
            href={preview.secUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm"
          >
            View original SEC filing
          </a>
        </header>

        <section className="prose prose-lg mb-8">
          <p>{preview.previewText}</p>
        </section>

        <section className="bg-blue-50 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">
            Read the full AI analysis
          </h2>
          <p className="text-gray-600 mb-4">
            Get complete summaries of {preview.companyName} SEC filings
            delivered to your inbox.
          </p>
          <Link
            href="/sign-up"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Sign up free
          </Link>
        </section>

        <nav className="mt-8 text-sm text-gray-500">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          {' \u00b7 '}
          <Link href="/subscribe" className="hover:underline">
            Pricing
          </Link>
        </nav>
      </div>
    </article>
  );
}
