'use client';

export function JsonLd() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'tldrSEC',
        url: 'https://tldrsec.app',
        description:
          'AI-powered SEC filing summaries. Get instant insights from 10-K, 10-Q, 8-K, and Form 4 filings.',
      },
      {
        '@type': 'Organization',
        name: 'tldrSEC',
        url: 'https://tldrsec.app',
        logo: 'https://tldrsec.app/opengraph-image',
        description: 'AI-powered SEC filing analysis for smarter investment decisions.',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'tldrSEC',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        url: 'https://tldrsec.app',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph),
      }}
    />
  );
}
