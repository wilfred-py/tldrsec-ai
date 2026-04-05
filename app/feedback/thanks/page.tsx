import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export const metadata = {
  title: 'Thanks for your feedback',
  robots: { index: false, follow: false },
};

export default function FeedbackThanksPage({
  searchParams,
}: {
  searchParams: { vote?: string };
}) {
  const isThumbsUp = searchParams.vote === 'up';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">
            {isThumbsUp ? 'Glad you found it useful!' : 'Thanks for the feedback'}
          </CardTitle>
          <CardDescription>
            {isThumbsUp
              ? 'Your feedback helps us keep delivering great summaries.'
              : 'Your feedback helps us improve our summaries.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You can close this tab now.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
