import './globals.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/sonner';
import { Navigation } from '@/components/navigation';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { PageViewTracker } from '@/components/analytics/page-view-tracker';
import { MouseFollowEffect } from '@/components/landing/mouse-follow-effect';
import { JsonLd } from '@/components/structured-data';
import { AuthProvider } from '@/lib/context/auth-context';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "tldrSEC - AI-Powered SEC Filing Summaries",
  description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from 10-K, 10-Q, and 8-K reports for better investment decisions.",
  keywords: "SEC filing summarizer, analyze SEC filing, summarize US financial statements, summarize US company filings, AI financial analysis",
  authors: [{ name: "tldrSEC Team" }],
  openGraph: {
    type: "website",
    title: "tldrSEC - AI-Powered SEC Filing Summaries",
    description: "Save hours analyzing SEC filings with AI-generated summaries. Get instant insights from complex financial documents.",
    url: "https://tldrsec.com",
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
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <PostHogProvider>
            <AuthProvider>
              <PageViewTracker />
              <MouseFollowEffect />
              {/* Use our new Navigation component */}
              <Navigation />
              <JsonLd />
              <main className="min-h-screen">
                {children}
              </main>
              <Toaster />
            </AuthProvider>
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
