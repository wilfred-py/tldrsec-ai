import { getPrismaClient } from '@/lib/db/prisma';
import { ResourceNotFoundError } from '@/lib/auth/access-control';

export type SummaryShellMetadata = {
  id: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  ticker: { symbol: string };
};

// Cheap projection used by the summary detail page shell. Returns only the
// fields the breadcrumb + H1 + filing-date + "View Original Filing" link need,
// so the shell can flush before the heavy summaryText fetch + auth gate runs
// inside the Suspense'd body. Primary-key lookup, small projection — ~50ms warm.
//
// Auth is NOT checked here. Middleware (middleware.ts:380) already gates
// /summary/* with auth.protect(), and the Suspense'd <SummaryBody> runs
// checkSummaryAccess for defense-in-depth before flushing the actual content.
// The fields returned here are non-sensitive metadata already visible in the
// user's dashboard activity feed and email.
export async function getSummaryShellMetadata(id: string): Promise<SummaryShellMetadata> {
  const prisma = getPrismaClient();
  const summary = await prisma.summary.findUnique({
    where: { id },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      filingUrl: true,
      ticker: { select: { symbol: true } },
    },
  });

  if (!summary || !summary.ticker) {
    throw new ResourceNotFoundError('Summary not found');
  }

  return summary;
}
