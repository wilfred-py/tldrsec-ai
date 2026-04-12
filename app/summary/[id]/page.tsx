import { redirect, notFound } from 'next/navigation';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { checkSummaryAccess, AccessDeniedError, ResourceNotFoundError } from '@/lib/auth/access-control';
import { SummaryContent } from '@/components/summary/summary-content';
import { getSecFilingViewerUrl } from '@/lib/email/url-utils';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Format filing type for better display
function formatFilingType(type: string): string {
  const upperType = type.toUpperCase();
  switch (upperType) {
    case '10-K':
    case '10K':
      return '10-K';
    case '10-Q':
    case '10Q':
      return '10-Q';
    case '8-K':
    case '8K':
      return '8-K';
    case 'SCHEDULE':
    case 'SC 13G':
    case 'SC13G':
    case 'SCHEDULE 13G':
      return 'Schedule 13G';
    case 'SC 13G-A':
    case 'SC13G-A':
    case 'SCHEDULE 13G/A':
      return 'Schedule 13G/A';
    case 'SC 13D':
    case 'SC13D':
    case 'SCHEDULE 13D':
      return 'Schedule 13D';
    case 'SC 13D-A':
    case 'SC13D-A':
    case 'SCHEDULE 13D/A':
      return 'Schedule 13D/A';
    default:
      return type;
  }
}

interface SummaryPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SummaryPage({ params }: SummaryPageProps) {
  const resolvedParams = await params;

  try {
    // Auth check + data fetch in a single call (no redundant queries)
    const summary = await checkSummaryAccess(resolvedParams.id);

    return (
      <div className="min-h-screen flex flex-col animate-fade-in" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <main className="flex-1" style={{ backgroundColor: 'var(--landing-bg)' }}>
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
                    <BreadcrumbLink href="/dashboard/summaries">Summaries</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRight className="h-4 w-4" />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{summary.ticker.symbol}: {formatFilingType(summary.filingType)}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Link href="/dashboard">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Back to dashboard"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Back to dashboard</span>
                    </Button>
                  </Link>
                  <h1 className="text-2xl font-bold">
                    {summary.ticker.symbol}: {formatFilingType(summary.filingType)} Summary
                  </h1>
                </div>
                <div className="text-muted-foreground text-sm pl-10">
                  Filed {format(new Date(summary.filingDate), 'PPP')}
                  {' '}({formatDistanceToNow(new Date(summary.filingDate), { addSuffix: true })})
                </div>
                <div className="pl-10">
                  <a
                    href={getSecFilingViewerUrl(summary.filingUrl, summary.filingType)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                    aria-label="View original SEC filing document (opens in new tab)"
                  >
                    View Original Filing
                  </a>
                </div>
              </div>

            <div className="rounded-lg p-6">
              <SummaryContent summary={summary} />
            </div>
          </div>
        </main>
      </div>
    );
  } catch (error) {
    // Re-throw Next.js internal errors (redirect, notFound) — they use special
    // error objects with a `digest` property that must propagate
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }

    if (error instanceof ResourceNotFoundError) {
      notFound();
    }

    if (error instanceof AccessDeniedError) {
      redirect('/sign-in');
    }

    // Log the error server-side before rendering the friendly card
    console.error('SummaryPage error:', error);

    // Render inline error card instead of redirecting to nonexistent /error page
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <main className="flex-1" style={{ backgroundColor: 'var(--landing-bg)' }}>
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
                      <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100" asChild>
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
}