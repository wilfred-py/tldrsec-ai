'use client';

import { useState } from 'react';

interface Props {
  initialEmail?: string;
  batch?: string;
}

export function FoundingClaimForm({ initialEmail, batch }: Props) {
  const [email, setEmail] = useState(initialEmail || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setError(null);
    if (!email) {
      setError('Enter your email to claim your seat.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/checkout/founding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, batch }),
      });
      const data = (await res.json()) as {
        sessionUrl?: string;
        error?: string;
        soldOut?: boolean;
      };
      if (res.status === 410 || data.soldOut) {
        setError('All 25 seats are claimed. Refresh the page to see the sold-out state.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setLoading(false);
        return;
      }
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
        return;
      }
      setError('Checkout session did not return a URL. Try again.');
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error. Try again.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      {!initialEmail && (
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      )}
      <button
        onClick={handleClaim}
        disabled={loading}
        className="block w-full rounded-lg bg-violet-600 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-400"
      >
        {loading ? 'Opening checkout...' : 'Get lifetime access'}
      </button>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
