export function NewsletterSchema() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://tldrsec.app/newsletter",
        "url": "https://tldrsec.app/newsletter",
        "name": "Free SEC Filing Newsletter - AI-Powered Financial Insights",
        "description": "Get weekly AI-generated summaries of SEC filings from Fortune 500 companies delivered to your inbox. Free newsletter with actionable financial insights for investors.",
        "datePublished": "2024-10-31",
        "dateModified": new Date().toISOString().split('T')[0],
        "inLanguage": "en-US",
        "isPartOf": {
          "@type": "WebSite",
          "@id": "https://tldrsec.app/#website",
          "url": "https://tldrsec.app/",
          "name": "TLDRSec",
          "description": "AI-powered SEC filing summaries and financial insights"
        },
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://tldrsec.app/"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Newsletter",
              "item": "https://tldrsec.app/newsletter"
            }
          ]
        }
      },
      {
        "@type": "Product",
        "@id": "https://tldrsec.app/newsletter#product",
        "name": "TLDRSec Newsletter",
        "description": "Weekly AI-powered summaries of SEC filings from Fortune 500 companies",
        "brand": {
          "@type": "Brand",
          "name": "TLDRSec"
        },
        "offers": {
          "@type": "Offer",
          "url": "https://tldrsec.app/newsletter",
          "priceCurrency": "USD",
          "price": "0",
          "priceValidUntil": "2025-12-31",
          "availability": "https://schema.org/InStock",
          "seller": {
            "@type": "Organization",
            "name": "TLDRSec"
          }
        },
        "category": "Financial Newsletter",
        "audience": {
          "@type": "Audience",
          "audienceType": "Investors, Financial Professionals, Business Analysts"
        }
      },
      {
        "@type": "Service",
        "@id": "https://tldrsec.app/newsletter#service",
        "name": "SEC Filing Analysis Newsletter",
        "description": "AI-powered analysis and summaries of SEC filings delivered weekly",
        "provider": {
          "@type": "Organization",
          "name": "TLDRSec",
          "url": "https://tldrsec.app",
          "logo": "https://tldrsec.app/logo.png"
        },
        "serviceType": "Financial Newsletter",
        "areaServed": "Global",
        "hasOfferCatalog": {
          "@type": "OfferCatalog",
          "name": "Newsletter Subscriptions",
          "itemListElement": [
            {
              "@type": "Offer",
              "itemOffered": {
                "@type": "Service",
                "name": "Free Newsletter Subscription",
                "description": "Weekly digest of SEC filing summaries"
              },
              "price": "0",
              "priceCurrency": "USD"
            }
          ]
        }
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is included in the SEC filing newsletter?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Our newsletter includes AI-generated summaries of the most important SEC filings from Fortune 500 companies, delivered weekly to your inbox. Each summary highlights key insights, financial changes, and material events that could impact stock prices."
            }
          },
          {
            "@type": "Question",
            "name": "How often is the newsletter sent?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "The newsletter is sent weekly, typically on Sundays, covering all significant SEC filings from the previous week."
            }
          },
          {
            "@type": "Question",
            "name": "Is the newsletter really free?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes, the newsletter is completely free. We also offer premium features for users who want real-time alerts and access to our complete filing archive."
            }
          },
          {
            "@type": "Question",
            "name": "What companies are covered?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We focus on Fortune 500 companies across all sectors, including technology giants like Apple, Microsoft, and Google, as well as major financial institutions, healthcare companies, and energy firms."
            }
          }
        ]
      },
      {
        "@type": "Organization",
        "@id": "https://tldrsec.app/#organization",
        "name": "TLDRSec",
        "url": "https://tldrsec.app",
        "logo": "https://tldrsec.app/logo.png",
        "description": "AI-powered SEC filing analysis and financial insights platform",
        "foundingDate": "2024",
        "sameAs": [
          "https://twitter.com/tldrsec"
        ]
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}