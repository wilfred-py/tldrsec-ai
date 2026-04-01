'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { unsubscribeAction, UnsubscribeResult } from './actions';

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <UnsubscribeLayout>
        <div className="text-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </UnsubscribeLayout>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [result, setResult] = useState<UnsubscribeResult | null>(null);
  const [loading, setLoading] = useState(false);

  // No token = invalid
  if (!token) {
    return <UnsubscribeLayout>
      <StatusMessage
        title="Invalid Link"
        description="This unsubscribe link is invalid or has expired. If you'd like to unsubscribe, please use the link from a recent email."
      />
    </UnsubscribeLayout>;
  }

  const handleUnsubscribe = async () => {
    setLoading(true);
    const res = await unsubscribeAction(token);
    setResult(res);
    setLoading(false);
  };

  // Show result after POST
  if (result) {
    switch (result.status) {
      case 'success':
        return <UnsubscribeLayout>
          <StatusMessage
            title="You've been unsubscribed"
            description={`${result.maskedEmail} will no longer receive campaign emails from tldrSEC.`}
            footer="If this was a mistake, you can re-subscribe by signing up again at tldrsec.app."
          />
        </UnsubscribeLayout>;
      case 'already_unsubscribed':
        return <UnsubscribeLayout>
          <StatusMessage
            title="Already unsubscribed"
            description={`${result.maskedEmail} was already unsubscribed. You won't receive any more campaign emails.`}
          />
        </UnsubscribeLayout>;
      case 'invalid_token':
        return <UnsubscribeLayout>
          <StatusMessage
            title="Invalid Link"
            description="This unsubscribe link is invalid or has expired. If you'd like to unsubscribe, please use the link from a recent email."
          />
        </UnsubscribeLayout>;
      case 'error':
        return <UnsubscribeLayout>
          <StatusMessage
            title="Something went wrong"
            description={result.message}
            footer="Please try again or contact support at support@tldrsec.app."
          />
        </UnsubscribeLayout>;
    }
  }

  // Confirmation screen
  return (
    <UnsubscribeLayout>
      <div className="text-center space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Unsubscribe from tldrSEC</h1>
        <p className="text-gray-600">
          Click below to stop receiving campaign emails from tldrSEC.
          You can always re-subscribe later.
        </p>
        <button
          onClick={handleUnsubscribe}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Processing...' : 'Confirm Unsubscribe'}
        </button>
        <p className="text-xs text-gray-400">
          This only affects campaign and marketing emails. Transactional emails (filing summaries, account updates) are managed separately in your account settings.
        </p>
      </div>
    </UnsubscribeLayout>
  );
}

function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {children}
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <a href="https://tldrsec.app" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            tldrsec.app
          </a>
        </div>
      </div>
    </div>
  );
}

function StatusMessage({ title, description, footer }: { title: string; description: string; footer?: string }) {
  return (
    <div className="text-center space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="text-gray-600">{description}</p>
      {footer && <p className="text-sm text-gray-400">{footer}</p>}
    </div>
  );
}
