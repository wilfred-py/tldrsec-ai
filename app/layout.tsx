import './globals.css';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { ClerkProviderWrapper } from '@/components/auth/clerk-provider-wrapper';
import { Toaster } from '@/components/ui/sonner';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { SubscriberIdentifier } from '@/components/analytics/subscriber-identifier';
import { MouseFollowEffect } from '@/components/landing/mouse-follow-effect';
import { JsonLd } from '@/components/structured-data';
import { AuthProvider } from '@/lib/context/auth-context';
import { Analytics } from '@vercel/analytics/react';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-serif',
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://tldrsec.app'),
  title: {
    default: "tldrSEC - AI-Powered SEC Filing Summaries",
    template: "%s | tldrSEC",
  },
  description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from 10-K, 10-Q, and 8-K reports for better investment decisions.",
  keywords: "SEC filing summary, 10-K summary, 10-Q summary, 8-K filing analysis, Form 4 insider trading, SEC filing alerts, AI SEC analysis, earnings report summary, SEC EDGAR summary tool, investment research",
  authors: [{ name: "tldrSEC Team" }],
  openGraph: {
    type: "website",
    title: "tldrSEC - AI-Powered SEC Filing Summaries",
    description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from complex financial documents.",
    url: "https://tldrsec.app",
    siteName: "tldrSEC",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "tldrSEC - AI-Powered SEC Filing Summaries",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "tldrSEC - AI-Powered SEC Filing Summaries",
    description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from complex financial documents.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check if we're in build time
  const isBuildTime = typeof window === 'undefined' && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  return (
    <ClerkProviderWrapper
      signUpFallbackRedirectUrl="/onboarding"
      signInFallbackRedirectUrl="/dashboard"
      signUpUrl="/sign-up"
      signInUrl="/sign-in"
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
        >
          <PostHogProvider>
            {/* Newsletter campaign attribution. Reads ?sub=<uuid> from URL,
                writes cookie+localStorage synchronously, identifies in PostHog.
                Suspense boundary required because useSearchParams suspends
                until the client router hydrates. */}
            <Suspense fallback={null}>
              <SubscriberIdentifier />
            </Suspense>
            {isBuildTime ? (
              // During build time, render children without AuthProvider
              <>
                <MouseFollowEffect />
                <JsonLd />
                <main className="min-h-screen">
                  {children}
                </main>
                <Toaster />
                <Analytics />
              </>
            ) : (
              // At runtime, use AuthProvider
              <AuthProvider>
                <MouseFollowEffect />
                <JsonLd />
                <main className="min-h-screen">
                  {children}
                </main>
                <Toaster />
                <Analytics />
              </AuthProvider>
            )}
          </PostHogProvider>
        </body>
      </html>
    </ClerkProviderWrapper>
  );
}
