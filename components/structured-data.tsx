'use client';

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'tldrSEC - AI-Powered SEC Filing Summaries',
          description: 'Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from 10-K, 10-Q, 8-K, and Form 4 filings.',
          url: 'https://tldrsec.app',
        }),
      }}
    />
  );
} 