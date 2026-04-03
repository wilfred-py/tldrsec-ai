import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function SummaryNotFound() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <main className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <div className="container max-w-lg mx-auto px-6">
          <Card className="border-muted">
            <CardContent className="p-8 text-center">
              <FileQuestion className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h1 className="text-xl font-semibold mb-2">Summary not found</h1>
              <p className="text-sm text-muted-foreground mb-6">
                This summary may have been removed or the link is incorrect.
              </p>
              <Button asChild>
                <Link href="/dashboard">Back to Dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
