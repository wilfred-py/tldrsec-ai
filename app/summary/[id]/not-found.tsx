import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function SummaryNotFound() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <main className="flex-1 flex items-center justify-center">
        <div className="container max-w-lg mx-auto px-6">
          <div className="brand-card text-center">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'var(--brand-primary-light)' }}
            >
              <FileQuestion className="h-7 w-7" style={{ color: 'var(--brand-primary)' }} />
            </div>
            <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--brand-secondary)' }}>Summary not found</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--brand-text-muted)' }}>
              This summary may have been removed or the link is incorrect.
            </p>
            <Link href="/dashboard" className="brand-button-primary inline-flex items-center justify-center">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
