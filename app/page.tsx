import type { Metadata } from 'next';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'SEC Filing Insights for Value Investors',
    description: 'Cut through complex legal jargon. Get clear insights on great businesses with economic moats and predictable earnings.',
    keywords: [
      'SEC filing summaries',
      'value investing',
      'economic moats',
      'Warren Buffett approach',
      'business analysis',
      'investment research'
    ],
    openGraph: {
      title: 'SEC Filing Insights for Value Investors',
      description: 'Cut through complex legal jargon. Get clear insights on businesses with economic moats.',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'SEC Filing Insights for Value Investors',
      description: 'Cut through complex legal jargon. Get clear insights on businesses with economic moats.',
    },
    alternates: {
      canonical: 'https://tldrsec.app',
    },
  };
}

export default function Home() {
  return <FocusedInvestorHero />;
}