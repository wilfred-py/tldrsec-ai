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
          description: 'Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from complex financial documents.',
          url: 'https://tldrsec.ai',
          potentialAction: {
            '@type': 'SearchAction',
            target: 'https://tldrsec.ai/search?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          },
          sameAs: [
            'https://twitter.com/tldrsec',
            'https://linkedin.com/company/tldrsec',
          ],
        }),
      }}
    />
  );
} 