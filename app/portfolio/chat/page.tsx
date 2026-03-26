import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getPrismaClient } from '@/lib/db/prisma';
import { PortfolioChatClient } from './chat-client';

export default async function PortfolioChatPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const email = user.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/dashboard');

  const prisma = getPrismaClient();
  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: {
      tickers: {
        select: {
          symbol: true,
          companyName: true,
          _count: { select: { summaries: true } },
        },
      },
    },
  });

  if (!dbUser || dbUser.tickers.length === 0) redirect('/dashboard');

  const tickers = dbUser.tickers.map(t => ({
    symbol: t.symbol,
    companyName: t.companyName,
    summaryCount: t._count.summaries,
  }));

  const totalSummaries = tickers.reduce((sum, t) => sum + t.summaryCount, 0);

  return <PortfolioChatClient tickers={tickers} totalSummaries={totalSummaries} />;
}
