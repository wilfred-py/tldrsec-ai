import { redirect, notFound } from 'next/navigation';
import { checkSummaryAccess, AccessDeniedError, ResourceNotFoundError } from '@/lib/auth/access-control';
import { SummaryContent } from './summary-content';

// Async server component that fetches the full summary (including the heavy
// summaryText) + runs the auth check via checkSummaryAccess. Rendered inside
// a <Suspense> boundary by app/summary/[id]/page.tsx so the shell (breadcrumb,
// H1, filing-date) can flush first while this fetch runs.
//
// Error paths:
//   - AccessDeniedError → redirect('/sign-in')  (defense-in-depth; middleware
//     already gates /summary/* but a race during sign-out could surface here)
//   - ResourceNotFoundError → notFound() (renders app/summary/[id]/not-found.tsx)
//   - Any other throw → propagates to app/summary/[id]/error.tsx
export async function SummaryBody({ summaryId }: { summaryId: string }) {
  try {
    const summary = await checkSummaryAccess(summaryId);
    return (
      <div className="animate-fade-in" aria-busy="false">
        <SummaryContent summary={summary} />
      </div>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    if (error instanceof AccessDeniedError) {
      redirect('/sign-in');
    }
    throw error;
  }
}
