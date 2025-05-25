import type { Metadata, ResolvingMetadata } from 'next';
import { HeroSection } from '@/components/landing/hero-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Testimonials } from '@/components/landing/testimonials';
import { CTASection } from '@/components/landing/cta-section';

export async function generateMetadata(
  _: any,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const previousMetadata = await parent;
  
  return {
    title: 'SEC Filing Summarizer - AI-Powered Insights',
    description: 'Save time on SEC filings with AI-powered summaries. Get key insights from complex financial documents in minutes, not hours.',
    keywords: [
      'SEC filing summarizer',
      'AI financial summaries',
      'financial document analysis',
      'SEC filing analysis',
      'financial AI',
      'investment research',
      'SEC insights',
      '10-K summary',
      '10-Q summary',
      'earnings report analysis'
    ],
    openGraph: {
      title: 'SEC Filing Summarizer - AI-Powered Insights',
      description: 'Save time on SEC filings with AI-powered summaries. Get key insights from complex financial documents in minutes, not hours.',
      images: previousMetadata.openGraph?.images || [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'SEC Filing Summarizer - AI-Powered Insights',
      description: 'Save time on SEC filings with AI-powered summaries. Get key insights from complex financial documents in minutes, not hours.',
      images: previousMetadata.twitter?.images || [],
    },
    alternates: {
      canonical: 'https://tldrsec.ai',
    },
  };
}

export default function Home() {
  return (
    <main>
      <HeroSection />
      <FeaturesSection />
      <HowItWorks />
      <Testimonials />
      <CTASection />
    </main>
  );
} 