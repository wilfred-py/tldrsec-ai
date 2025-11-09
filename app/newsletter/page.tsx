import { Metadata } from 'next';
import { PersonalizedHero } from '@/components/newsletter/personalized-hero';

export const metadata: Metadata = {
  title: 'Newsletter - TLDRSec AI',
  description: 'Get weekly AI summaries of SEC filings without the overwhelm. Join thousands of smart investors.',
  openGraph: {
    title: 'Newsletter - TLDRSec AI',
    description: 'Get weekly AI summaries of SEC filings without the overwhelm. Join thousands of smart investors.',
    type: 'website',
  },
};

export default function NewsletterPage() {
  // Use the personalized hero component for the newsletter landing page
  const fallbackContent = {
    headline: "SEC Filings Made Simple",
    valueProposition: "Get weekly AI summaries without the overwhelm",
    socialProof: "Join 2,847+ smart investors",
    ctaText: "Get Weekly Insights",
    riskMitigation: "Free forever • No spam"
  };

  return (
    <main className="min-h-screen">
      <PersonalizedHero fallbackContent={fallbackContent} />
      
      {/* Additional newsletter-specific content */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                What You&apos;ll Get
              </h2>
              <p className="text-lg text-gray-600">
                Our newsletter delivers the insights you need to stay informed about the companies you care about.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-blue-100 rounded-lg p-6 mb-4">
                  <div className="text-3xl font-bold text-blue-600">📊</div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  AI-Powered Summaries
                </h3>
                <p className="text-gray-600">
                  Complex SEC filings distilled into clear, actionable insights using advanced AI.
                </p>
              </div>
              
              <div className="text-center">
                <div className="bg-green-100 rounded-lg p-6 mb-4">
                  <div className="text-3xl font-bold text-green-600">⚡</div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Weekly Delivery
                </h3>
                <p className="text-gray-600">
                  Every Sunday morning, get the week&apos;s most important filings in your inbox.
                </p>
              </div>
              
              <div className="text-center">
                <div className="bg-purple-100 rounded-lg p-6 mb-4">
                  <div className="text-3xl font-bold text-purple-600">🎯</div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Company Focus
                </h3>
                <p className="text-gray-600">
                  Track the companies that matter to you with personalized insights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sample newsletter preview */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Sample Newsletter
              </h2>
              <p className="text-lg text-gray-600">
                Here&apos;s what you can expect in your weekly digest.
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-8 border">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  📈 This Week&apos;s Key Filings
                </h3>
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                    <h4 className="font-medium text-gray-900">Tesla (TSLA) - 10-Q Filing</h4>
                    <p className="text-gray-600 text-sm mt-1">
                      Tesla reported strong Q3 results with record deliveries. Key highlights include...
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border-l-4 border-green-500">
                    <h4 className="font-medium text-gray-900">Apple (AAPL) - 8-K Filing</h4>
                    <p className="text-gray-600 text-sm mt-1">
                      Apple announced new product launch dates and updated guidance for...
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="text-center text-gray-500 text-sm">
                ✨ And much more in each weekly edition
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}