import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getSummaryShellMetadata } from '@/lib/db/get-summary-shell-metadata';
import { ResourceNotFoundError } from '@/lib/auth/access-control';
import { SummaryBody } from '@/components/summary/summary-body';
import { SummaryContentSkeleton } from '@/components/summary/summary-content-skeleton';
import { getSecFilingViewerUrl } from '@/lib/email/url-utils';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

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
  params: Promise<{ id: string }>;
}

// Streaming layout: shell (breadcrumb + H1 + filing-date + View-Original link)
// flushes after the cheap shell-query (~50ms warm), then <SummaryBody> streams
// in once checkSummaryAccess resolves (auth + full summaryText fetch).
//
// Auth is enforced two places:
//   1. middleware.ts:380 — auth.protect() on /summary/* (gates the route)
//   2. components/summary/summary-body.tsx — checkSummaryAccess defense-in-depth
//
// Unexpected throws propagate to app/summary/[id]/error.tsx.
// notFound() renders app/summary/[id]/not-found.tsx.
export default async function SummaryPage({ params }: SummaryPageProps) {
  const { id } = await params;

  let shell;
  try {
    shell = await getSummaryShellMetadata(id);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="min-h-screen flex flex-col animate-fade-in" style={{ backgroundColor: 'var(--brand-bg)' }}>
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
                <BreadcrumbLink href="/dashboard/summaries">Summaries</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{shell.ticker.symbol}: {formatFilingType(shell.filingType)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" aria-label="Back to dashboard">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Back to dashboard</span>
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">
                {shell.ticker.symbol}: {formatFilingType(shell.filingType)} Summary
              </h1>
            </div>
            <div className="text-muted-foreground text-sm pl-10">
              Filed {format(new Date(shell.filingDate), 'PPP')}
              {' '}({formatDistanceToNow(new Date(shell.filingDate), { addSuffix: true })})
            </div>
            <div className="pl-10">
              <a
                href={getSecFilingViewerUrl(shell.filingUrl, shell.filingType)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                aria-label="View original SEC filing document (opens in new tab)"
              >
                View Original Filing
              </a>
            </div>
          </div>

          <Suspense fallback={<SummaryContentSkeleton />}>
            <SummaryBody summaryId={id} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
