import type { Metadata } from 'next';
import { NewsletterHero } from '@/components/newsletter/newsletter-hero';
import { NewsletterSignup } from '@/components/newsletter/newsletter-signup';
import { CompanyPreview } from '@/components/newsletter/company-preview';
import { SampleDigest } from '@/components/newsletter/sample-digest';

export const metadata: Metadata = {
  title: 'SEC Filing Newsletter - AI-Powered Financial Insights in Your Inbox',
  description: 'Get weekly AI-generated summaries of SEC filings from Fortune 500 companies. Stay informed about market-moving events without the information overload.',
  keywords: [
    'SEC filing newsletter',
    'financial news summary',
    'AI investment insights',
    'Fortune 500 companies',
    'SEC filing alerts',
    'investment newsletter',
    'financial digest'
  ],
  openGraph: {
    title: 'SEC Filing Newsletter - Financial Insights in Your Inbox',
    description: 'Weekly AI-powered summaries of SEC filings from major companies.',
    type: 'website',
  }
};

export default function NewsletterPage() {
  return (
    <main className="min-h-screen">
      <NewsletterHero />
      <CompanyPreview />
      <SampleDigest />
      <NewsletterSignup />
    </main>
  );
}