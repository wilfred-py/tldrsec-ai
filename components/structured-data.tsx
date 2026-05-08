'use client';

import { faqItems } from '@/components/landing/sections-v2/faq-section-v2';
import { STRUCTURED_DATA } from '@/lib/landing/copy';

export function JsonLd() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'tldrSEC',
        url: 'https://tldrsec.app',
        description: STRUCTURED_DATA.websiteDescription,
      },
      {
        '@type': 'Organization',
        name: 'tldrSEC',
        url: 'https://tldrsec.app',
        logo: 'https://tldrsec.app/opengraph-image',
        description: STRUCTURED_DATA.organizationDescription,
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
      {
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answerPlain,
          },
        })),
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
