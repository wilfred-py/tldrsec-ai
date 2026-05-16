'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

// Error boundary for the summary detail route. Catches throws from page.tsx
// (e.g., shell-query failure) AND from the Suspense'd <SummaryBody> (e.g.,
// unexpected Prisma error mid-stream). Next.js skips this for redirect() and
// notFound() — those go to the route's not-found.tsx or the redirect target.
//
// Replaces the inline try/catch error-card that lived in the old page.tsx.
export default function SummaryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('SummaryPage error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <main className="flex-1" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="container max-w-7xl mx-auto py-8 md:py-10 px-6 md:px-8 space-y-6">
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>Error</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-6">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-6 w-6 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h1 className="text-red-800 font-semibold text-lg mb-2">
                    Something went wrong
                  </h1>
                  <p className="text-red-700 text-sm mb-4">
                    We couldn&apos;t load this summary. This is usually temporary — try again in a moment.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => reset()}
                    >
                      Try again
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-100"
                      asChild
                    >
                      <Link href="/dashboard">Back to Dashboard</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
