import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import {
  getFilingTypeGuide,
  getAllFilingTypeGuides,
} from '@/lib/seo/filing-type-content';
import { getRecentFilingsByType } from '@/lib/seo/company-page';

export const revalidate = 86400;

interface Props {
  params: Promise<{ type: string }>;
}

// Pre-render the known filing-type slugs at build time. Unknown slugs fall
// through to runtime, where getFilingTypeGuide(type) returns null and
// notFound() fires. We don't use dynamicParams=false because Next.js dev
// mode treats that as "always 404" even for valid params.
export async function generateStaticParams() {
  return getAllFilingTypeGuides().map((g) => ({ type: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const guide = getFilingTypeGuide(type);
  if (!guide) return {};

  const title = `${guide.name} Explained — SEC Filing Guide | tldrSEC`;
  const description = guide.shortDescription;

  return {
    title,
    description,
    alternates: {
      canonical: `https://tldrsec.app/filings/${guide.slug}`,
    },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://tldrsec.app/filings/${guide.slug}`,
    },
    robots: { index: true, follow: true },
  };
}

export default async function FilingTypeGuidePage({ params }: Props) {
  const { type } = await params;
  const guide = getFilingTypeGuide(type);
  if (!guide) notFound();

  const examples = await getRecentFilingsByType(guide.dbFormType, 5);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${guide.name} Explained: SEC Filing Guide`,
    description: guide.shortDescription,
    publisher: {
      '@type': 'Organization',
      name: 'tldrSEC',
      url: 'https://tldrsec.app',
    },
    mainEntityOfPage: `https://tldrsec.app/filings/${guide.slug}`,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tldrsec.app' },
      { '@type': 'ListItem', position: 2, name: 'Filings', item: 'https://tldrsec.app/filings' },
      { '@type': 'ListItem', position: 3, name: guide.name, item: `https://tldrsec.app/filings/${guide.slug}` },
    ],
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <article className="max-w-3xl mx-auto py-12 px-6">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          {' \u203a '}
          <span className="text-gray-700">{guide.name}</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-4xl font-bold mb-3">{guide.name} Explained</h1>
          <p className="text-lg text-gray-600">{guide.shortDescription}</p>
        </header>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-3">What it is</h2>
          <p className="text-gray-700 leading-relaxed">{guide.whatItIs}</p>
        </section>

        <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Frequency</div>
            <div className="font-medium">{guide.frequency}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Deadline</div>
            <div className="font-medium">{guide.deadline}</div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-3">Who files it</h2>
          <p className="text-gray-700 leading-relaxed">{guide.whoFilesIt}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-3">Why it matters</h2>
          <p className="text-gray-700 leading-relaxed">{guide.whyItMatters}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-3">Key things to look for</h2>
          <ul className="list-disc list-outside ml-5 space-y-2 text-gray-700">
            {guide.keyThings.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        {examples.length > 0 && (
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">
              Recent {guide.name} examples
            </h2>
            <ul className="space-y-4">
              {examples.map((e) => (
                <li key={e.accessionNumber} className="border-b border-gray-100 pb-4">
                  <Link
                    href={`/s/${e.ticker}/${e.formType}/${e.accessionNumber}`}
                    className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="font-medium">{e.ticker}</span>
                      <span className="text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(e.filingDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{e.previewText}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-blue-50 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">
            Get {guide.name} summaries in your inbox
          </h2>
          <p className="text-gray-600 mb-4">
            Pick the companies you care about and we&apos;ll send AI summaries of every {guide.name} filing as they&apos;re posted.
          </p>
          <Link
            href="/sign-up"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Start free trial
          </Link>
        </section>
      </article>
    </main>
  );
}
