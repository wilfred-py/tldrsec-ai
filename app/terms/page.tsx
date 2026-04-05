import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for tldrsec - Read our terms and conditions for using our AI-powered SEC filing analysis service.',
  alternates: {
    canonical: 'https://tldrsec.app/terms',
  },
};

export default function TermsOfServicePage() {
  const currentDate = 'December 31, 2025';

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b" style={{ borderColor: 'var(--landing-border)' }}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-[var(--landing-primary)]" />
              <span className="text-xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                tldrsec
              </span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 text-sm hover:text-[var(--landing-primary)] transition-colors"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--landing-secondary)' }}>
          Terms of Service
        </h1>
        <p className="mb-8" style={{ color: 'var(--landing-text-muted)' }}>
          Last updated: {currentDate}
        </p>

        <div className="prose prose-gray max-w-none" style={{ color: 'var(--landing-text)' }}>
          {/* Agreement */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              1. Agreement to Terms
            </h2>
            <p className="mb-4 leading-relaxed">
              These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you and tldrsec (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) governing your access to and use of the tldrsec.app website and AI-powered SEC filing analysis service (collectively, the &quot;Service&quot;).
            </p>
            <p className="mb-4 leading-relaxed">
              By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, you do not have permission to access the Service.
            </p>
          </section>

          {/* Service Description */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              2. Description of Service
            </h2>
            <p className="mb-4 leading-relaxed">
              tldrsec provides an AI-powered platform that:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Monitors the SEC EDGAR database for new filings from companies you choose to track</li>
              <li>Generates AI-powered summaries of SEC filings including 10-K, 10-Q, 8-K, Form 4, and other filing types</li>
              <li>Delivers filing summaries via email notifications based on your preferences</li>
              <li>Provides a dashboard to manage your tracked companies and preferences</li>
            </ul>
          </section>

          {/* Account Registration */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              3. Account Registration
            </h2>
            <p className="mb-4 leading-relaxed">
              To use certain features of our Service, you must create an account. When registering, you agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Promptly update your information if it changes</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized access</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these Terms or engage in fraudulent activity.
            </p>
          </section>

          {/* Subscription Plans */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              4. Subscription Plans and Payment
            </h2>
            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              4.1 Subscription Tiers
            </h3>
            <p className="mb-4 leading-relaxed">
              We offer multiple subscription tiers with varying features:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Free:</strong> Limited company tracking, weekly digest emails, select filing types</li>
              <li><strong>Pro:</strong> Expanded company tracking, real-time alerts, all filing types</li>
              <li><strong>Max:</strong> Unlimited company tracking, priority processing, dedicated support</li>
            </ul>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              4.2 Payment Terms
            </h3>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Paid subscriptions are billed in advance on a monthly or annual basis</li>
              <li>All fees are non-refundable except as required by law or as otherwise stated</li>
              <li>We may change our pricing with 30 days&apos; notice to existing subscribers</li>
              <li>Payment processing is handled securely by Stripe</li>
            </ul>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              4.3 Cancellation
            </h3>
            <p className="mb-4 leading-relaxed">
              You may cancel your subscription at any time through your account settings. Upon cancellation, you will retain access to paid features until the end of your current billing period.
            </p>
          </section>

          {/* Acceptable Use */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              5. Acceptable Use
            </h2>
            <p className="mb-4 leading-relaxed">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempt to gain unauthorized access to any part of the Service or its systems</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Use automated means (bots, scrapers) to access the Service without our permission</li>
              <li>Redistribute, resell, or commercially exploit our summaries without authorization</li>
              <li>Circumvent any access controls or usage limits</li>
              <li>Impersonate any person or entity or misrepresent your affiliation</li>
              <li>Use the Service to send spam or unsolicited communications</li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              6. Intellectual Property
            </h2>
            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              6.1 Our Content
            </h3>
            <p className="mb-4 leading-relaxed">
              The Service, including its original content (excluding SEC filing data), features, and functionality, is owned by tldrsec and is protected by copyright, trademark, and other intellectual property laws. Our AI-generated summaries, user interface, and proprietary algorithms are our intellectual property.
            </p>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              6.2 SEC Filing Data
            </h3>
            <p className="mb-4 leading-relaxed">
              SEC filings are public government documents and are not subject to copyright. Our AI-generated summaries of these filings are derivative works created through our proprietary technology.
            </p>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              6.3 License to Use
            </h3>
            <p className="mb-4 leading-relaxed">
              We grant you a limited, non-exclusive, non-transferable license to access and use the Service for your personal, non-commercial investment research purposes, subject to these Terms.
            </p>
          </section>

          {/* Disclaimers */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              7. Important Disclaimers
            </h2>
            <div className="bg-[var(--landing-bg-subtle)] border border-[var(--landing-border)] rounded-lg p-6 mb-4">
              <h3 className="text-xl font-medium mb-3 text-red-600">
                NOT INVESTMENT ADVICE
              </h3>
              <p className="mb-4 leading-relaxed font-medium">
                THE SERVICE AND ALL CONTENT, INCLUDING AI-GENERATED SUMMARIES, ARE PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND DO NOT CONSTITUTE INVESTMENT ADVICE, FINANCIAL ADVICE, TRADING ADVICE, OR ANY OTHER SORT OF ADVICE.
              </p>
              <p className="leading-relaxed">
                You should not make any investment decisions based solely on information provided by our Service. Always conduct your own research and consult with qualified financial professionals before making investment decisions. We strongly recommend reviewing the original SEC filings for complete and accurate information.
              </p>
            </div>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              7.1 AI Limitations
            </h3>
            <p className="mb-4 leading-relaxed">
              Our AI-generated summaries:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>May contain errors, omissions, or inaccuracies</li>
              <li>Are not guaranteed to capture all material information from filings</li>
              <li>Should not be relied upon as the sole source of information</li>
              <li>May be delayed in processing or delivery</li>
            </ul>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--landing-secondary)' }}>
              7.2 No Guarantees
            </h3>
            <p className="mb-4 leading-relaxed">
              We do not guarantee:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Continuous, uninterrupted access to the Service</li>
              <li>That summaries will be delivered within any specific timeframe</li>
              <li>The accuracy or completeness of any content</li>
              <li>Any particular investment outcomes</li>
            </ul>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              8. Limitation of Liability
            </h2>
            <p className="mb-4 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, TLDRSEC AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Loss of profits, data, or other intangible losses</li>
              <li>Investment losses or missed investment opportunities</li>
              <li>Damages arising from reliance on our summaries or content</li>
              <li>Damages arising from service interruptions or errors</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Our total liability for any claims arising from or relating to these Terms or the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
            </p>
          </section>

          {/* Indemnification */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              9. Indemnification
            </h2>
            <p className="mb-4 leading-relaxed">
              You agree to indemnify, defend, and hold harmless tldrsec and its officers, directors, employees, agents, and affiliates from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys&apos; fees) arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
              <li>Any investment decisions you make based on our content</li>
            </ul>
          </section>

          {/* Service Modifications */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              10. Service Modifications
            </h2>
            <p className="mb-4 leading-relaxed">
              We reserve the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Modify, suspend, or discontinue any part of the Service at any time</li>
              <li>Update these Terms with reasonable notice</li>
              <li>Change pricing for future billing cycles</li>
              <li>Add or remove features from subscription tiers</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Continued use of the Service after changes constitutes acceptance of modified Terms.
            </p>
          </section>

          {/* Third-Party Services */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              11. Third-Party Services
            </h2>
            <p className="mb-4 leading-relaxed">
              Our Service integrates with third-party services including Clerk (authentication), Stripe (payments), and others. Your use of these services is subject to their respective terms and privacy policies. We are not responsible for the actions or content of any third-party services.
            </p>
          </section>

          {/* Termination */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              12. Termination
            </h2>
            <p className="mb-4 leading-relaxed">
              We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Breach of these Terms</li>
              <li>Fraudulent or illegal activity</li>
              <li>Non-payment of subscription fees</li>
              <li>At our sole discretion for any other reason</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination shall survive.
            </p>
          </section>

          {/* Governing Law */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              13. Governing Law and Disputes
            </h2>
            <p className="mb-4 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of Australia, without regard to conflict of law principles. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration, except that either party may seek injunctive relief in any court of competent jurisdiction.
            </p>
          </section>

          {/* Severability */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              14. Severability
            </h2>
            <p className="mb-4 leading-relaxed">
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
            </p>
          </section>

          {/* Entire Agreement */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              15. Entire Agreement
            </h2>
            <p className="mb-4 leading-relaxed">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and tldrsec regarding the Service and supersede all prior agreements and understandings.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              16. Contact Us
            </h2>
            <p className="mb-4 leading-relaxed">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="mb-4 leading-relaxed">
              <strong>Email:</strong> <a href="mailto:legal@tldrsec.app" className="text-[var(--landing-primary)] hover:underline">legal@tldrsec.app</a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t" style={{ borderColor: 'var(--landing-border)' }}>
        <div className="container mx-auto px-4 text-center">
          <p style={{ color: 'var(--landing-text-muted)' }}>
            &copy; {new Date().getFullYear()} tldrsec. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
