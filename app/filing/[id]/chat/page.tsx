import { currentUser } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getPrismaClient } from '@/lib/db/prisma';
import { ChatClient } from './chat-client';

export const dynamic = 'force-dynamic';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function FilingChatPage({ params }: ChatPageProps) {
  const { id: summaryId } = await params;
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  const prisma = getPrismaClient();

  const summary = await prisma.summary.findUnique({
    where: { id: summaryId },
    include: { ticker: true },
  });

  if (!summary) {
    notFound();
  }

  // Verify user owns this ticker
  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [{ id: user.id }, { authProviderId: user.id }],
    },
    select: { id: true },
  });

  if (!dbUser || summary.ticker.userId !== dbUser.id) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <main className="flex-1 flex flex-col">
        <ChatClient
          summaryId={summary.id}
          companyName={summary.ticker.companyName}
          ticker={summary.ticker.symbol}
          formType={summary.filingType}
          filingDate={summary.filingDate.toISOString()}
          importance={summary.importance}
          summaryText={summary.summaryText}
        />
      </main>
    </div>
  );
}
