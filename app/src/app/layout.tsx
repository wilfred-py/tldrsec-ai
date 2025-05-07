import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import AuthSyncProvider from "@/components/auth/AuthSyncProvider";
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
          
<meta
  httpEquiv="Content-Security-Policy"
  content={`
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.firebaseio.com https://www.gstatic.com https://*.clerk.accounts.dev https://*.clerk.com;
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://clerk.xyz vitals.vercel-insights.com;
    img-src 'self' data: https: https://*.clerk.accounts.dev https://*.clerk.com https://img.clerk.com;
    style-src 'self' 'unsafe-inline';
    font-src 'self' data:;
    frame-src 'self' https://*.firebaseapp.com https://*.clerk.accounts.dev https://*.clerk.com;
    worker-src 'self' blob:;
  `}
/>
        </head>
        <body className={`${geist.variable} font-sans antialiased`}>
          <AuthSyncProvider>
            {children}
          </AuthSyncProvider>
        </body>
      </html>
      
    </ClerkProvider>
  );
}
