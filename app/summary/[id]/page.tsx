import { currentUser } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Sidebar } from '@/components/layout/sidebar';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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

  // Check if user has access to this summary
  const userTicker = await prisma.ticker.findFirst({
    where: {
      userId: user.id,
      symbol: summary.ticker.symbol
    }
  });

  if (!userTicker) {
    // User doesn't track this ticker
    redirect('/dashboard');
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
              {/* This is where SummaryContent will go, we'll implement it next */}
              <div className="whitespace-pre-wrap">
                {summary.summaryText}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 