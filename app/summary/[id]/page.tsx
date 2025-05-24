import { currentUser } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Sidebar } from '@/components/layout/sidebar';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { checkSummaryAccess, AccessDeniedError, ResourceNotFoundError } from '@/lib/auth/access-control';
import { SummaryContent } from '@/components/summary/summary-content';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface SummaryPageProps {
  params: {
    id: string;
  };
}

export default async function SummaryPage({ params }: SummaryPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  try {
    // Check if user has access to this summary
    await checkSummaryAccess(params.id);
  
    // Fetch summary with ticker information
    const summary = await prisma.summary.findUnique({
      where: { 
        id: params.id 
      },
      include: {
        ticker: true
      }
    });
  
    if (!summary) {
      notFound();
    }
  
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1">
          <Sidebar className="fixed inset-y-0 z-30 w-64 border-r" />
          <main className="flex-1 md:pl-64">
            <div className="container py-8 md:py-10 px-6 md:px-8 space-y-6">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Link href="/dashboard">
                    <Button variant="ghost" size="icon">
                      <ArrowLeft className="h-4 w-4" />
                      <span className="sr-only">Back to dashboard</span>
                    </Button>
                  </Link>
                  <h1 className="text-2xl font-bold">
                    {summary.ticker.symbol}: {summary.filingType} Summary
                  </h1>
                </div>
                <div className="text-muted-foreground text-sm">
                  Filed {format(new Date(summary.filingDate), 'PPP')}
                  {' '}({formatDistanceToNow(new Date(summary.filingDate), { addSuffix: true })})
                </div>
                <div className="mt-2">
                  <a
                    href={summary.filingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View Original Filing
                  </a>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <SummaryContent summary={summary} />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    
    if (error instanceof AccessDeniedError) {
      // Render access denied view
      return (
        <div className="flex min-h-screen flex-col">
          <div className="flex flex-1">
            <Sidebar className="fixed inset-y-0 z-30 w-64 border-r" />
            <main className="flex-1 md:pl-64">
              <div className="container py-8 md:py-10 px-6 md:px-8">
                <div className="flex items-center space-x-2 mb-6">
                  <Link href="/dashboard">
                    <Button variant="ghost" size="icon">
                      <ArrowLeft className="h-4 w-4" />
                      <span className="sr-only">Back to dashboard</span>
                    </Button>
                  </Link>
                  <h1 className="text-2xl font-bold">Summary Access Denied</h1>
                </div>
                
                <Alert variant="destructive" className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Access Denied</AlertTitle>
                  <AlertDescription>
                    You don't have permission to view this summary. To view summaries for a company, you must add its ticker to your watchlist.
                  </AlertDescription>
                </Alert>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-center">
                    <h2 className="text-xl font-semibold mb-4">Want to see this summary?</h2>
                    <p className="mb-6">Add this company's ticker to your watchlist to gain access to all of its summaries.</p>
                    <Link href="/dashboard/settings">
                      <Button>Go to Watchlist Settings</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      );
    }
    
    // For other errors, redirect to an error page
    redirect('/error');
  }
} 