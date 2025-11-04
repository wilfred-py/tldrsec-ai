'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    // Track waitlist signup attempt
    await trackPageAnalytics('home', 'waitlist_signup_attempt', {
      utm_source: new URLSearchParams(window.location.search).get('utm_source'),
      utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
      utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
    });

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          source: 'waitlist_home',
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        }),
      });

      if (!response.ok) {
        throw new Error('Subscription failed');
      }

      const result = await response.json();
      setStatus('success');
      
      // Track successful waitlist signup
      await trackPageAnalytics('home', 'waitlist_signup_success');

    } catch (error) {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
      console.error('Waitlist signup error:', error);
    }
  };

  const [successMessage, setSuccessMessage] = useState('');

  if (status === 'success') {
    return (
      <div className="text-center p-6">
        <div className="text-green-600 text-2xl mb-2">✓</div>
        <h3 className="text-lg font-semibold mb-2">You&apos;re on the list!</h3>
        <p className="text-gray-600">
          {successMessage.includes('already') 
            ? 'You were already subscribed. You&apos;ll continue to receive updates when beta access is available.'
            : 'We&apos;ll notify you as soon as beta access is available. Check your email for confirmation.'
          }
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-lg p-4"
          disabled={status === 'loading'}
        />
        {errorMessage && (
          <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
        )}
      </div>
      
      <Button 
        type="submit" 
        disabled={status === 'loading'}
        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white p-4 text-lg"
      >
        {status === 'loading' ? 'Joining waitlist...' : 'Get early access now'}
      </Button>
      
      <p className="text-xs text-gray-500 text-center">
        No spam. Be first to access beta.
      </p>
    </form>
  );
}