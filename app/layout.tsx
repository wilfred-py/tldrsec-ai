import './globals.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProviderWrapper } from '@/components/auth/clerk-provider-wrapper';
import { Toaster } from '@/components/ui/sonner';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
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

export const metadata: Metadata = {
  metadataBase: new URL('https://tldrsec.app'),
  title: "tldrSEC - AI-Powered SEC Filing Summaries",
  description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from 10-K, 10-Q, and 8-K reports for better investment decisions.",
  keywords: "SEC filing summarizer, analyze SEC filing, summarize US financial statements, summarize US company filings, AI financial analysis",
  authors: [{ name: "tldrSEC Team" }],
  openGraph: {
    type: "website",
    title: "tldrSEC - AI-Powered SEC Filing Summaries",
    description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from complex financial documents.",
    url: "https://tldrsec.app",
    siteName: "tldrSEC",
    images: [
      {
        url: "/og-image.png",
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
    images: ["/og-image.png"],
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
      afterSignUpUrl="/onboarding"
      afterSignInUrl="/dashboard"
      signUpUrl="/sign-up"
      signInUrl="/sign-in"
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <PostHogProvider>
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
