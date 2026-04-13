import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for tldrsec - Learn how we collect, use, and protect your personal information.',
  alternates: {
    canonical: 'https://tldrsec.app/privacy',
  },
};

export default function PrivacyPolicyPage() {
  const currentDate = 'December 31, 2025';

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-[var(--brand-primary)]" />
              <span className="text-xl font-bold" style={{ color: 'var(--brand-secondary)' }}>
                tldrsec
              </span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 text-sm hover:text-[var(--brand-primary)] transition-colors"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--brand-secondary)' }}>
          Privacy Policy
        </h1>
        <p className="mb-8" style={{ color: 'var(--brand-text-muted)' }}>
          Last updated: {currentDate}
        </p>

        <div className="prose prose-gray max-w-none" style={{ color: 'var(--brand-text)' }}>
          {/* Introduction */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              1. Introduction
            </h2>
            <p className="mb-4 leading-relaxed">
              Welcome to tldrsec (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered SEC filing analysis service at tldrsec.app (the &quot;Service&quot;).
            </p>
            <p className="mb-4 leading-relaxed">
              By accessing or using our Service, you agree to this Privacy Policy. If you do not agree with the terms of this Privacy Policy, please do not access the Service.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              2. Information We Collect
            </h2>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--brand-secondary)' }}>
              2.1 Information You Provide
            </h3>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Account Information:</strong> When you create an account, we collect your email address and name (optional).</li>
              <li><strong>Ticker Preferences:</strong> The companies (stock tickers) you choose to track for SEC filing notifications.</li>
              <li><strong>Notification Preferences:</strong> Your preferences for email frequency (immediate or weekly digest), filing types to receive, and content preferences.</li>
              <li><strong>Payment Information:</strong> If you subscribe to a paid plan, our payment processor (Stripe) collects billing information. We do not store your credit card details directly.</li>
            </ul>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--brand-secondary)' }}>
              2.2 Information Collected Automatically
            </h3>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Usage Data:</strong> We collect information about how you interact with our Service, including filing summary views, email opens, and feature usage.</li>
              <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers for security and analytics purposes.</li>
              <li><strong>Log Data:</strong> IP address, access times, and pages viewed for security monitoring and service improvement.</li>
            </ul>

            <h3 className="text-xl font-medium mb-3" style={{ color: 'var(--brand-secondary)' }}>
              2.3 SEC Filing Data
            </h3>
            <p className="mb-4 leading-relaxed">
              We retrieve and process publicly available SEC filings from the official SEC EDGAR database. This data is public government information and is processed to generate AI-powered summaries for your tracked companies.
            </p>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              3. How We Use Your Information
            </h2>
            <p className="mb-4 leading-relaxed">We use the information we collect to:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Provide, maintain, and improve our Service</li>
              <li>Generate AI-powered summaries of SEC filings for companies you track</li>
              <li>Send you email notifications about new filings based on your preferences</li>
              <li>Process your subscription payments</li>
              <li>Respond to your inquiries and provide customer support</li>
              <li>Monitor and analyze usage patterns to improve user experience</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              4. Third-Party Services
            </h2>
            <p className="mb-4 leading-relaxed">
              We use trusted third-party service providers to operate our Service:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Clerk:</strong> Authentication and user account management. <a href="https://clerk.com/privacy" className="text-[var(--brand-primary)] hover:underline" target="_blank" rel="noopener noreferrer">Clerk Privacy Policy</a></li>
              <li><strong>Stripe:</strong> Payment processing for subscriptions. <a href="https://stripe.com/privacy" className="text-[var(--brand-primary)] hover:underline" target="_blank" rel="noopener noreferrer">Stripe Privacy Policy</a></li>
              <li><strong>Resend:</strong> Email delivery for filing notifications. <a href="https://resend.com/legal/privacy-policy" className="text-[var(--brand-primary)] hover:underline" target="_blank" rel="noopener noreferrer">Resend Privacy Policy</a></li>
              <li><strong>Supabase:</strong> Database hosting and data storage. <a href="https://supabase.com/privacy" className="text-[var(--brand-primary)] hover:underline" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a></li>
              <li><strong>Vercel:</strong> Web application hosting. <a href="https://vercel.com/legal/privacy-policy" className="text-[var(--brand-primary)] hover:underline" target="_blank" rel="noopener noreferrer">Vercel Privacy Policy</a></li>
              <li><strong>OpenRouter/xAI:</strong> AI processing for filing summarization. We send SEC filing content (public government data) to generate summaries.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              These providers only have access to your information to perform specific tasks on our behalf and are obligated to protect your information.
            </p>
          </section>

          {/* Data Sharing */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              5. Data Sharing and Disclosure
            </h2>
            <p className="mb-4 leading-relaxed">
              We do not sell, rent, or trade your personal information. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>With Service Providers:</strong> As described in Section 4, to operate our Service.</li>
              <li><strong>For Legal Compliance:</strong> When required by law, regulation, or legal process.</li>
              <li><strong>To Protect Rights:</strong> When we believe disclosure is necessary to protect our rights, your safety, or the safety of others.</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with notice to you.</li>
            </ul>
          </section>

          {/* Data Security */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              6. Data Security
            </h2>
            <p className="mb-4 leading-relaxed">
              We implement industry-standard security measures to protect your information, including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Encryption in transit (HTTPS/TLS) and at rest</li>
              <li>Secure authentication through Clerk</li>
              <li>Role-based access controls for internal systems</li>
              <li>Regular security audits and monitoring</li>
              <li>Secure database hosting with Supabase</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              While we strive to protect your information, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          {/* Data Retention */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              7. Data Retention
            </h2>
            <p className="mb-4 leading-relaxed">
              We retain your personal information for as long as your account is active or as needed to provide you services. We may retain certain information for legitimate business purposes or as required by law. AI-generated filing summaries may be cached to improve service performance and are shared across users for the same public filings.
            </p>
          </section>

          {/* Your Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              8. Your Rights and Choices
            </h2>
            <p className="mb-4 leading-relaxed">You have the right to:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information.</li>
              <li><strong>Deletion:</strong> Request deletion of your account and personal information.</li>
              <li><strong>Opt-out:</strong> Unsubscribe from marketing emails at any time via the link in our emails.</li>
              <li><strong>Modify Preferences:</strong> Update your notification and tracking preferences in your dashboard.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              To exercise these rights, please contact us at <a href="mailto:privacy@tldrsec.app" className="text-[var(--brand-primary)] hover:underline">privacy@tldrsec.app</a>.
            </p>
          </section>

          {/* Cookies */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              9. Cookies and Tracking
            </h2>
            <p className="mb-4 leading-relaxed">
              We use essential cookies for authentication and session management through Clerk. We may use analytics cookies to understand how users interact with our Service. You can control cookie settings through your browser preferences.
            </p>
          </section>

          {/* Children */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              10. Children&apos;s Privacy
            </h2>
            <p className="mb-4 leading-relaxed">
              Our Service is not directed to individuals under 18 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected personal information from a child, we will take steps to delete that information.
            </p>
          </section>

          {/* International */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              11. International Data Transfers
            </h2>
            <p className="mb-4 leading-relaxed">
              Our Service is hosted in the United States. If you access our Service from outside the United States, your information may be transferred to, stored, and processed in the United States where our servers are located. By using our Service, you consent to the transfer of your information to the United States.
            </p>
          </section>

          {/* Changes */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              12. Changes to This Privacy Policy
            </h2>
            <p className="mb-4 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--brand-secondary)' }}>
              13. Contact Us
            </h2>
            <p className="mb-4 leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="mb-4 leading-relaxed">
              <strong>Email:</strong> <a href="mailto:privacy@tldrsec.app" className="text-[var(--brand-primary)] hover:underline">privacy@tldrsec.app</a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="container mx-auto px-4 text-center">
          <p style={{ color: 'var(--brand-text-muted)' }}>
            &copy; {new Date().getFullYear()} tldrsec. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
