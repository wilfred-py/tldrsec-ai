import type { Metadata } from 'next';
import { NewsletterHero } from '@/components/newsletter/newsletter-hero';
import { NewsletterSignup } from '@/components/newsletter/newsletter-signup';
import { CompanyPreview } from '@/components/newsletter/company-preview';
import { SampleDigest } from '@/components/newsletter/sample-digest';
import { NewsletterSchema } from '@/components/seo/newsletter-schema';

export const metadata: Metadata = {
  title: 'Free SEC Filing Newsletter - AI-Powered Financial Insights | TLDRSec',
  description: 'Get weekly AI-generated summaries of SEC filings from Fortune 500 companies delivered to your inbox. Free newsletter with actionable financial insights for investors.',
  keywords: [
    'SEC filing newsletter',
    'free financial newsletter',
    'AI investment insights',
    'Fortune 500 SEC filings',
    'financial news digest',
    'investor newsletter',
    'SEC filing summaries',
    'stock market insights',
    'quarterly earnings summary',
    'financial document analysis',
    'investment research newsletter',
    'AI financial analysis',
    'free stock newsletter'
  ],
  openGraph: {
    title: 'Free SEC Filing Newsletter - AI Financial Insights in Your Inbox',
    description: 'Join 2,847+ investors getting weekly AI-powered summaries of SEC filings from major companies. Free forever.',
    type: 'website',
    url: 'https://tldrsec.app/newsletter',
    siteName: 'TLDRSec',
    images: [
      {
        url: 'https://tldrsec.app/og-newsletter.png',
        width: 1200,
        height: 630,
        alt: 'TLDRSec Newsletter - AI-Powered SEC Filing Summaries'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free SEC Filing Newsletter - AI Financial Insights',
    description: 'Weekly AI summaries of Fortune 500 SEC filings delivered free to your inbox.',
    images: ['https://tldrsec.app/og-newsletter.png'],
    creator: '@tldrsec'
  },
  alternates: {
    canonical: 'https://tldrsec.app/newsletter'
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  }
};

export default function NewsletterPage() {
  return (
    <>
      <NewsletterSchema />
      <main className="min-h-screen">
        <NewsletterHero />
        <CompanyPreview />
        <SampleDigest />
        <NewsletterSignup />
      </main>
    </>
  );
}