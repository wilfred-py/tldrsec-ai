import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSummaryPreview, getRelatedFilings } from '@/lib/seo/summary-preview';
import { SummaryPreviewPage } from '@/components/seo/summary-preview-page';
import { getFilingTypeGuide } from '@/lib/seo/filing-type-content';
import { getCompanyMeta } from '@/lib/seo/company-metadata';

// Previews are immutable — revalidate once per day
export const revalidate = 86400;

interface Props {
  params: Promise<{ ticker: string; filingType: string; accession: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { accession } = await params;
  const preview = await getSummaryPreview(accession);
  if (!preview) return {};

  const year = new Date(preview.filingDate).getFullYear();

  return {
    title: `${preview.companyName} ${preview.filingType} Summary (${year})`,
    description: preview.previewText.substring(0, 155),
    alternates: {
      canonical: `https://tldrsec.app/s/${preview.ticker}/${preview.filingType}/${preview.accessionNumber}`,
    },
    openGraph: {
      title: `${preview.companyName} ${preview.filingType} Summary`,
      description: preview.previewText.substring(0, 200),
      type: 'article',
    },
    robots: { index: true, follow: true },
  };
}

export default async function PreviewPage({ params }: Props) {
  const { accession, ticker, filingType } = await params;
  const preview = await getSummaryPreview(accession);

  if (!preview) notFound();

  // Validate URL params match actual data to prevent param spoofing
  const tickerMatch =
    preview.ticker.toUpperCase() === ticker.toUpperCase();
  const filingTypeMatch =
    preview.filingType.replace(/-/g, '').toUpperCase() ===
    filingType.replace(/-/g, '').toUpperCase();

  if (!tickerMatch || !filingTypeMatch) {
    notFound();
  }

  // Internal linking: related filings for same company + filing type guide + company hub.
  const [relatedFilings, companyMeta] = await Promise.all([
    getRelatedFilings(preview.ticker, preview.accessionNumber, 6),
    Promise.resolve(getCompanyMeta(preview.ticker)),
  ]);

  // Map the filing type to a guide slug if we have one (e.g. "10-K" -> "10-k")
  const guideSlug = findGuideSlugForFormType(preview.filingType);

  return (
    <SummaryPreviewPage
      preview={preview}
      relatedFilings={relatedFilings}
      companyHubAvailable={companyMeta !== null}
      filingTypeGuideSlug={guideSlug}
    />
  );
}

function findGuideSlugForFormType(formType: string): string | null {
  const normalized = formType.replace(/\s+/g, '').toUpperCase();
  // Try exact match first, then common variants.
  const candidates = [
    normalized.toLowerCase(),
    normalized.replace(/-/g, '').toLowerCase(),
    `form-${normalized.toLowerCase()}`,
  ];
  for (const slug of candidates) {
    if (getFilingTypeGuide(slug)) return slug;
  }
  return null;
}
