import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSummaryPreview } from '@/lib/seo/summary-preview';
import { SummaryPreviewPage } from '@/components/seo/summary-preview-page';

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

  return <SummaryPreviewPage preview={preview} />;
}
