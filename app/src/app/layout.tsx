import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "tldrSEC - AI-Powered SEC Filings Summarizer",
  description: "Automated SEC filings monitoring and summarization for retail investors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider 
      appearance={{
        elements: {
          card: "shadow-none border rounded-lg",
        },
      }}
    >
      <html lang="en">
        <head>
          <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://*.clerk.accounts.dev; style-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev; img-src 'self' https://*.clerk.com https://*.clerk.accounts.dev data:; connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev; frame-src https://*.clerk.com https://*.clerk.accounts.dev; font-src 'self' https://*.clerk.com https://*.clerk.accounts.dev data:; worker-src blob:;" />
        </head>
        <body className={`${geist.variable} font-sans antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
