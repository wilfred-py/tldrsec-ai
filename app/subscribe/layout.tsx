import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing & Plans',
  description:
    'Choose your tldrSEC plan. Get AI-powered SEC filing summaries for 10-K, 10-Q, 8-K, and Form 4 filings. Free tier available.',
  alternates: {
    canonical: 'https://tldrsec.app/subscribe',
  },
  openGraph: {
    title: 'Pricing & Plans',
    description:
      'AI-powered SEC filing analysis starting free. Upgrade for more companies and faster alerts.',
    type: 'website',
  },
  // Transactional page. Already crawlable; this signals Google not to promote
  // it above content pages, which were losing crawl budget to this route.
  robots: {
    index: false,
    follow: true,
  },
};

export default function SubscribeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
