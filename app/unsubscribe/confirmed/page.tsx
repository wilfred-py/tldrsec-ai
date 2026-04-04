import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export const metadata = {
  title: 'Unsubscribe - tldrSEC',
};

export default async function UnsubscribeConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const isSuccess = params.status === 'success';
  const reason = params.reason;

  const messages: Record<string, { title: string; description: string }> = {
    success: {
      title: "You've been unsubscribed",
      description: "You won't receive marketing emails from tldrSEC. If you're a subscriber, you'll still get filing alerts.",
    },
    invalid: {
      title: 'Invalid link',
      description: 'This unsubscribe link is invalid. Please email support@tldrsec.app to unsubscribe.',
    },
    expired: {
      title: 'Link expired',
      description: 'This unsubscribe link has expired. Please email support@tldrsec.app to unsubscribe.',
    },
    error: {
      title: 'Something went wrong',
      description: 'Please try again or email support@tldrsec.app to unsubscribe.',
    },
  };

  const msg = isSuccess
    ? messages.success
    : messages[reason || 'error'] || messages.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">{msg.title}</CardTitle>
          <CardDescription>{msg.description}</CardDescription>
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
