import type { Metadata, ResolvingMetadata } from 'next';
import { WaitlistHero } from '@/components/waitlist/waitlist-hero';
import { ProblemSolution } from '@/components/waitlist/problem-solution';
import { WaitlistCTA } from '@/components/waitlist/waitlist-cta';

export async function generateMetadata(
  _: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const previousMetadata = await parent;
  
  return {
    title: 'Stop Drowning in SEC Filing Noise - Early Access Waitlist',
    description: 'Get the filing details that matter delivered straight to your inbox. Join 500+ investors already on the waitlist for beta access.',
    keywords: [
      'SEC filing summaries',
      'investment research',
      'filing alerts',
      'financial document analysis',
      'investor tools',
      'early access',
      'beta waitlist'
    ],
    openGraph: {
      title: 'Stop Drowning in SEC Filing Noise - Early Access Waitlist',
      description: 'Join 500+ investors already on the waitlist for beta access to concise SEC filing summaries.',
      images: previousMetadata.openGraph?.images || [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Stop Drowning in SEC Filing Noise - Early Access Waitlist',
      description: 'Join 500+ investors already on the waitlist for beta access to concise SEC filing summaries.',
      images: previousMetadata.twitter?.images || [],
    },
    alternates: {
      canonical: 'https://tldrsec.app',
    },
  };
}

export default function Home() {
  return (
    <main>
      <WaitlistHero />
      <ProblemSolution />
      <WaitlistCTA />
    </main>
  );
}