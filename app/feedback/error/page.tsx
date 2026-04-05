import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export const metadata = {
  title: 'Feedback Error',
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: 'The feedback link is incomplete. Please use the link from your email.',
  invalid_vote: 'The feedback link contains an invalid vote. Please use the link from your email.',
  invalid_token: 'This feedback link is invalid or has expired. Links expire after 30 days.',
  server_error: 'Something went wrong saving your feedback. Please try again later.',
};

const DEFAULT_MESSAGE = 'Something went wrong processing your feedback.';

export default function FeedbackErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const message = ERROR_MESSAGES[searchParams.reason ?? ''] ?? DEFAULT_MESSAGE;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Unable to record feedback</CardTitle>
          <CardDescription>{message}</CardDescription>
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
