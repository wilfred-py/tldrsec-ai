'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { unsubscribeAction, UnsubscribeResult } from './actions';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { EVENTS } from '@/lib/analytics/events';

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
  const { trackEvent } = useAnalytics();
  // useEffect runs twice in React strict-mode dev. Guard the action so the
  // server roundtrip and the analytics event fire exactly once per mount.
  const firedRef = useRef(false);

  useEffect(() => {
    if (!token || firedRef.current) return;
    firedRef.current = true;

    (async () => {
      const res = await unsubscribeAction(token);
      setResult(res);
      if (res.status === 'success' || res.status === 'already_unsubscribed') {
        trackEvent(EVENTS.UNSUBSCRIBE_COMPLETED, {
          method: 'auto',
          outcome: res.status,
        });
      }
    })();
  }, [token, trackEvent]);

  if (!token) {
    return <UnsubscribeLayout>
      <StatusMessage
        title="Invalid Link"
        description="This unsubscribe link is invalid or has expired. If you'd like to unsubscribe, please use the link from a recent email."
      />
    </UnsubscribeLayout>;
  }

  if (!result) {
    return <UnsubscribeLayout>
      <div className="text-center">
        <p className="text-gray-500">Unsubscribing...</p>
      </div>
    </UnsubscribeLayout>;
  }

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
