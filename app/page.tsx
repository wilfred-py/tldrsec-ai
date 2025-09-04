import type { Metadata, ResolvingMetadata } from 'next';
import { HeroSection } from '@/components/landing/hero-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { HowItWorks } from '@/components/landing/how-it-works';
import { ComprehensiveInsights } from '@/components/landing/comprehensive-insights';
import { PricingSection } from '@/components/landing/pricing-section';
import { CTASection } from '@/components/landing/cta-section';

export async function generateMetadata(
  _: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const previousMetadata = await parent;
  
  return {
    title: 'SEC Filing Email Summaries - Stay Informed in Real-Time',
    description: 'Subscribe to company tickers and receive concise email summaries of SEC filings in real-time. Stay informed without the information overload.',
    keywords: [
      'SEC filing summarizer',
      'SEC filing email alerts',
      'SEC filing subscription',
      'financial document analysis',
      'SEC filing summaries',
      'SEC filing email service',
      'investment research',
      'SEC insights',
      '10-K summary',
      '10-Q summary',
      'earnings report summary'
    ],
    openGraph: {
      title: 'SEC Filing Email Summaries - Stay Informed in Real-Time',
      description: 'Subscribe to company tickers and receive concise email summaries of SEC filings in real-time. Stay informed without the information overload.',
      images: previousMetadata.openGraph?.images || [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'SEC Filing Email Summaries - Stay Informed in Real-Time',
      description: 'Subscribe to company tickers and receive concise email summaries of SEC filings in real-time. Stay informed without the information overload.',
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
      <section id="hero">
        <HeroSection />
      </section>
      <section id="features">
        <FeaturesSection />
      </section>
      <section id="insights">
        <ComprehensiveInsights />
      </section>
      <section id="how-it-works">
        <HowItWorks />
      </section>
      <section id="pricing">
        <PricingSection />
      </section>
      <section id="cta">
        <CTASection />
      </section>
    </main>
  );
} 